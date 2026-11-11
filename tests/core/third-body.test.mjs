// v0.4: Sun and Moon point-mass gravity. Moon position checked against ERFA; the force against a short-arc analytic result,
// the classic GEO inclination drift, energy bookkeeping, and RK4 vs DOP853.
import { S, fixture } from './setup.mjs';
import { moonPosition } from '../../src/core/moon.js';
let fails = 0; const check = (id, what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (d !== undefined ? '  [' + d + ']' : '')); };
const kep = (a, e, i, raan) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: 0, ta_deg: 0 });
const cfg = (orbit, dur, out, fm, integ) => ({ parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: dur, integrator: integ || { type: 'rk4', time_step_s: 10 },
  output_step_s: out, force_model: fm, satellites: { count: 1, mass_kg: 100, area_m2: 1, orbits: [orbit] } });
const rows = r => r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(',').slice(3, 9).map(Number));
const maxDiff = (a, b) => Math.max(...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1], p[2] - b[k][2])));
const inc = s => { const h = [s[1] * s[5] - s[2] * s[4], s[2] * s[3] - s[0] * s[5], s[0] * s[4] - s[1] * s[3]]; return Math.acos(h[2] / Math.hypot(...h)) * 180 / Math.PI; };
const errOf = c => { try { S.normalizeConfig(c); return ''; } catch (e) { return e.message; } };
const tt0 = S.parseEpoch('2026-11-10T06:30:00.000 UTC').tt;

// 1. Moon position
{ const T = fixture('moon_truth.json'); let m = 0; for (const q of T) { const p = moonPosition(q.tt); m = Math.max(m, Math.hypot(p[0] - q.r[0], p[1] - q.r[1], p[2] - q.r[2])); }
  check('3BODY', 'Moon position matches ERFA eraMoon98 to 1 m at 40 epochs over 1980-2060', m < 1, m.toExponential(2) + ' m'); }

// 2. Short GEO arc: with-minus-without third body = 0.5 a t^2, a from the Sun and Moon positions at mid-arc
{ const geo = kep(42164e3, 0, 0.1, 0), ig = { type: 'rk4', time_step_s: 1 }, on = rows(S.run(cfg(geo, 600, 600, { third_body: true }, ig))), off = rows(S.run(cfg(geo, 600, 600, 'gravity_only', ig)));
  const d = [0, 1, 2].map(k => on[1][k] - off[1][k]), r0 = on[0].slice(0, 3), tm = tt0 + 300, g = (357.528 + 0.9856003 * tm / 86400) * Math.PI / 180;
  const sun = S.sunDirection(tm).map(v => v * 1.495978707e11 * (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)));
  let a = [0, 0, 0];
  for (const [gm, b] of [[1.32712440041e20, sun], [4.9028001218e12, moonPosition(tm)]]) { const dv = b.map((v, k) => v - r0[k]), dn = Math.hypot(...dv), bn = Math.hypot(...b); a = a.map((v, k) => v + gm * (dv[k] / dn ** 3 - b[k] / bn ** 3)); }
  const exp = a.map(v => 0.5 * v * 600 * 600), err = Math.hypot(...d.map((v, k) => v - exp[k])) / Math.hypot(...exp);
  check('3BODY', 'GEO, 600 s: third-body displacement matches 0.5 a t^2 within 3% (vector)', err < 0.03, Math.hypot(...d).toFixed(4) + ' m vs ' + Math.hypot(...exp).toFixed(4) + ' m, error ' + (100 * err).toFixed(2) + '%'); }

// 3. GEO inclination grows about 0.94 deg/yr in 2026 (near the top of the 18.6-year lunar cycle)
{ const c = cfg(kep(42164e3, 0, 0.0001, 0), 'P365D', 86400 * 5, { third_body: true }, { type: 'dop853', rtol: 1e-10, atol: 1e-6 }); c.start_epoch = '2026-01-01T00:00:00.000 UTC';
  const r = S.run(c), R = rows(r), di = inc(R[R.length - 1]);
  check('3BODY', 'GEO from i = 0 in 2026: inclination after one year between 0.85 and 1.0 deg, energy bookkeeping intact', di > 0.85 && di < 1.0 && r.report[0].energyDrift < 1e-8, di.toFixed(3) + ' deg, drift ' + r.report[0].energyDrift.toExponential(1)); }

// 4. RK4 and DOP853 agree; header and report name the force
{ const o = kep(6878137, 0.001, 51.6, 10), a = S.run(cfg(o, 'P2D', 600, { third_body: true }, { type: 'dop853', rtol: 1e-12, atol: 1e-8 })), b = S.run(cfg(o, 'P2D', 600, { third_body: true }, { type: 'rk4', time_step_s: 2 })), z = S.run(cfg(o, 'P2D', 600, 'gravity_only', { type: 'rk4', time_step_s: 2 }));
  const dab = maxDiff(rows(a), rows(b)), eff = maxDiff(rows(b), rows(z));
  check('3BODY', 'LEO, 2 days: effect is tens of metres, and RK4 and DOP853 agree to 1 cm', eff > 10 && eff < 1000 && dab < 0.01, 'effect ' + eff.toFixed(1) + ' m, RK4 vs DOP853 ' + dab.toExponential(2) + ' m');
  check('3BODY', 'plan.csv names the force and reports perturbation work', /force_model: gravity \+ Sun and Moon point-mass gravity/.test(b.csv) && /perturbation_work_j_per_kg=/.test(b.csv) && !/nongrav_work/.test(b.csv) && b.report[0].energyDrift < 1e-8); }

// 5. Input checks
{ const sph = cfg(kep(1000, 0, 10, 0), 600, 60, { third_body: true }); sph.parent = { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 0, pole_dec_deg: 90, prime_meridian_deg: 0 } };
  check('3BODY', 'third_body must be a boolean and needs the Earth parent', /force_model\.third_body: must be true or false/.test(errOf(cfg(kep(7e6, 0, 10, 0), 600, 60, { third_body: 'yes' }))) && /force_model\.third_body: only available for parent\.shape "earth_default"/.test(errOf(sph))); }

if (fails) { console.log('\n' + fails + ' check(s) failed'); process.exit(1); }
console.log('\nall passed');
