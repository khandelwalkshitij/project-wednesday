// Fixed-step RK4 propagation with drag, SRP, burns, impacts and re-entry. Writes plan.csv.
import { REENTRY_ALT, normalizeConfig } from './config.js';
import { EARTH, R2D, TWO_PI, VERSION } from './constants.js';
import { getCr } from './cr-schedule.js';
import { earthRotation, poleRaDec, primeMeridianAngle } from './earth-orientation.js';
import { stateToKep } from './elements.js';
import { ATMO, atmosphereDensity, geoHeight, geodetic } from './environment.js';
import { hermite } from './interp.js';
import { fitLine, fmtHms, ltanFromMatrix, unwrapHours } from './ltan.js';
import { crc32, mvec } from './math.js';
import { makeParent } from './parent.js';
import { inShadow, sunDirection, sunDistanceAu } from './sun.js';
import { formatUtc, leap } from './time.js';
import { NUT00B } from '../data/nutation-iau2000b.js';
import { TDB_TERMS } from '../data/tdb-series.js';

// ---------------------------------------------------------------- propagation (SIM_012, SIM_016, SIM_018, SIM_029, SIM_038, SIM_041, SIM_044, SIM_045, SIM_093)
export var COLUMNS = [['sat_name', '-', '-'], ['epoch_utc', 'ISO 8601, UTC', '-'], ['t_s', 's since start_epoch', '-'], ['x_m', 'm', 'inertial'], ['y_m', 'm', 'inertial'], ['z_m', 'm', 'inertial'],
  ['vx_m_s', 'm/s', 'inertial'], ['vy_m_s', 'm/s', 'inertial'], ['vz_m_s', 'm/s', 'inertial'], ['parent_rot_deg', 'deg', 'prime meridian angle W about the parent pole'],
  ['in_shadow', '1 in Earth shadow (cylindrical) / 0 sunlit / blank when no Sun is modelled', '-']];

export function fmtT(t) { return String(Math.round(t * 1e6) / 1e6); }

export function* simulate(rawConfig) {
  var c = normalizeConfig(rawConfig), P = makeParent(c.parent), N = c.sats.length, h = c.dt, tt0 = c.epoch.tt, eps = 1e-9 * h, isE = P.shape === 'earth_default', drag = c.drag, srp = c.srp, P_SRP = 4.560e-6;
  var F = function (n) { return new Float64Array(n); };
  var y = F(6 * N), yn = F(6 * N), f0 = F(6 * N), f1 = F(6 * N), k2 = F(6), k3 = F(6), k4 = F(6), tmp = F(6), pw0 = F(N), pw1 = F(N), W = F(N), EB = F(N), JB = F(N), dvT = F(N);
  var bc = c.sats.map(function (s) { return drag ? 0.5 * s.cd * s.area / s.mass : 0; }), bi = new Int32Array(N), segList = new Array(N), impS = new Array(N);
  var alive = [], tImp = F(N), E0 = F(N), J0 = F(N), dE = F(N), dJ = F(N), impacts = [], lines = [], LT = [];
  var ra = EARTH.a + REENTRY_ALT, rb2 = EARTH.a * (1 - EARTH.f) + REENTRY_ALT;
  function surf(x, yy, z, p) { if (!drag) return P.surface(x, yy, z, p); var zz = x * p[0] + yy * p[1] + z * p[2]; return Math.sqrt((x * x + yy * yy + z * z - zz * zz) / (ra * ra) + zz * zz / (rb2 * rb2)) - 1; }
  // derivative of one satellite's state; returns non-gravitational power per unit mass [W/kg] (0 without drag/srp)
  function deriv(s, so, p, out, oo, b, satObj, t, sd) {
    var x = s[so], yy = s[so + 1], z = s[so + 2], vx = s[so + 3], vy = s[so + 4], vz = s[so + 5];
    out[oo] = vx; out[oo + 1] = vy; out[oo + 2] = vz; P.accel(x, yy, z, p, out, oo + 3);
    var pwr = 0;
    if (b) {
      var zz = x * p[0] + yy * p[1] + z * p[2], hgt = geoHeight(Math.sqrt(Math.max(0, x * x + yy * yy + z * z - zz * zz)), zz);
      if (hgt <= 1.5e6) {
        var w = EARTH.omega, rx = vx - w * (p[1] * z - p[2] * yy), ry = vy - w * (p[2] * x - p[0] * z), rz = vz - w * (p[0] * yy - p[1] * x);   // velocity relative to the co-rotating air
        var k = -b * atmosphereDensity(hgt) * Math.sqrt(rx * rx + ry * ry + rz * rz);
        out[oo + 3] += k * rx; out[oo + 4] += k * ry; out[oo + 5] += k * rz;
        pwr += k * (rx * vx + ry * vy + rz * vz);
      }
    }
    if (srp && satObj && satObj.area && sd && !inShadow(x, yy, z, sd, EARTH.a)) {
      var crVal = getCr(satObj.cr, t);
      var au = sunDistanceAu(tt0 + t), srp_k = P_SRP * crVal * satObj.area / satObj.mass / (au * au);   // P_SRP is at 1 AU
      var ax = -srp_k * sd[0], ay = -srp_k * sd[1], az = -srp_k * sd[2];
      out[oo + 3] += ax; out[oo + 4] += ay; out[oo + 5] += az;
      pwr += ax * vx + ay * vy + az * vz;
    }
    return pwr;
  }
  function energy(s, o, p) {
    var x = s[o], yy = s[o + 1], z = s[o + 2], vx = s[o + 3], vy = s[o + 4], vz = s[o + 5], e = (vx * vx + vy * vy + vz * vz) / 2 - P.potential(x, yy, z, p);
    return [e, e - P.omega * (p[0] * (yy * vz - z * vy) + p[1] * (z * vx - x * vz) + p[2] * (x * vy - yy * vx))];
  }
  // one RK4 step of length hh from (yA, fA); writes yB and returns the non-gravitational work done over the step
  function stepOne(yA, oA, fA, oF, pwA, hh, pM, pB, b, yB, oB, satObj, tA, sdA, sdM, sdB) {
    var k, q2, q3, q4;
    for (k = 0; k < 6; k++) tmp[k] = yA[oA + k] + 0.5 * hh * fA[oF + k]; q2 = deriv(tmp, 0, pM, k2, 0, b, satObj, tA + 0.5 * hh, sdM);
    for (k = 0; k < 6; k++) tmp[k] = yA[oA + k] + 0.5 * hh * k2[k]; q3 = deriv(tmp, 0, pM, k3, 0, b, satObj, tA + 0.5 * hh, sdM);
    for (k = 0; k < 6; k++) tmp[k] = yA[oA + k] + hh * k3[k]; q4 = deriv(tmp, 0, pB, k4, 0, b, satObj, tA + hh, sdB);
    for (k = 0; k < 6; k++) yB[oB + k] = yA[oA + k] + hh / 6 * (fA[oF + k] + 2 * k2[k] + 2 * k3[k] + k4[k]);
    return hh / 6 * (pwA + 2 * q2 + 2 * q3 + q4);
  }
  // surface (or re-entry) crossing inside one step: checked at the midpoint and the end, then bisected on the interpolant
  function findImpact(ya, fa, yb, fb, o, hh, tA, pM, pB, i) {
    var hi = -1, k; hermite(ya, fa, yb, fb, o, hh, 0.5, tmp);
    if (surf(tmp[0], tmp[1], tmp[2], pM) <= 0) hi = 0.5; else if (surf(yb[o], yb[o + 1], yb[o + 2], pB) <= 0) hi = 1;
    if (hi < 0) return Infinity;
    var lo = hi === 1 ? 0.5 : 0;
    for (k = 0; k < 50; k++) { var mid = 0.5 * (lo + hi); hermite(ya, fa, yb, fb, o, hh, mid, tmp); if (surf(tmp[0], tmp[1], tmp[2], pB) <= 0) hi = mid; else lo = mid; }
    hermite(ya, fa, yb, fb, o, hh, hi, tmp); impS[i] = Array.from(tmp); return tA + hi * hh;
  }
  function applyBurn(s, B) {
    if (B.frame === 'inertial') { s[3] += B.dv[0]; s[4] += B.dv[1]; s[5] += B.dv[2]; return; }
    var r = Math.hypot(s[0], s[1], s[2]), rx = s[0] / r, ry = s[1] / r, rz = s[2] / r, hx = s[1] * s[5] - s[2] * s[4], hy = s[2] * s[3] - s[0] * s[5], hz = s[0] * s[4] - s[1] * s[3], hn = Math.hypot(hx, hy, hz);
    hx /= hn; hy /= hn; hz /= hn; var tx = hy * rz - hz * ry, ty = hz * rx - hx * rz, tz = hx * ry - hy * rx;
    s[3] += B.dv[0] * rx + B.dv[1] * tx + B.dv[2] * hx; s[4] += B.dv[0] * ry + B.dv[1] * ty + B.dv[2] * hy; s[5] += B.dv[0] * rz + B.dv[1] * tz + B.dv[2] * hz;
  }
  function row(i, epoch, t, s, o, rot, sd) {
    return c.sats[i].name + ',' + epoch + ',' + t + ',' + s[o].toFixed(4) + ',' + s[o + 1].toFixed(4) + ',' + s[o + 2].toFixed(4) + ',' + s[o + 3].toFixed(7) + ',' + s[o + 4].toFixed(7) + ',' + s[o + 5].toFixed(7) + ',' + rot +
      ',' + (sd ? (inShadow(s[o], s[o + 1], s[o + 2], sd, EARTH.a) ? '1' : '0') : '');
  }
  function rotDeg(t) { return (primeMeridianAngle(P.matrixAt(tt0 + t, t)) * R2D).toFixed(7); }
  function addLt(i, t, M, arr, off) {
    var v = ltanFromMatrix(M, arr.subarray(off, off + 6), tt0 + t, P.dut1); if (isNaN(v)) return;
    var L = LT[i]; if (L.h.length) v = unwrapHours(L.h[L.h.length - 1], v); L.t.push(t); L.h.push(v);
  }
  var pA = P.poleAt(tt0), pm, p1, i, o, k;
  var ep0 = formatUtc(tt0), rot0 = rotDeg(0), M0 = isE ? earthRotation(tt0, P.dut1).M : null, sd0 = isE ? sunDirection(tt0) : null, summary = [];
  for (i = 0; i < N; i++) {
    for (k = 0; k < 6; k++) y[6 * i + k] = c.sats[i].state[k];
    pw0[i] = deriv(y, 6 * i, pA, f0, 6 * i, bc[i], c.sats[i], 0, sd0); alive.push(true); tImp[i] = Infinity;
    var e0 = energy(y, 6 * i, pA); E0[i] = e0[0]; J0[i] = e0[1];
    lines.push(row(i, ep0, '0', y, 6 * i, rot0, sd0));
    LT.push({ t: [], h: [] }); if (isE) addLt(i, 0, M0, y, 6 * i);
    var el = stateToKep(P.mu, c.sats[i].state), closed = el.a > 0 && el.e < 1;     // orbit summary at start_epoch (SIM_082)
    summary.push(closed ? { period: TWO_PI * Math.sqrt(el.a * el.a * el.a / P.mu), hp: el.a * (1 - el.e) - P.radius, ha: el.a * (1 + el.e) - P.radius } : null);
  }
  var kOut = 1, nAlive = N;
  var sdA = sd0, sdB, sdM;
  for (var n = 0; n < c.nSteps && nAlive > 0; n++) {
    var ta = n * h, tb = (n + 1) * h, ti;
    pm = P.poleAt(tt0 + ta + h / 2); p1 = P.poleAt(tt0 + tb);
    sdM = isE ? sunDirection(tt0 + ta + h / 2) : null;
    sdB = isE ? sunDirection(tt0 + tb) : null;
    for (i = 0; i < N; i++) {
      if (!alive[i]) continue; o = 6 * i; segList[i] = null;
      var bl = c.burns[i];
      if (bi[i] < bl.length && bl[bi[i]].t < tb - eps) {       // step containing one or more burns: split at each burn time
        var segs = [], cur = y.slice(o, o + 6), fc = f0.slice(o, o + 6), pc = pw0[i], tc = ta, pq = pA;
        while (bi[i] < bl.length && bl[bi[i]].t < tb - eps) {
          var B = bl[bi[i]++], tq = Math.max(B.t, tc);
          if (tq > tc + 1e-9) {
            var hh = tq - tc, nx = F(6), fx = F(6), pmq = P.poleAt(tt0 + tc + hh / 2); pq = P.poleAt(tt0 + tq);
            var sdmq = isE ? sunDirection(tt0 + tc + hh / 2) : null, sdq_end = isE ? sunDirection(tt0 + tq) : null;
            W[i] += stepOne(cur, 0, fc, 0, pc, hh, pmq, pq, bc[i], nx, 0, c.sats[i], tc, sdA, sdmq, sdq_end); deriv(nx, 0, pq, fx, 0, bc[i], c.sats[i], tq, sdq_end);
            segs.push({ t0: tc, t1: tq, y0: cur, f0: fc, y1: nx, f1: fx, pm: pmq, pb: pq }); cur = nx.slice();
          }
          var e1 = energy(cur, 0, pq); applyBurn(cur, B); var e2 = energy(cur, 0, pq);
          EB[i] += e2[0] - e1[0]; JB[i] += e2[1] - e1[1]; dvT[i] += Math.hypot(B.dv[0], B.dv[1], B.dv[2]);
          fc = F(6); pc = deriv(cur, 0, pq, fc, 0, bc[i], c.sats[i], tq, isE ? sunDirection(tt0 + tq) : null); tc = tq;
        }
        var hl = tb - tc, ye = F(6), fe = F(6), pml = P.poleAt(tt0 + tc + hl / 2);
        var sdml = isE ? sunDirection(tt0 + tc + hl / 2) : null;
        W[i] += stepOne(cur, 0, fc, 0, pc, hl, pml, p1, bc[i], ye, 0, c.sats[i], tc, isE ? sunDirection(tt0 + tc) : null, sdml, sdB); pw1[i] = deriv(ye, 0, p1, fe, 0, bc[i], c.sats[i], tb, sdB);
        segs.push({ t0: tc, t1: tb, y0: cur, f0: fc, y1: ye, f1: fe, pm: pml, pb: p1 });
        yn.set(ye, o); f1.set(fe, o); segList[i] = segs;
        for (k = 0; k < segs.length; k++) { var sg = segs[k]; ti = findImpact(sg.y0, sg.f0, sg.y1, sg.f1, 0, sg.t1 - sg.t0, sg.t0, sg.pm, sg.pb, i); if (ti < Infinity) { tImp[i] = ti; break; } }
      } else {
        W[i] += stepOne(y, o, f0, o, pw0[i], h, pm, p1, bc[i], yn, o, c.sats[i], ta, sdA, sdM, sdB); pw1[i] = deriv(yn, o, p1, f1, o, bc[i], c.sats[i], tb, sdB);
        ti = findImpact(y, f0, yn, f1, o, h, ta, pm, p1, i); if (ti < Infinity) tImp[i] = ti;
      }
    }
    while (kOut < c.nOut && kOut * c.outStep <= tb + eps) {
      var tk = kOut * c.outStep, s = Math.min(1, Math.max(0, (tk - ta) / h)), epoch = formatUtc(tt0 + tk), rot = rotDeg(tk), ts = fmtT(tk), Mk = isE ? earthRotation(tt0 + tk, P.dut1).M : null, sdk = isE ? sunDirection(tt0 + tk) : null;
      for (i = 0; i < N; i++) {
        if (!alive[i] || tk > tImp[i]) continue;
        var src = yn, so = 6 * i;
        if (segList[i]) {
          var sl = segList[i], q = sl.length - 1; while (q > 0 && sl[q].t0 > tk + eps) q--;
          var hs = sl[q].t1 - sl[q].t0; hermite(sl[q].y0, sl[q].f0, sl[q].y1, sl[q].f1, 0, hs, hs > 0 ? Math.min(1, Math.max(0, (tk - sl[q].t0) / hs)) : 1, tmp); src = tmp; so = 0;
        } else if (!(s > 1 - 1e-12)) { hermite(y, f0, yn, f1, 6 * i, h, s, tmp); src = tmp; so = 0; }
        lines.push(row(i, epoch, ts, src, so, rot, sdk)); if (Mk) addLt(i, tk, Mk, src, so);
      }
      kOut++;
    }
    for (i = 0; i < N; i++) {
      if (!alive[i]) continue; o = 6 * i;
      if (tImp[i] < Infinity) {
        var is = impS[i], rb = mvec(P.matrixAt(tt0 + tImp[i], tImp[i]), [is[0], is[1], is[2]]), g = geodetic(rb[0], rb[1], rb[2], P.radius, P.flattening);
        impacts.push({ name: c.sats[i].name, kind: drag ? 'reentry' : 'impact', t: tImp[i], epoch: formatUtc(tt0 + tImp[i]), bodyFixed: rb, latDeg: g.lat * R2D, lonDeg: g.lon * R2D, speed: Math.hypot(is[3], is[4], is[5]) });
        alive[i] = false; nAlive--; continue;
      }
      var en = energy(yn, o, p1);     // energy residual after removing drag work and burn energy: what is left is numerical error
      dE[i] = Math.max(dE[i], Math.abs((en[0] - E0[i] - W[i] - EB[i]) / E0[i])); dJ[i] = Math.max(dJ[i], Math.abs((en[1] - J0[i] - JB[i]) / J0[i]));
    }
    var sw = y; y = yn; yn = sw; sw = f0; f0 = f1; f1 = sw; sw = pw0; pw0 = pw1; pw1 = sw; pA = p1; sdA = sdB;
    if (n % 400 === 399) yield (n + 1) / c.nSteps;
  }
  // header (SIM_055, SIM_062, SIM_066, SIM_069)
  var rd = poleRaDec(P.poleAt(tt0)), H = [];
  H.push('# plan.csv written by the orbital simulator');
  H.push('# sim_version: ' + VERSION);
  H.push('# inertial_frame: ' + P.frame + '; centre: ' + P.centre);
  H.push('# body_fixed_frame: ' + P.bodyFrame);
  var fmArr = ['gravity']; if (drag) fmArr.push('drag (exponential atmosphere, co-rotating; re-entry declared at 80 km)'); if (srp) fmArr.push('solar radiation pressure (cannonball, P=4.56e-6 N/m² at 1 AU scaled by 1/r², cylindrical shadow)'); H.push('# force_model: ' + fmArr.join(' + '));
  H.push('# parent_pole_ra_deg: ' + (rd[0] * R2D).toFixed(9));
  H.push('# parent_pole_dec_deg: ' + (rd[1] * R2D).toFixed(9));
  H.push('# data_file: name=' + leap.name + '; version=' + leap.version + '; crc32=' + leap.checksum + '; source=' + leap.source);
  H.push('# data_file: name=builtin_models; version=' + VERSION + '; crc32=' + crc32(JSON.stringify([NUT00B, TDB_TERMS, EARTH, ATMO])) + '; source=WGS84, EGM96 zonals J2-J4, IAU 2006 precession, IAU 2000B nutation, Fairhead-Bretagnon TDB series');
  H.push('# config: ' + JSON.stringify(rawConfig));
  COLUMNS.forEach(function (col) { H.push('# column: ' + col[0] + '; unit: ' + col[1] + '; frame: ' + (col[2] === 'inertial' ? P.frame : col[2])); });
  var hasJ = P.shape === 'sphere_uniform';   // Earth's pole moves (precession-nutation), so only inertial energy is conserved there
  var report = c.sats.map(function (sat, i) {
    var L = LT[i], ok = isE && L.h.length > 1, fit = ok ? fitLine(L.t, L.h) : null, sm = summary[i];
    return { name: sat.name, energyDrift: dE[i], jacobiDrift: hasJ ? dJ[i] : null, impact: null, dragWork: drag && !srp ? W[i] : null, nonGravWork: drag || srp ? W[i] : null, burnEnergy: EB[i], dvTotal: dvT[i], burns: c.burns[i].length,
      period: sm ? sm.period : null, perigeeAlt: sm ? sm.hp : null, apogeeAlt: sm ? sm.ha : null,
      ltanStart: ok ? L.h[0] : null, ltanEnd: ok ? L.h[L.h.length - 1] : null, ltanDrift: ok ? fit[0] * 60 * 86400 : null };
  });
  impacts.forEach(function (im) { report.filter(function (r) { return r.name === im.name; })[0].impact = im; });
  report.forEach(function (r) {
    H.push('# report: sat=' + r.name + '; energy_rel_drift=' + r.energyDrift.toExponential(3) + (hasJ ? '; jacobi_rel_drift=' + r.jacobiDrift.toExponential(3) : '') +
      (r.period !== null ? '; period_s=' + r.period.toFixed(3) + '; perigee_alt_m=' + r.perigeeAlt.toFixed(1) + '; apogee_alt_m=' + r.apogeeAlt.toFixed(1) : '') +
      (drag && !srp ? '; drag_work_j_per_kg=' + r.dragWork.toExponential(6) : '') + (srp ? '; nongrav_work_j_per_kg=' + r.nonGravWork.toExponential(6) : '') + (r.burns ? '; burns=' + r.burns + '; dv_total_m_s=' + r.dvTotal.toFixed(6) : '') +
      (r.ltanStart !== null ? '; ltan_start=' + fmtHms(r.ltanStart) + '; ltan_end=' + fmtHms(r.ltanEnd) + '; ltan_drift_min_per_day=' + r.ltanDrift.toFixed(4) : ''));
    if (r.impact) H.push('# impact: sat=' + r.name + '; kind=' + r.impact.kind + '; epoch_utc=' + r.impact.epoch + '; t_s=' + r.impact.t.toFixed(3) + '; body_fixed_m=' + r.impact.bodyFixed.map(function (v) { return v.toFixed(3); }).join(' ') +
      '; lat_deg=' + r.impact.latDeg.toFixed(5) + '; lon_deg=' + r.impact.lonDeg.toFixed(5));
  });
  H.push(COLUMNS.map(function (col) { return col[0]; }).join(','));
  return { csv: H.join('\n') + '\n' + lines.join('\n') + '\n', report: report, rows: lines.length, steps: Math.min(c.nSteps, n), dt: h, parent: { shape: P.shape, mu: P.mu, radius: P.radius } };
}

export function run(rawConfig) { var g = simulate(rawConfig), r; do { r = g.next(); } while (!r.done); return r.value; }
