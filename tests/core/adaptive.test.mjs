// v0.4: adaptive DOP853 integrator (SIM_017). The core stepper is checked against SciPy's DOP853 and an analytic Kepler orbit;
// full runs are checked against fine-step RK4, for convergence as rtol is tightened, and for burns, shadow crossings and re-entry.
import { S, fixture } from './setup.mjs';
import { Dop853 } from '../../src/core/dop853.js';
let fails = 0; const check = (id, what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (d !== undefined ? '  [' + d + ']' : '')); };
const clone = o => JSON.parse(JSON.stringify(o)), RE = S.EARTH.a;
const pos = r => r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(',').slice(3, 6).map(Number));
const maxDiff = (a, b) => a.length === b.length ? Math.max(...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1], p[2] - b[k][2]))) : Infinity;
const errOf = c => { try { S.normalizeConfig(c); return ''; } catch (e) { return e.message; } };
const kep = (a, e, i, raan) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: 0, ta_deg: 0 });
const DOP = (rtol, atol) => ({ type: 'dop853', rtol, atol }), RK4 = h => ({ type: 'rk4', time_step_s: h });
const base = { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: DOP(1e-10, 1e-6), output_step_s: 60,
  satellites: { count: 1, mass_kg: 100, cd: 2.2, cr: 1.5, area_m2: 1, names: ['A'], orbits: [kep(RE + 500e3, 0.001, 51.6, 10)] } };
const withInteg = (c, ig) => { c = clone(c); c.integrator = ig; return c; };

// 1. The stepper alone: same steps and states as SciPy's DOP853, and accurate against the analytic Kepler orbit
{ const T = fixture('dop853_truth.json'), mu = T.mu, out = []; let ok = true;
  const fun = (t, y, o) => { const r = Math.hypot(y[0], y[1], y[2]), k = -mu / (r * r * r); o[0] = y[3]; o[1] = y[4]; o[2] = y[5]; o[3] = k * y[0]; o[4] = k * y[1]; o[5] = k * y[2]; };
  for (const ref of T.runs) {
    const st = new Dop853(6, 6, fun, { rtol: ref.rtol, atol: T.atol }), d = new Float64Array(6); let dense = null; st.init(0, T.y0, T.t_end);
    while (st.t < T.t_end) { st.step(T.t_end); if (!dense && st.tOld < T.t_dense && T.t_dense <= st.t) { st.dense(T.t_dense, d); dense = Array.from(d); } }
    const de = Math.hypot(st.y[0] - ref.end[0], st.y[1] - ref.end[1], st.y[2] - ref.end[2]), dd = Math.hypot(dense[0] - ref.dense[0], dense[1] - ref.dense[1], dense[2] - ref.dense[2]);
    out.push('rtol ' + ref.rtol + ': ' + st.accepted + '/' + ref.steps + ' steps, end ' + de.toExponential(1) + ' m, dense ' + dd.toExponential(1) + ' m');
    ok = ok && st.accepted === ref.steps && de < 0.1 && dd < 0.1;
  }
  check('SIM_017', 'DOP853 stepper matches SciPy (same step count; end and dense-output states within 10 cm over 10 orbits)', ok, out.join('; '));
  const st = new Dop853(6, 6, fun, { rtol: 1e-12, atol: 1e-6 }), a = 7e6, e = 0.1, n = Math.sqrt(mu / a ** 3); st.init(0, T.y0, T.t_end);
  while (st.t < T.t_end) st.step(T.t_end);
  let E = n * T.t_end; for (let k = 0; k < 50; k++) E -= (E - e * Math.sin(E) - n * T.t_end) / (1 - e * Math.cos(E));
  const err = Math.hypot(st.y[0] - a * (Math.cos(E) - e), st.y[1] - a * Math.sqrt(1 - e * e) * Math.sin(E));
  check('SIM_017', 'Kepler orbit after 10 periods at rtol 1e-12: within 1 mm of the analytic position', err < 1e-3, err.toExponential(2) + ' m'); }

// 2. SIM_017 acceptance: 1-day LEO at rtol 1e-10 vs rtol 1e-12 within 1 m (J2-J4 gravity)
{ const a = S.run(base), b = S.run(withInteg(base, DOP(1e-12, 1e-8))), r1 = S.run(withInteg(base, RK4(1))), d = maxDiff(pos(a), pos(b)), d1 = maxDiff(pos(b), pos(r1));
  check('SIM_017', '1-day LEO run at rtol 1e-10 matches rtol 1e-12 within 1 m, and rtol 1e-12 matches 1 s RK4 within 1 cm', d < 1 && d1 < 0.01, d.toExponential(2) + ' m, ' + d1.toExponential(2) + ' m');
  check('SIM_017', 'far fewer steps than 10 s RK4, energy still conserved', a.steps < 1000 && a.report[0].energyDrift < 1e-8, a.steps + ' steps vs 8640, drift ' + a.report[0].energyDrift.toExponential(1));
  const h = a.csv.split('\n').find(l => l.startsWith('# integrator:'));
  check('SIM_017', 'plan.csv header records the integrator, tolerances and step statistics', /dop853; rtol=1e-10; atol=0\.000001; accepted_steps=\d+; rejected_steps=\d+/.test(h), h);
  check('SIM_017', 'RK4 runs record their step too', /# integrator: rk4; time_step_s=1\n/.test(r1.csv + '\n')); }

// 3. Drag + SRP + burns, three satellites: against 1 s RK4, with burns landing exactly on their times
{ const c = clone(base); c.force_model = { drag: true, srp: true };
  c.satellites = { count: 3, mass_kg: 100, cd: 2.2, cr: 1.5, area_m2: 1, names: ['Low', 'Boosted', 'High'], orbits: [kep(RE + 300e3, 0, 51.6, 10), kep(RE + 300e3, 0, 51.6, 10), kep(RE + 550e3, 0.001, 97.6, 80)] };
  c.maneuvers = [{ sat: 'Boosted', t_s: 30000, dv_m_s: [0, 2, 0] }, { sat: 'Boosted', t_s: 60000.5, dv_m_s: [0.5, 0, 0.5], frame: 'inertial' }];
  const a = S.run(c), r = S.run(withInteg(c, RK4(1))), d = maxDiff(pos(a), pos(r));
  check('SIM_017', 'drag + SRP + two burns, 3 satellites, 1 day: within 1 m of 1 s RK4', d < 1, d.toExponential(2) + ' m');
  check('SIM_017', 'burn delta-v and energy bookkeeping match RK4', Math.abs(a.report[1].dvTotal - r.report[1].dvTotal) < 1e-9 && Math.abs(a.report[1].burnEnergy / r.report[1].burnEnergy - 1) < 1e-4 &&
    Math.abs(a.report[0].nonGravWork / r.report[0].nonGravWork - 1) < 1e-4 && a.report.every(q => q.energyDrift < 1e-8), a.report.map(q => q.energyDrift.toExponential(1)).join(' ')); }

// 4. Shadow crossings: with SRP the force jumps at every eclipse boundary. Holding the lit/shadow state fixed over a step and
//    landing a step on each crossing keeps the run converging as rtol is tightened (without it, 1e-12 vs 1e-13 differ by metres).
{ const c = clone(base); c.force_model = { srp: true }; c.satellites.orbits = [kep(RE + 550e3, 0.001, 97.6, 10)];
  const a = S.run(withInteg(c, DOP(1e-12, 1e-8))), b = S.run(withInteg(c, DOP(1e-13, 1e-9))), d = maxDiff(pos(a), pos(b));
  check('SIM_017', 'SRP with eclipses: rtol 1e-12 vs 1e-13 within 5 mm over a day, with every shadow crossing located', d < 5e-3 && a.integrator.events >= 28, d.toExponential(2) + ' m, ' + a.integrator.events + ' crossings'); }

// 5. Re-entry time agrees with fine-step RK4
{ const c = clone(base); c.duration = 'P20D'; c.output_step_s = 600; c.force_model = { drag: true }; c.satellites = { count: 1, mass_kg: 10, cd: 2.2, area_m2: 1, orbits: [kep(RE + 200e3, 0, 51.6, 10)] };
  const a = S.run(c), r = S.run(withInteg(c, RK4(2)));
  check('SIM_017', 're-entry time within 0.1 s of 2 s RK4', a.report[0].impact && r.report[0].impact && Math.abs(a.report[0].impact.t - r.report[0].impact.t) < 0.1 && a.rows === r.rows,
    a.report[0].impact && (a.report[0].impact.t.toFixed(3) + ' s vs ' + r.report[0].impact.t.toFixed(3) + ' s')); }

// 6. Input checks
{ const e1 = errOf(withInteg(base, { type: 'dop853', atol: 1e-6 })), e2 = errOf(withInteg(base, DOP(1e-15, 1e-6))), e3 = errOf(withInteg(base, { type: 'dop853', rtol: 1e-10, atol: 1e-6, time_step_s: 10 }));
  check('SIM_017', 'dop853 needs rtol and atol, rejects rtol below 1e-13 and fields it does not use', /integrator\.rtol: must be a number/.test(e1) && /integrator\.rtol: must be at least 1e-13/.test(e2) && /integrator\.time_step_s: unknown field/.test(e3), [e1, e2, e3].join(' | '));
  check('SIM_017', 'optional max_step_s caps the step', S.run(withInteg(base, { type: 'dop853', rtol: 1e-10, atol: 1e-6, max_step_s: 30 })).integrator.hMax <= 30); }

if (fails) { console.log('\n' + fails + ' check(s) failed'); process.exit(1); }
console.log('\nall passed');
