// Baseline acceptance tests (SIM_001 to SIM_075) against ERFA reference values.
import { S, leapText, fixture } from './setup.mjs';
const truth = fixture('erfa_truth.json');
let fails = 0;
function check(id, what, ok, detail) { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (detail !== undefined ? '  [' + detail + ']' : '')); }
function throwsWith(fn, re) { try { fn(); } catch (e) { return re.test(e.message) ? true : (console.log('   unexpected message: ' + e.message), false); } return false; }
const D = Math.PI / 180, clone = o => JSON.parse(JSON.stringify(o));
const earthCfg = { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60,
  satellites: { count: 1, mass_kg: 150, name_prefix: 'FF', orbits: [{ type: 'keplerian', a_m: 6928137, e: 0.001, i_deg: 97.6, raan_deg: 40, argp_deg: 30, ta_deg: 10 }] } };
const sphCfg = { parent: { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 85, pole_dec_deg: -60, prime_meridian_deg: 20 } },
  start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: { type: 'rk4', time_step_s: 20 }, output_step_s: 120,
  satellites: { count: 1, mass_kg: 150, names: ['probe'], orbits: [{ type: 'keplerian', a_m: 600, e: 0, i_deg: 30, raan_deg: 0, argp_deg: 0, ta_deg: 0 }] } };
const rows = csv => csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(','));

// SIM_002
{ const P = S.makeParent({ shape: 'sphere_uniform', radius: 250, density: 1900, spinPeriod: 1e4, poleRa: 0, poleDec: 1, w0: 0 }), o = [0, 0, 0]; let w = 0;
  for (const r of [[300, 0, 0], [123.4, -567.8, 910.1], [1e5, 2e5, -3e5]]) { P.accel(r[0], r[1], r[2], null, o, 0); const rr = Math.hypot(...r); w = Math.max(w, Math.abs(Math.hypot(...o) / (P.mu / rr / rr) - 1)); }
  check('SIM_002', 'sphere accel matches mu/r^2 to 1e-12', w < 1e-12, w.toExponential(2)); }
// SIM_003
{ const P = S.makeParent({ shape: 'earth_default' }), z = [0, 0, 1], o = [0, 0, 0]; P.accel(S.EARTH.a, 0, 0, z, o, 0);
  const g = Math.hypot(...o) - S.EARTH.omega ** 2 * S.EARTH.a; check('SIM_003', 'g at equator 9.780 +-0.001', Math.abs(g - 9.780) < 0.001, g.toFixed(5));
  let w = 0; const p = [0.01, -0.02, Math.sqrt(1 - 5e-4)];
  for (const r of [[7e6, 1e6, 2e6], [-3e6, 5e6, -4.5e6], [1e6, 1e6, 7e6]]) { P.accel(r[0], r[1], r[2], p, o, 0); const hh = 30;
    for (let k = 0; k < 3; k++) { const a = r.slice(), b = r.slice(); a[k] += hh; b[k] -= hh; const gk = (P.potential(a[0], a[1], a[2], p) - P.potential(b[0], b[1], b[2], p)) / (2 * hh); w = Math.max(w, Math.abs(gk - o[k]) / Math.hypot(...o)); } }
  check('SIM_003', 'zonal accel (J2-J4) equals gradient of potential', w < 1e-9, w.toExponential(2));
  // SSO RAAN drift: 550 km, inclination from the J2 secular formula, elements referred to the true equator of date, 5-day run, linear fit of RAAN
  const a = S.EARTH.a + 550e3, n = Math.sqrt(S.EARTH.mu / a ** 3), target = 0.9856 * D / 86400, ci = -target / (1.5 * n * S.EARTH.J2 * (S.EARTH.a / a) ** 2), inc = Math.acos(ci) / D;
  const pz = S.earthPole(S.parseEpoch(earthCfg.start_epoch).tt), nx = Math.hypot(pz[0], pz[1]), ex = [-pz[1] / nx, pz[0] / nx, 0], ey = [pz[1] * ex[2] - pz[2] * ex[1], pz[2] * ex[0] - pz[0] * ex[2], pz[0] * ex[1] - pz[1] * ex[0]];
  const toG = v => [0, 1, 2].map(k => ex[k] * v[0] + ey[k] * v[1] + pz[k] * v[2]), toT = v => [ex, ey, pz].map(e => e[0] * v[0] + e[1] * v[1] + e[2] * v[2]);
  const st = S.kepToState(S.EARTH.mu, a, 0, inc * D, 40 * D, 0, 45 * D);
  const c = clone(earthCfg); c.duration = 5 * 86400; c.output_step_s = 600; c.satellites.orbits[0] = { type: 'cartesian', r_m: toG(st.slice(0, 3)), v_m_s: toG(st.slice(3)) };
  const R = rows(S.run(c).csv); let sx = 0, sy = 0, sxx = 0, sxy = 0, prev = null, off = 0;
  for (const q of R) { const g = q.slice(3, 9).map(Number); let ra = S.stateToKep(S.EARTH.mu, toT(g.slice(0, 3)).concat(toT(g.slice(3)))).raan; if (prev !== null && ra - prev < -Math.PI) off += 2 * Math.PI; if (prev !== null && ra - prev > Math.PI) off -= 2 * Math.PI; prev = ra; ra += off; const t = +q[2]; sx += t; sy += ra; sxx += t * t; sxy += t * ra; }
  const rate = (R.length * sxy - sx * sy) / (R.length * sxx - sx * sx) / D * 86400;
  check('SIM_003', 'SSO RAAN drift 0.9856 deg/day +-0.5% (i=' + inc.toFixed(3) + ')', Math.abs(rate / 0.9856 - 1) < 0.005, rate.toFixed(5) + ' deg/day');
  check('SIM_003', 'atmosphere and dipole models present', Math.abs(S.atmosphereDensity(400e3) - 3.725e-12) < 1e-15 && Math.abs(Math.hypot(...S.magneticField([S.EARTH.a, 0, 0])) - 3.0e-5) < 2e-6,
    S.atmosphereDensity(400e3).toExponential(3) + ' kg/m3, ' + (Math.hypot(...S.magneticField([S.EARTH.a, 0, 0])) * 1e9).toFixed(0) + ' nT'); }
// SIM_006 / SIM_068
{ const ra = 85 * D, dec = -60 * D, w0 = 0.3, Pd = 15480, om = 2 * Math.PI / Pd, b = [100, 200, -50];
  const i0 = S.mTvec(S.bodyMatrix(ra, dec, w0), b), i1 = S.mTvec(S.bodyMatrix(ra, dec, w0 + om * Pd), b), d = Math.hypot(i0[0] - i1[0], i0[1] - i1[1], i0[2] - i1[2]) / Math.hypot(...b);
  check('SIM_006', 'body-fixed point returns after one spin period (1e-9)', d < 1e-9, d.toExponential(2));
  const M = S.bodyMatrix(ra, dec, 1.234), back = S.mvec(M, S.mTvec(M, b)), e = Math.hypot(back[0] - b[0], back[1] - b[1], back[2] - b[2]) / Math.hypot(...b);
  const pr = S.poleRaDec([M[6], M[7], M[8]]), wq = S.primeMeridianAngle(M);
  check('SIM_068', 'body-fixed <-> inertial round trip (1e-9); pole and W recovered', e < 1e-9 && Math.abs(pr[0] - ra) < 1e-12 && Math.abs(pr[1] - dec) < 1e-12 && Math.abs(wq - 1.234) < 1e-12, e.toExponential(2)); }
// SIM_008, 012, 013, 015, 021 and other input errors
{ const bad = (mut, re) => { const c = clone(earthCfg); mut(c); return throwsWith(() => S.normalizeConfig(c), re); };
  check('SIM_001', 'unknown / non-baseline parent_shape rejected', bad(c => c.parent.shape = 'custom', /not part of this build/) && bad(c => c.parent.shape = 'cube', /parent\.shape/));
  check('SIM_008', 'mass <= 0 or > 10000 kg rejected', bad(c => c.satellites.mass_kg = 0, /mass_kg/) && bad(c => c.satellites.mass_kg = 10000.1, /mass_kg/) && !bad(c => c.satellites.mass_kg = 10000, /./));
  check('SIM_012', 'N < 1 or > 100 rejected', bad(c => c.satellites.count = 0, /count/) && bad(c => c.satellites.count = 101, /count/) && bad(c => c.satellites.count = 2.5, /count/));
  check('SIM_013', 'duplicate names rejected', bad(c => { c.satellites.count = 2; delete c.satellites.name_prefix; c.satellites.names = ['a', 'a']; c.satellites.orbits.push(c.satellites.orbits[0]); }, /duplicate name/));
  check('SIM_015', 'duration and end_epoch together rejected', bad(c => c.end_epoch = '2026-11-11T06:30:00.000 UTC', /not both/));
  check('SIM_015', 'ISO 8601 duration and end epoch accepted', S.parseDuration('P1DT6H', 'd') === 108000 && S.parseDuration('PT90M', 'd') === 5400 &&
    (() => { const c = clone(earthCfg); delete c.duration; c.end_epoch = '2026-11-11T06:30:00.000 UTC'; return S.normalizeConfig(c).duration === 86400; })());
  check('SIM_021', 'orbit list length != N rejected', bad(c => c.satellites.count = 2, /orbits: must be a list of 2/));
  check('SIM_014', 'epoch without time scale rejected', bad(c => c.start_epoch = '2026-11-10T06:30:00.000', /SCALE/));
  check('SIM_016', 'non-baseline integrator rejected', bad(c => c.integrator.type = 'dop853', /not part of this build/)); }
// SIM_014 / SIM_060 / SIM_067 vs ERFA
{ let wt = 0, wm = 0, wd = 0, datOk = true;
  for (const T of truth) {
    const tt = S.parseEpoch(T.utc + ' UTC').tt; wt = Math.max(wt, Math.abs(tt - T.tt_s));
    datOk = datOk && Math.abs((tt - 32.184) - S.parseEpoch(T.utc + ' TAI').tt + 32.184 - T.dat) < 1e-6;
    const M = S.earthRotation(tt, T.dut1).M; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) wm = Math.max(wm, Math.abs(M[3 * i + j] - T.M[i][j]));
    wd = Math.max(wd, Math.abs(S.tdbMinusTt(tt) - T.tdb_minus_tt)); }
  check('SIM_067', 'GCRF->ITRF matches ERFA c2t06a (IAU 2006/2000A) within 1 m at the surface', wm * 6378137 * Math.sqrt(3) < 1, (wm * 6378137).toFixed(4) + ' m max element error x R');
  // same instant written in five scales
  const utc = '2026-11-10T06:30:00.000', base = S.parseEpoch(utc + ' UTC').tt, g = truth.find(t => t.utc.startsWith('2026-11-10T06:30')).tdb_minus_tt;
  const alt = [S.parseEpoch('2026-11-10T06:30:37.000 TAI').tt, S.parseEpoch('2026-11-10T06:31:09.184 TT').tt, S.parseEpoch('2026-11-10T06:30:18.000 GPS').tt,
    S.parseEpoch('2026-11-10T06:31:' + (9.184 + g).toFixed(9).padStart(12, '0') + ' TDB').tt];
  const sp = Math.max(...alt.map(v => Math.abs(v - base)));
  check('SIM_014', 'same instant in UTC/TAI/TT/GPS/TDB gives identical internal time within 1 us', sp < 1e-6 && wt < 1e-6, 'spread ' + sp.toExponential(2) + ' s, vs ERFA ' + wt.toExponential(2) + ' s, TDB-TT vs ERFA ' + wd.toExponential(2) + ' s');
  check('SIM_060', 'UTC-TAI is 37 s for 2026 epochs', datOk && Math.abs(S.parseEpoch('2026-06-01T00:00:00 TAI').tt - S.parseEpoch('2026-05-31T23:59:23 UTC').tt) < 1e-9);
  check('SIM_014', 'UTC formatting incl. leap second', S.formatUtc(S.parseEpoch('2016-12-31T23:59:60.250 UTC').tt) === '2016-12-31T23:59:60.250Z' && S.formatUtc(S.parseEpoch('2017-01-01T00:00:00.000 UTC').tt) === '2017-01-01T00:00:00.000Z' && S.formatUtc(base) === utc + 'Z');
  const mod = JSON.parse(leapText); mod.entries.push(['2026-07-01', 38]); mod.version = '2026-07-01'; const crcOld = S.leapInfo().checksum;
  S.setLeapSeconds(mod, JSON.stringify(mod));
  const d38 = S.parseEpoch('2026-11-10T06:30:00.000 UTC').tt - base, hdr = S.run(earthCfg).csv.split('\n').filter(l => l.startsWith('# data_file')).join('|');
  check('SIM_060', 'replacing the leap-second file changes the offset', d38 === 1, 'offset now ' + (37 + d38) + ' s');
  check('SIM_062', 'data manifest lists files with version and checksum; checksum changes with the file', /version=2026-07-01/.test(hdr) && !hdr.includes(crcOld) && /builtin_models/.test(hdr), hdr.match(/crc32=\w+/g).join(' '));
  S.setLeapSeconds(JSON.parse(leapText), leapText); }
// SIM_019 / SIM_020
{ let w = 0; const mu = S.EARTH.mu;
  for (const el of [[7e6, 0.01, 51.6, 40, 30, 10], [2.6e7, 0.72, 63.4, 300, 270, 200], [4.2e7, 0.3, 120, 10, 350, 359], [6.9e6, 0.2, 5, 190, 100, 77]]) {
    const st = S.kepToState(mu, el[0], el[1], el[2] * D, el[3] * D, el[4] * D, el[5] * D), k = S.stateToKep(mu, st), st2 = S.kepToState(mu, k.a, k.e, k.i, k.raan, k.argp, k.ta);
    const back = [k.a, k.e, k.i / D, k.raan / D, k.argp / D, k.ta / D]; back.forEach((v, i) => w = Math.max(w, Math.abs(v - el[i]) / Math.max(1, Math.abs(el[i]))));
    w = Math.max(w, Math.hypot(st[0] - st2[0], st[1] - st2[1], st[2] - st2[2]) / Math.hypot(st[0], st[1], st[2])); }
  check('SIM_019', 'elements -> state -> elements round trip 1e-9', w < 1e-9, w.toExponential(2));
  const c = clone(earthCfg), o = c.satellites.orbits[0], st = S.kepToState(mu, o.a_m, o.e, o.i_deg * D, o.raan_deg * D, o.argp_deg * D, o.ta_deg * D);
  const c2 = clone(earthCfg); c2.satellites.orbits[0] = { type: 'cartesian', r_m: st.slice(0, 3), v_m_s: st.slice(3) }; c.duration = c2.duration = 6000;
  const A = rows(S.run(c).csv), B = rows(S.run(c2).csv);
  check('SIM_020', 'equivalent Keplerian and Cartesian inputs give identical trajectories', A.length === B.length && A.every((r, i) => r.join() === B[i].join()), A.length + ' rows'); }
// SIM_016 / SIM_018 / SIM_045
{ const c = clone(earthCfg); c.duration = 3000; c.output_step_s = 25; const res = S.run(c), R = rows(res.csv);
  check('SIM_016', 'fixed-step run uses exactly the given step', res.steps === 300 && res.dt === 10, res.steps + ' steps of ' + res.dt + ' s');
  const ok = R.length === 121 && R.every((r, i) => +r[2] === 25 * i) && R[1][1] === '2026-11-10T06:30:25.000Z' && R[120][1] === '2026-11-10T07:20:00.000Z';
  check('SIM_018', 'output timestamps spaced exactly as set, independent of the 10 s integration step', ok, R.length + ' rows at 25 s');
  const c5 = clone(c); c5.integrator.time_step_s = 5; const R5 = rows(S.run(c5).csv); let wa = 0, wi = 0;
  R.forEach((r, i) => { for (let k = 3; k < 6; k++) { const d = Math.abs(+r[k] - +R5[i][k]); if (i % 2) wi = Math.max(wi, d); else wa = Math.max(wa, d); } });
  check('SIM_018', 'interpolated outputs as accurate as step-aligned ones (vs a 5 s step run)', wi < wa + 1e-3, 'aligned rows ' + wa.toExponential(1) + ' m, interpolated rows ' + wi.toExponential(1) + ' m'); }
// SIM_025: circular orbit about the sphere keeps radius over 10 orbits
{ const c = clone(sphCfg), P = S.makeParent(S.normalizeConfig(c).parent), T = 2 * Math.PI * Math.sqrt(600 ** 3 / P.mu); c.duration = 10 * T; c.integrator.time_step_s = T / 1000; c.output_step_s = T / 50;
  const R = rows(S.run(c).csv); let w = 0; R.forEach(r => w = Math.max(w, Math.abs(Math.hypot(+r[3], +r[4], +r[5]) / 600 - 1)));
  check('SIM_025', 'circular orbit radius constant within 1e-6 over 10 orbits', w < 1e-6 && R.length === 501, w.toExponential(2)); }
// SIM_012 / SIM_013 / SIM_029 / SIM_045 / SIM_056 / SIM_057
{ const c = clone(earthCfg); c.satellites.count = 100; c.satellites.orbits = [];
  for (let i = 0; i < 100; i++) c.satellites.orbits.push({ type: 'keplerian', a_m: 6928137 + 1000 * i, e: 0.001, i_deg: 97.6, raan_deg: 3.6 * i, argp_deg: 30, ta_deg: 7 * i });
  let t0 = Date.now(); const res = S.run(c), dt100 = (Date.now() - t0) / 1000, R = rows(res.csv);
  const per = {}; R.forEach(r => per[r[0]] = (per[r[0]] || 0) + 1);
  check('SIM_012', '100 satellites run without error', Object.keys(per).length === 100);
  check('SIM_013', 'auto names prefix-01, prefix-02 ...', per['FF-01'] && per['FF-100'] && !per['FF-1']);
  check('SIM_045', 'every satellite has one row per output step', Object.values(per).every(v => v === 1441), '1441 rows each');
  const one = clone(c); one.satellites.count = 1; one.satellites.orbits = [c.satellites.orbits[41]]; delete one.satellites.name_prefix; one.satellites.names = ['FF-42'];
  t0 = Date.now(); const R1 = rows(S.run(one).csv), dt1 = (Date.now() - t0) / 1000, Rm = R.filter(r => r[0] === 'FF-42');
  check('SIM_029', 'trajectory identical alone or with 99 others', Rm.length === R1.length && Rm.every((r, i) => r.join() === R1[i].join()));
  const parsed = S.parsePlanCsv(res.csv); let w = 0; const s41 = parsed.sats[41];
  for (let i = 0; i < s41.t.length; i++) for (let k = 0; k < 3; k++) w = Math.max(w, Math.abs(s41.y[6 * i + k] - +Rm[i][3 + k]));
  check('SIM_045', 'reloading plan.csv reproduces states (1 mm)', w < 1e-3 && parsed.sats.length === 100 && parsed.times.length === 1441);
  console.log('     timing: 1 sat x 1 day @10 s = ' + dt1.toFixed(2) + ' s; 100 sats = ' + dt100.toFixed(2) + ' s (SIM_056 / SIM_057, Additional)'); }
// SIM_041: impact
{ const c = clone(sphCfg), P = S.makeParent(S.normalizeConfig(c).parent), mu = P.mu, a = 500, e = 0.6;      // periapsis 200 m < 250 m radius
  c.satellites = { count: 2, mass_kg: 150, names: ['lander', 'orbiter'], orbits: [{ type: 'keplerian', a_m: a, e: e, i_deg: 30, raan_deg: 0, argp_deg: 0, ta_deg: 180 }, c.satellites.orbits[0]] };
  const res = S.run(c), im = res.report[0].impact, Ecc = Math.acos((1 - 250 / a) / e), tAn = (Math.PI - (Ecc - e * Math.sin(Ecc))) / Math.sqrt(mu / a ** 3);
  const solo = clone(sphCfg), A = rows(res.csv).filter(r => r[0] === 'orbiter'), B = rows(S.run(solo).csv);
  check('SIM_041', 'impact epoch within 1 s of analytic; location on the surface', !!im && Math.abs(im.t - tAn) < 1 && Math.abs(Math.hypot(...im.bodyFixed) - 250) < 1e-3, im ? 'sim ' + im.t.toFixed(3) + ' s, analytic ' + tAn.toFixed(3) + ' s, lat ' + im.latDeg.toFixed(2) + ' lon ' + im.lonDeg.toFixed(2) : 'no impact');
  check('SIM_041', 'other satellites unaffected and continue', !res.report[1].impact && A.length === B.length && A.every((r, i) => r.slice(2).join() === B[i].slice(2).join()) && rows(res.csv).filter(r => r[0] === 'lander').every(r => +r[2] <= im.t));
  check('SIM_041', 'impact reported in plan.csv header', /# impact: sat=lander; kind=impact; epoch_utc=2026-11-1/.test(res.csv)); }
// SIM_044 / SIM_055 / SIM_066 / SIM_069
{ const r1 = S.run(earthCfg), r2 = S.run(clone(earthCfg)), rs = S.run(sphCfg);
  check('SIM_044', 'gravity-only 1-day run drifts < 1e-8 (Earth LEO, 10 s step)', r1.report[0].energyDrift < 1e-8, 'energy ' + r1.report[0].energyDrift.toExponential(2));
  check('SIM_044', 'drift reported for rotating sphere parent', rs.report[0].jacobiDrift < 1e-8 && rs.report[0].energyDrift < 1e-8, 'Jacobi ' + rs.report[0].jacobiDrift.toExponential(2));
  check('SIM_055', 'rerunning a saved config reproduces plan.csv exactly; config and version recorded', r1.csv === r2.csv && r1.csv.includes('# config: ' + JSON.stringify(earthCfg)) && r1.csv.includes('# sim_version: ' + S.VERSION));
  check('SIM_066', 'frame name and centre recorded', /# inertial_frame: GCRF \(ICRF axes\); centre: Earth centre of mass/.test(r1.csv) && /# inertial_frame: ICRF axes; centre: parent centre of mass/.test(rs.csv));
  check('SIM_069', 'every column has unit and frame label', (r1.csv.match(/# column: /g) || []).length === 11 && /# column: x_m; unit: m; frame: GCRF/.test(r1.csv));
  const p = S.parsePlanCsv(rs.csv); check('SIM_045', 'parent rotation angle advances at the spin rate', Math.abs(((p.rot[1] - p.rot[0]) / D + 360) % 360 - 360 * 120 / 15480) < 1e-6 && Math.abs(p.rot[0] / D - 20) < 1e-6); }
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
