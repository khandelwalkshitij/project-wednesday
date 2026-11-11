// v0.2 features: drag, burns, patterns, TLE (against SGP4), beta angle, eclipses, orbit summary, per-satellite overrides.
import { S, fixture } from './setup.mjs';
let fails = 0; const D = Math.PI / 180, clone = o => JSON.parse(JSON.stringify(o));
function check(id, what, ok, detail) { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (detail !== undefined ? '  [' + detail + ']' : '')); }
const errOf = c => { try { S.normalizeConfig(c); return ''; } catch (e) { return e.message; } };
const rows = csv => csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(','));
const hdr = (csv, k) => csv.split('\n').filter(l => l.startsWith('# ' + k + ':')).map(l => Object.fromEntries(l.slice(k.length + 4).split('; ').map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)])));
const RE = S.EARTH.a, kep = (a, e, i, raan, argp, ta) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: argp, ta_deg: ta });
const base = { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60,
  satellites: { count: 1, mass_kg: 100, names: ['A'], orbits: [kep(RE + 300e3, 0, 51.6, 10, 0, 0)] } };
const sph = { parent: { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 85, pole_dec_deg: -60, prime_meridian_deg: 20 } },
  start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60, satellites: { count: 1, mass_kg: 20, names: ['A'], orbits: [kep(600, 0, 30, 0, 0, 0)] } };
const Pe = S.makeParent({ shape: 'earth_default' }), tt0 = S.parseEpoch(base.start_epoch).tt;
const Eof = (q, t) => { const s = q.slice(3, 9).map(Number); return (s[3] ** 2 + s[4] ** 2 + s[5] ** 2) / 2 - Pe.potential(s[0], s[1], s[2], S.earthPole(tt0 + t)); };

// ---- SIM_093 drag
{ const c = clone(base); c.force_model = { drag: true }; c.satellites.cd = 2.2; c.satellites.area_m2 = 1;
  const r = S.run(c), R = rows(r.csv), dEn = Eof(R[R.length - 1], 86400) - Eof(R[0], 0), W = r.report[0].dragWork;
  check('SIM_093', 'energy lost over a 1-day 300 km run equals drag work within 1%', Math.abs(dEn / W - 1) < 0.01, 'dE ' + dEn.toExponential(4) + ' J/kg, work ' + W.toExponential(4) + ', ratio ' + (dEn / W).toFixed(6));
  check('SIM_093', 'energy residual after removing drag work stays a numerical-error check', r.report[0].energyDrift < 1e-8, r.report[0].energyDrift.toExponential(2));
  const a0 = S.stateToKep(S.EARTH.mu, R[0].slice(3, 9).map(Number)).a, mean = k => { let s = 0, n = 0; for (let j = k; j < k + 90; j++) { s += S.stateToKep(S.EARTH.mu, R[j].slice(3, 9).map(Number)).a; n++; } return s / n; };
  const decay = mean(0) - mean(R.length - 91), est = 2 * Math.PI * 2.2 * 1 / 100 * S.atmosphereDensity(300e3) * (RE + 300e3) ** 2 * 86400 / (2 * Math.PI * Math.sqrt((RE + 300e3) ** 3 / S.EARTH.mu));
  check('SIM_093', 'decay rate is the right size (orbit-averaged a, vs 2 pi Cd A/m rho a^2 per rev)', decay > 0.5 * est && decay < 2 * est, 'sim ' + (decay / 1000).toFixed(2) + ' km/day, estimate ' + (est / 1000).toFixed(2) + ' km/day');
  const c2 = clone(c); c2.satellites.mass_kg = 200; const d2 = (() => { const R2 = rows(S.run(c2).csv); return Eof(R2[R2.length - 1], 86400) - Eof(R2[0], 0); })();
  check('SIM_093', 'doubling the mass halves the energy loss', Math.abs(d2 / dEn - 0.5) < 0.02, (d2 / dEn).toFixed(4));
  const c0 = clone(base), g0 = S.run(c0).csv, c1 = clone(base); c1.force_model = 'gravity_only'; const cOff = clone(base); cOff.force_model = { drag: false }; cOff.satellites.area_m2 = 1;
  check('SIM_093', 'drag off leaves the trajectory unchanged', rows(g0).join() === rows(S.run(c1).csv).join() && rows(g0).join() === rows(S.run(cOff).csv).join());
  const lo = clone(c); lo.satellites.orbits = [kep(RE + 125e3, 0, 51.6, 10, 0, 0)]; const rl = S.run(lo), im = rl.report[0].impact;
  check('SIM_093', 'low orbit ends in a re-entry event at 80 km', !!im && im.kind === 'reentry' && /kind=reentry/.test(rl.csv), im ? 'after ' + (im.t / 3600).toFixed(2) + ' h, lat ' + im.latDeg.toFixed(1) : 'none');
  const cs = clone(sph); cs.force_model = { drag: true }; cs.satellites.area_m2 = 1; const noA = clone(base); noA.force_model = { drag: true };
  check('SIM_093', 'input errors: drag on a sphere parent, drag without area', /only available for parent.shape "earth_default"/.test(errOf(cs)) && /area_m2: drag or solar radiation pressure is on/.test(errOf(noA))); }

// ---- SIM_038 manoeuvres
{ const c = clone(base); c.duration = 3000; c.output_step_s = 0.5; c.satellites.orbits = [kep(RE + 500e3, 0.001, 51.6, 10, 0, 0)];
  const ref = rows(S.run(c).csv), cb = clone(c); cb.maneuvers = [{ sat: 'A', t_s: 1234.5, dv_m_s: [0, 1, 0], frame: 'lvlh' }];
  const rb = S.run(cb), R = rows(rb.csv), k = R.findIndex(q => +q[2] === 1234.5), dv = [6, 7, 8].map(j => +R[k][j] - +ref[k][j]), dr = [3, 4, 5].map(j => +R[k][j] - +ref[k][j]), v = [6, 7, 8].map(j => +ref[k][j]);
  const along = (dv[0] * v[0] + dv[1] * v[1] + dv[2] * v[2]) / Math.hypot(...v), pre = [6, 7, 8].map(j => +R[k - 1][j] - +ref[k - 1][j]);
  check('SIM_038', 'velocity changes by the commanded delta-v at the commanded epoch (off the step grid)', Math.abs(Math.hypot(...dv) - 1) < 3e-7 && Math.hypot(...dr) < 1e-3 && Math.hypot(...pre) < 1e-6 && along > 0.9999,
    '|dv| ' + Math.hypot(...dv).toFixed(7) + ' m/s (rows carry 7 decimals), position jump ' + Math.hypot(...dr).toExponential(1) + ' m');
  check('SIM_038', 'energy residual excludes the burn; total delta-v reported', rb.report[0].energyDrift < 1e-8 && Math.abs(rb.report[0].dvTotal - 1) < 1e-12 && /burns=1; dv_total_m_s=1.000000/.test(rb.csv), rb.report[0].energyDrift.toExponential(2));
  const ci = clone(cb); ci.maneuvers[0] = { sat: 'A', epoch: '2026-11-10T06:50:34.500 UTC', dv_m_s: [0.3, -0.4, 1.2], frame: 'inertial' }; const Ri = rows(S.run(ci).csv), di = [6, 7, 8].map(j => +Ri[k][j] - +ref[k][j]);
  check('SIM_038', 'inertial frame and epoch input', Math.hypot(di[0] - 0.3, di[1] + 0.4, di[2] - 1.2) < 1e-6);
  // Hohmann transfer round the uniform sphere, 600 m to 900 m
  const h = clone(sph), mu = S.makeParent(S.normalizeConfig(h).parent).mu, r1 = 600, r2 = 900, at = (r1 + r2) / 2, tT = Math.PI * Math.sqrt(at ** 3 / mu);
  h.duration = tT + 40000; h.maneuvers = [{ sat: 'A', t_s: 1000, dv_m_s: [0, Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1), 0] }, { sat: 'A', t_s: 1000 + tT, dv_m_s: [0, Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))), 0] }];
  const rh = S.run(h), Rh = rows(rh.csv), el = S.stateToKep(mu, Rh[Rh.length - 1].slice(3, 9).map(Number));
  check('SIM_038', 'two-burn Hohmann transfer reaches the target circular orbit', Math.abs(el.a / r2 - 1) < 1e-6 && el.e < 1e-6 && rh.report[0].jacobiDrift < 1e-8, 'a ' + el.a.toFixed(4) + ' m, e ' + el.e.toExponential(1));
  const bad = clone(cb); bad.maneuvers = [{ sat: 'B', t_s: 99999, dv_m_s: [1, 2], frame: 'body' }];
  const m = errOf(bad); check('SIM_038', 'input errors named', /no satellite named "B"/.test(m) && /inside the run/.test(m) && /dv_m_s/.test(m) && /frame/.test(m)); }

// ---- SIM_022 / SIM_023 patterns
{ const c = clone(base); c.satellites = { mass_kg: 100, name_prefix: 'W', pattern: { type: 'walker', a_m: RE + 550e3, i_deg: 53, t: 24, p: 3, f: 1 } };
  const n = S.normalizeConfig(c), el = n.sats.map(s => S.stateToKep(S.EARTH.mu, s.state)), o = S.expandPattern(c.satellites.pattern, 24);
  const raans = [0, 8, 16].map(k => o[k].raan_deg), ph = o[8].ta_deg - o[0].ta_deg, inPlane = o[1].ta_deg - o[0].ta_deg;
  check('SIM_022', 'Walker 53:24/3/1: 24 satellites, RAAN spaced 360/P, phasing F*360/T', n.sats.length === 24 && raans.join() === '0,120,240' && Math.abs(ph - 15) < 1e-9 && Math.abs(inPlane - 45) < 1e-9 && el.every(e => Math.abs(e.i / D - 53) < 1e-9),
    'RAAN ' + raans.join('/') + ', in-plane ' + inPlane + ' deg, phasing ' + ph + ' deg');
  const b1 = clone(c); b1.satellites.pattern.p = 5; const b2 = clone(c); b2.satellites.count = 12; const b3 = clone(c); b3.satellites.orbits = [];
  check('SIM_022', 'input errors named', /planes must divide/.test(errOf(b1)) && /must equal satellites.pattern.t/.test(errOf(b2)) && /one or the other/.test(errOf(b3)));
  const t = clone(base); t.satellites = { count: 4, mass_kg: 100, name_prefix: 'T', pattern: { type: 'train', base: kep(RE + 550e3, 0, 97.6, 40, 0, 10), offset: { along_track_m: 100e3 } } };
  const nt = S.normalizeConfig(t), d = [1, 2, 3].map(k => Math.hypot(...[0, 1, 2].map(j => nt.sats[k].state[j] - nt.sats[k - 1].state[j])));
  const t2 = clone(t); t2.satellites.pattern.offset = { raan_deg: 2.5 }; const o2 = S.expandPattern(t2.satellites.pattern, 4), t3 = clone(t); t3.satellites.pattern.offset = { ta_deg: -3 }; const o3 = S.expandPattern(t3.satellites.pattern, 4);
  check('SIM_023', 'train: satellite k has k times the offset (along-track m, RAAN deg, true anomaly deg)', d.every(x => Math.abs(x / 100e3 - 1) < 1e-4) && o2.map(q => q.raan_deg).join() === '40,42.5,45,47.5' && o3.map(q => q.ta_deg).join() === '10,7,4,1',
    'chord spacing ' + d.map(x => (x / 1000).toFixed(2)).join(', ') + ' km'); }

// ---- TLE import
{ const T = fixture('tle_truth.json'); let ok = true; const out = [];
  for (const t of T) { const tle = S.parseTle(t.l1, t.l2); const e = t.truth.map(q => { const s = S.tleState(tle, tle.tt + q.dt_s); return Math.hypot(s[0] - q.r[0], s[1] - q.r[1], s[2] - q.r[2]) / 1000; });
    out.push(t.name + ' ' + e.map(x => x.toFixed(1)).join(' / ') + ' km'); ok = ok && e[0] < (tle.e > 0.1 ? 100 : 25) && e[1] < (tle.e > 0.1 ? 100 : 25); }
  check('TLE', 'state from a TLE vs SGP4 (TEME -> GCRF with ERFA), at epoch / one day later: under 25 km in LEO, under 100 km for Molniya', ok, out.join('; '));
  const c = clone(base); c.start_epoch = S.formatUtc(S.parseTle(T[0].l1, T[0].l2).tt).replace('Z', ' UTC'); c.satellites.orbits = [{ type: 'tle', line1: T[0].l1, line2: T[0].l2 }];
  const n = S.normalizeConfig(c), el = S.stateToKep(S.EARTH.mu, n.sats[0].state), r = S.run(c);
  check('TLE', 'a "tle" orbit runs; elements are sensible', Math.abs(el.i / D - 51.64) < 0.2 && el.a > RE + 380e3 && el.a < RE + 440e3 && r.rows === 1441, 'a ' + ((el.a - RE) / 1000).toFixed(1) + ' km above R, i ' + (el.i / D).toFixed(3));
  const bad = clone(c); bad.satellites.orbits = [{ type: 'tle', line1: T[0].l1.slice(0, 68) + ((+T[0].l1[68] + 1) % 10), line2: T[0].l2 }];
  check('TLE', 'bad checksum rejected', /checksum of line 1/.test(errOf(bad))); }

// ---- SIM_084 / SIM_085 beta and eclipse
{ const sd = S.sunDirection(tt0), ra = Math.atan2(sd[1], sd[0]) / D, a = RE + 550e3, c = clone(base); c.duration = 3 * 5740; c.output_step_s = 30; c.satellites.orbits = [kep(a, 0, 90, ra, 0, 0)];
  const r = S.run(c), p = S.parsePlanCsv(r.csv), ev = S.eclipseEvents(p.sats[0], p.tt0, RE).filter(e => !e.open), T = 2 * Math.PI * Math.sqrt(a ** 3 / S.EARTH.mu), an = T * Math.asin(RE / a) / Math.PI;
  const beta = S.betaAngle(p.sats[0].y, 0, sd) / D, durs = ev.map(e => e.t1 - e.t0);
  check('SIM_084', 'beta angle is 0 for an orbit plane holding the Sun, 90 - i geometry otherwise', Math.abs(beta) < 0.05 && Math.abs(S.betaAngle(S.kepToState(S.EARTH.mu, a, 0, 90 * D, (ra + 90) * D, 0, 0), 0, sd) / D - Math.asin(Math.hypot(sd[0], sd[1])) / D) < 1e-6, 'beta ' + beta.toFixed(4) + ' deg');
  check('SIM_085', '550 km circular orbit at beta 0: eclipse duration within 5 s of the analytic value', durs.length >= 2 && durs.every(d => Math.abs(d - an) < 5), 'sim ' + durs.map(d => d.toFixed(1)).join(', ') + ' s; analytic ' + an.toFixed(1) + ' s');
  const R = rows(r.csv); let mism = 0; R.forEach(q => { const t = +q[2], inside = ev.some(e => t > e.t0 + 1 && t < e.t1 - 1), outside = !S.eclipseEvents(p.sats[0], p.tt0, RE).some(e => t >= e.t0 - 1 && t <= e.t1 + 1); if ((inside && q[10] !== '1') || (outside && q[10] !== '0')) mism++; });
  check('SIM_085', 'in_shadow column in plan.csv agrees with the eclipse events', mism === 0 && R[0].length === 11 && rows(S.run(sph).csv)[0][10] === '', mism + ' mismatches in ' + R.length + ' rows');
  const hi = clone(c); hi.satellites.orbits = [kep(a, 0, 90, ra + 90, 0, 0)]; const ph = S.parsePlanCsv(S.run(hi).csv);
  check('SIM_085', 'no eclipses when the orbit plane faces the Sun (beta near 73 deg here)', S.eclipseEvents(ph.sats[0], ph.tt0, RE).length === 0); }

// ---- SIM_082 orbit summary
{ const c = clone(base); c.satellites.orbits = [kep(RE + 600e3, 0.01, 51.6, 10, 0, 0)]; c.duration = 600; const r = S.run(c), a = RE + 600e3, h = hdr(r.csv, 'report')[0];
  check('SIM_082', 'period, perigee and apogee altitude at start_epoch', Math.abs(r.report[0].period / (2 * Math.PI * Math.sqrt(a ** 3 / S.EARTH.mu)) - 1) < 1e-9 && Math.abs(r.report[0].perigeeAlt - (a * 0.99 - RE)) < 1e-3 && Math.abs(r.report[0].apogeeAlt - (a * 1.01 - RE)) < 1e-3 && +h.period_s > 5700,
    'period ' + h.period_s + ' s, perigee ' + (h.perigee_alt_m / 1000).toFixed(2) + ' km, apogee ' + (h.apogee_alt_m / 1000).toFixed(2) + ' km'); }
// ---- per-satellite overrides and old files
{ const c = clone(base); c.force_model = { drag: true }; c.satellites = { count: 2, mass_kg: 100, cd: 2.2, area_m2: 1, names: ['A', 'B'], orbits: [kep(RE + 300e3, 0, 51.6, 10, 0, 0), Object.assign(kep(RE + 300e3, 0, 51.6, 10, 0, 0), { area_m2: 4 })] };
  const r = S.run(c); check('SIM_027', 'per-satellite area: 4x the area gives about 4x the drag work (a little more, since it sinks into denser air)', Math.abs(r.report[1].dragWork / r.report[0].dragWork - 4) < 0.5, (r.report[1].dragWork / r.report[0].dragWork).toFixed(3));
  const old = S.run(base).csv.split('\n').map(l => l[0] === '#' ? l : l.split(',').slice(0, 10).join(',')).join('\n');
  check('compat', 'plan.csv files written before the in_shadow column still load', S.parsePlanCsv(old).sats[0].t.length === 1441); }
// ---- burn exactly on an integration step boundary: the row at the burn epoch shows the post-burn state, same as off-grid burns
{ const c = clone(base); c.duration = 3000; c.output_step_s = 10; c.satellites.orbits = [kep(RE + 500e3, 0.001, 51.6, 10, 0, 0)];
  const ref = rows(S.run(c).csv), cb = clone(c); cb.maneuvers = [{ sat: 'A', t_s: 1230, dv_m_s: [0, 1, 0], frame: 'lvlh' }];
  const R = rows(S.run(cb).csv), k = R.findIndex(q => +q[2] === 1230), dv = Math.hypot(...[6, 7, 8].map(j => +R[k][j] - +ref[k][j])), pre = Math.hypot(...[6, 7, 8].map(j => +R[k - 1][j] - +ref[k - 1][j]));
  check('SIM_038', 'burn on a step boundary: row at the burn epoch is post-burn, row before is untouched', Math.abs(dv - 1) < 3e-7 && pre === 0, 'dv ' + dv.toFixed(7) + ' m/s'); }

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
