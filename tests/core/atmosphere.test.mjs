// v0.4: NRLMSISE-00 atmosphere and the bundled CelesTrak space weather (SIM_061). The port is checked against NRL's Fortran
// (via pymsis), the table against raw CelesTrak rows, and runs for solar-cycle and storm behaviour, overrides and warnings.
import { S, fixture } from './setup.mjs';
import { nrlmsise00 } from '../../src/core/nrlmsise00.js';
import { spaceWeather } from '../../src/core/space-weather.js';
import { dayNumber } from '../../src/core/time.js';
let fails = 0; const check = (id, what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (d !== undefined ? '  [' + d + ']' : '')); };
const RE = S.EARTH.a, errOf = c => { try { S.normalizeConfig(c); return ''; } catch (e) { return e.message; } };
const cfg = (epoch, fm, dur, integ) => ({ parent: { shape: 'earth_default' }, start_epoch: epoch, duration: dur || 'P1D', integrator: integ || { type: 'dop853', rtol: 1e-10, atol: 1e-6 }, output_step_s: 3600,
  force_model: fm, satellites: { count: 1, mass_kg: 100, cd: 2.2, area_m2: 1, orbits: [{ type: 'keplerian', a_m: RE + 400e3, e: 0.0005, i_deg: 51.6, raan_deg: 10, argp_deg: 0, ta_deg: 0 }] } });
const MSIS = { drag: true, atmosphere: 'nrlmsise00' }, work = c => -S.run(c).report[0].dragWork;
const utc = (y, m, d, h) => dayNumber(y, m, d) * 86400 - 43200 + h * 3600;

// 1. The port against NRL's Fortran NRLMSISE-00 (pymsis, version 0): 120 cases, 0.5 to 1000 km, daily-Ap and 3-hour-ap modes
{ const T = fixture('msis_truth.json'), names = ['HE', 'O', 'N2', 'O2', 'AR', null, 'H', 'N', 'ANOMALOUS_O']; let er = 0, et = 0, emaj = 0;
  for (const c of T) {
    const o = nrlmsise00({ doy: c.doy, sec: c.sec, alt: c.alt, g_lat: c.lat, g_long: c.lon, lst: c.sec / 3600 + c.lon / 15, f107A: c.f107a, f107: c.f107, ap: c.ap[0], ap_a: c.mode === 'ap_array' ? c.ap : null });
    er = Math.max(er, Math.abs(o.d[5] / c.rho - 1)); et = Math.max(et, Math.abs(o.t[1] / c.T - 1));
    for (const k of [1, 2, 3]) { const v = c.n[names[k]]; if (v && v > 1e-20) emaj = Math.max(emaj, Math.abs(o.d[k] / v - 1)); }
  }
  check('SIM_061', 'NRLMSISE-00 port matches NRL Fortran (pymsis): total mass density within 2e-4, temperature within 1e-4, N2/O/O2 within 1e-3', er < 2e-4 && et < 1e-4 && emaj < 1e-3,
    'rho ' + er.toExponential(1) + ', T ' + et.toExponential(1) + ', major species ' + emaj.toExponential(1) + ' over ' + T.length + ' cases'); }

// 2. Table lookups against the raw CelesTrak rows (3-hour ap now and 3, 6, 9 h before; previous day's F10.7; 81-day mean)
{ const a = spaceWeather(utc(1989, 3, 13, 22.5)), b = spaceWeather(utc(2024, 5, 11, 1)), q = spaceWeather(utc(2003, 10, 29, 12));
  const ok = a.src === 'observed' && a.f107 === 240.5 && a.f107A === 207.8 && a.ap === 246 && a.ap_a.slice(0, 5).join() === '246,400,300,236,236' &&
    b.f107 === 223.4 && b.f107A === 177.1 && b.ap_a.slice(0, 5).join() === '271,400,300,300,179' && q.ap_a.slice(0, 5).join() === '204,179,207,400,27';
  check('SIM_061', 'space weather table reproduces CelesTrak SW-All rows (March 1989, October 2003 and May 2024 storms)', ok, JSON.stringify([a.ap_a, b.ap_a].map(x => x.slice(0, 5))));
  const p = spaceWeather(utc(2025, 7, 25, 6)), m = spaceWeather(utc(2030, 3, 1, 0)), n = spaceWeather(utc(2045, 1, 1, 0)), o = spaceWeather(utc(2019, 6, 1, 0), { f107: 99, ap: 33 });
  check('SIM_061', 'past the measured data: CelesTrak daily then monthly predictions, then defaults; overrides replace table values', p.src === 'predicted' && p.ap_a && m.src === 'monthly' && m.ap === 15 && !m.ap_a && m.f107 > 60 &&
    n.src === 'none' && n.f107 === 150 && n.ap === 15 && o.f107 === 99 && o.ap === 33 && !o.ap_a && o.f107A === spaceWeather(utc(2019, 6, 1, 0)).f107A, [p.src, m.src, n.src].join(' / ')); }

// 3. Solar cycle and storms: density follows the space weather (implied from 1-day drag work at 400 km)
{ const wMin = work(cfg('2019-06-01T00:00:00.000 UTC', MSIS)), wMax = work(cfg('2014-02-20T00:00:00.000 UTC', MSIS)), wStorm = work(cfg('2024-05-10T12:00:00.000 UTC', MSIS)),
    wFix = work(cfg('2019-06-01T00:00:00.000 UTC', { drag: true, atmosphere: 'nrlmsise00', space_weather: { f107: 150, f107a: 150, ap: 15 } })), wExp = work(cfg('2019-06-01T00:00:00.000 UTC', { drag: true }));
  check('SIM_061', 'drag at 400 km: solar minimum < moderate fixed values < solar maximum < May 2024 storm; solar max/min ratio above 5', wMin < wFix && wFix < wMax && wMax < wStorm && wMax / wMin > 5,
    'min ' + wMin.toFixed(0) + ', fixed ' + wFix.toFixed(0) + ', max ' + wMax.toFixed(0) + ', storm ' + wStorm.toFixed(0) + ' J/kg');
  check('SIM_061', 'moderate fixed values (150/150/15) give drag within 30% of the exponential table, which is a moderate-activity profile', Math.abs(wFix / wExp - 1) < 0.3, (wFix / wExp).toFixed(3)); }

// 4. "File input uses the value for each epoch": within one UTC day, fixing F10.7 and F10.7A to the table's values changes nothing
{ const s = spaceWeather(utc(2019, 6, 1, 0)), a = work(cfg('2019-06-01T00:00:00.000 UTC', MSIS, 'PT20H')),
    b = work(cfg('2019-06-01T00:00:00.000 UTC', { drag: true, atmosphere: 'nrlmsise00', space_weather: { f107: s.f107, f107a: s.f107A } }, 'PT20H'));
  check('SIM_061', 'run with F10.7 and F10.7A fixed to the table values for that day matches the table run exactly', a === b, a + ' vs ' + b); }

// 5. Both integrators agree with NRLMSISE-00 drag, and energy bookkeeping holds
{ const c = cfg('2024-05-10T00:00:00.000 UTC', MSIS, 'P1D'), a = S.run(c), b = S.run(cfg('2024-05-10T00:00:00.000 UTC', MSIS, 'P1D', { type: 'rk4', time_step_s: 5 }));
  const pa = a.csv.trim().split('\n').pop().split(',').slice(3, 6).map(Number), pb = b.csv.trim().split('\n').pop().split(',').slice(3, 6).map(Number), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
  check('SIM_061', 'storm day: DOP853 and 5 s RK4 agree within 1 m; energy drift below 1e-8', d < 1 && a.report[0].energyDrift < 1e-8 && b.report[0].energyDrift < 1e-8, d.toExponential(2) + ' m');
  const odd = ig => ({ ...cfg('2024-05-10T07:13:20.000 UTC', { drag: true, srp: true, atmosphere: 'nrlmsise00' }, 'P1D', ig), output_step_s: 600 }), rows = r => r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(',').slice(3, 6).map(Number));
  const A = rows(S.run(odd({ type: 'dop853', rtol: 1e-10, atol: 1e-6 }))), B = rows(S.run(odd({ type: 'dop853', rtol: 1e-12, atol: 1e-8 }))), dc = Math.max(...A.map((q, k) => Math.hypot(q[0] - B[k][0], q[1] - B[k][1], q[2] - B[k][2])));
  check('SIM_061', 'storm day with SRP, odd start time: DOP853 converges across 3-hour space-weather steps and shadows (rtol 1e-10 vs 1e-12 within 5 cm)', dc < 0.05, dc.toExponential(2) + ' m');
  check('SIM_061', 'plan.csv names the model and the space-weather table version', /drag \(NRLMSISE-00 atmosphere, space weather from the bundled CelesTrak table/.test(a.csv) && /# data_file: name=space_weather; version=2025 Jul 21/.test(a.csv)); }

// 6. Warnings and input checks
{ const w26 = S.normalizeConfig(cfg('2026-11-10T06:30:00.000 UTC', MSIS)).warnings, w45 = S.normalizeConfig(cfg('2045-01-01T00:00:00.000 UTC', MSIS)).warnings,
    wFix = S.normalizeConfig(cfg('2045-01-01T00:00:00.000 UTC', { drag: true, atmosphere: 'nrlmsise00', space_weather: { f107: 120, f107a: 120, ap: 10 } })).warnings, wObs = S.normalizeConfig(cfg('2019-06-01T00:00:00.000 UTC', MSIS)).warnings;
  check('SIM_061', 'warns when space weather is predicted or missing, not when it is measured or fully set', w26.some(w => /monthly F10\.7 prediction.*Ap = 15/.test(w)) && w45.some(w => /No space weather data/.test(w)) && !wFix.length && !wObs.length, w26.concat(w45).join(' | '));
  const e1 = errOf(cfg('2019-06-01T00:00:00.000 UTC', { atmosphere: 'nrlmsise00' })), e2 = errOf(cfg('2019-06-01T00:00:00.000 UTC', { drag: true, atmosphere: 'jb2008' })),
    e3 = errOf(cfg('2019-06-01T00:00:00.000 UTC', { drag: true, space_weather: { f107: 100 } })), e4 = errOf(cfg('2019-06-01T00:00:00.000 UTC', { drag: true, atmosphere: 'nrlmsise00', space_weather: { ap: 500, kp: 3 } }));
  check('SIM_061', 'input checks: atmosphere needs drag and a known model; space_weather needs nrlmsise00 and sane values', /atmosphere: only used with "drag": true/.test(e1) && /atmosphere: must be "exponential" or "nrlmsise00"/.test(e2) &&
    /space_weather: only used with "atmosphere": "nrlmsise00"/.test(e3) && /space_weather\.ap: must be at most 400/.test(e4) && /space_weather\.kp: unknown field/.test(e4), [e1, e2, e3, e4].join(' | ')); }

if (fails) { console.log('\n' + fails + ' check(s) failed'); process.exit(1); }
console.log('\nall passed');
