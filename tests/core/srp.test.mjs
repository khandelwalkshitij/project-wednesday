// v0.3: solar radiation pressure, Cr schedules, input warnings. SRP is checked against an independent 1 s integrator.
import { S } from './setup.mjs';
let fails = 0; const check = (id, what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (d !== undefined ? '  [' + d + ']' : '')); };
const clone = o => JSON.parse(JSON.stringify(o)), RE = S.EARTH.a, rows = csv => csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(','));
const errOf = c => { try { S.normalizeConfig(c); return ''; } catch (e) { return e.message; } };
const kep = (a, e, i, raan, argp, ta) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: argp, ta_deg: ta });
const base = { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 86400, integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60,
  satellites: { count: 1, mass_kg: 100, area_m2: 10, cr: 1.8, names: ['A'], orbits: [kep(RE + 800e3, 0, 98.6, 10, 0, 0)] } };
const P = S.makeParent({ shape: 'earth_default' }), tt0 = S.parseEpoch(base.start_epoch).tt;

// 1. Short GEO arc in sunlight: SRP-on minus SRP-off displacement = 0.5 a t^2 along -sun
{ const on = clone(base); on.duration = 600; on.output_step_s = 600; on.satellites.orbits = [kep(42164e3, 0, 0.1, 0, 0, 0)]; on.force_model = { srp: true };
  const off = clone(on); delete off.force_model;
  const a = rows(S.run(on).csv), b = rows(S.run(off).csv), last = a.length - 1, d = [3, 4, 5].map(j => +a[last][j] - +b[last][j]);
  const au = 1.00014 - 0.01671 * Math.cos((357.528 + 0.9856003 * (tt0 + 300) / 86400) * Math.PI / 180) - 0.00014 * Math.cos(2 * (357.528 + 0.9856003 * (tt0 + 300) / 86400) * Math.PI / 180), acc = 4.56e-6 * 1.8 * 10 / 100 / au / au, exp = 0.5 * acc * 600 * 600, sd = S.sunDirection(tt0 + 300), cosang = -(d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2]) / Math.hypot(...d);
  check('SRP', 'displacement after 600 s matches 0.5 a t^2 (a = P Cr A/m) and points away from the Sun', Math.abs(Math.hypot(...d) / exp - 1) < 0.02 && cosang > 0.999,
    'sim ' + Math.hypot(...d).toFixed(4) + ' m, expected ' + exp.toFixed(4) + ' m, cos to anti-sun ' + cosang.toFixed(5)); }

// 2. One day, 800 km orbit with eclipses, against a 1 s reference integrator that does gravity + SRP + cylindrical shadow on its own
{ const c = clone(base); c.force_model = { srp: true }; c.duration = 86400; c.output_step_s = 3600;
  const r = S.run(c), R = rows(r.csv), cfg = S.normalizeConfig(c), y = cfg.sats[0].state.slice(), h = 1;
  const f = (s, t) => { const o = [0, 0, 0]; P.accel(s[0], s[1], s[2], S.earthPole(tt0 + t), o, 0); const sd = S.sunDirection(tt0 + t), d = s[0] * sd[0] + s[1] * sd[1] + s[2] * sd[2];
    const px = s[0] - d * sd[0], py = s[1] - d * sd[1], pz = s[2] - d * sd[2], shade = d < 0 && px * px + py * py + pz * pz < RE * RE;
    const g = (357.528 + 0.9856003 * (tt0 + t) / 86400) * Math.PI / 180, au = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g), k = -4.56e-6 * 1.8 * 10 / 100 / au / au; if (!shade) for (let j = 0; j < 3; j++) o[j] += k * sd[j]; return [s[3], s[4], s[5], o[0], o[1], o[2]]; };
  let s = y.slice(), t = 0; for (; t < 86400; t += h) { const k1 = f(s, t), k2 = f(s.map((v, j) => v + h / 2 * k1[j]), t + h / 2), k3 = f(s.map((v, j) => v + h / 2 * k2[j]), t + h / 2), k4 = f(s.map((v, j) => v + h * k3[j]), t + h); s = s.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); }
  const off = clone(c); delete off.force_model; const Ro = rows(S.run(off).csv), L = R.length - 1;
  const err = Math.hypot(...[0, 1, 2].map(j => +R[L][3 + j] - s[j])), eff = Math.hypot(...[0, 1, 2].map(j => +R[L][3 + j] - +Ro[L][3 + j]));
  check('SRP', '1-day 800 km SSO with eclipses agrees with an independent 1 s reference', err < 0.05 * eff && err < 5, 'SRP moves the satellite ' + eff.toFixed(1) + ' m in a day, sim vs reference ' + err.toFixed(3) + ' m');
  check('SRP', 'energy residual still near round-off with SRP on (SRP work removed)', r.report[0].energyDrift < 1e-8, r.report[0].energyDrift.toExponential(2));
  check('SRP', 'plan.csv header names the SRP model', /solar radiation pressure/.test(r.csv)); }

// 3. In full sunlight vs eclipse: dawn-dusk orbit (beta ~ 90) vs noon-midnight orbit should differ in SRP effect
// 4. Cr schedule
{ const cs = S.parseCr([[0, 1.0], [100, 2.0]], 'x', 0, []);
  check('Cr', 'schedule interpolates linearly and clamps at the ends', S.getCr(cs, 50) === 1.5 && S.getCr(cs, -10) === 1 && S.getCr(cs, 500) === 2);
  const E = []; const ce = S.parseCr([{ epoch: '2026-11-10T06:30:00.000 UTC', cr: 1.2 }, { t_s: 3600, cr: 1.4 }], 'x', tt0, E);
  check('Cr', 'epoch entries are converted to seconds from start', !E.length && Math.abs(S.getCr(ce, 1800) - 1.3) < 1e-12, E.join('; '));
  const c = clone(base); c.force_model = { srp: true }; c.duration = 3600; const c2 = clone(c); c2.satellites.cr = [[0, 1.8], [3600, 1.8]];
  check('Cr', 'a flat schedule gives the same trajectory as the constant', rows(S.run(c).csv).join() === rows(S.run(c2).csv).join());
  const bad = clone(c); bad.satellites.cr = 4; check('Cr', 'Cr above 3 rejected', /must be a number between 0 and 3/.test(errOf(bad))); }

// 5. Inputs
{ const sp = clone(base); sp.parent = { shape: 'sphere_uniform', radius_m: 250, density_kg_m3: 1900, rotation: { spin_period_s: 15480, pole_ra_deg: 85, pole_dec_deg: -60, prime_meridian_deg: 20 } };
  sp.satellites.orbits = [kep(600, 0, 30, 0, 0, 0)]; sp.force_model = { srp: true };
  check('Input', 'SRP on a sphere parent rejected', /only available for parent.shape "earth_default"/.test(errOf(sp)));
  const na = clone(base); delete na.satellites.area_m2; na.force_model = { srp: true }; check('Input', 'SRP without area rejected', /area_m2/.test(errOf(na)));
  const nm = clone(base); delete nm.satellites.mass_kg; check('Input', 'missing mass rejected with a clear message', /mass_kg/.test(errOf(nm)), errOf(nm));
  const coarse = clone(base); coarse.integrator.time_step_s = 400; check('Warn', 'step > 5% of period warns', S.normalizeConfig(coarse).warnings.length === 1, S.normalizeConfig(coarse).warnings[0]);
  const huge = clone(base); huge.integrator.time_step_s = 2000; check('Warn', 'step > 25% of period is an error', /exceeds 25%/.test(errOf(huge)));
  const eq = clone(base); eq.satellites.orbits = [kep(RE + 800e3, 0, 0.01, 0, 0, 0)]; check('Warn', 'near-equatorial orbit warns about LTAN', /near-equatorial/.test(S.normalizeConfig(eq).warnings.join()));
  const ok = clone(base); check('Warn', 'normal config has no warnings', S.normalizeConfig(ok).warnings.length === 0); }

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
