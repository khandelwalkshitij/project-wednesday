// Runs every example config (and two SRP cases) through the simulator and writes validation/runs/*.json
// for compare_orekit.py. Each case runs at the configured step and at half that step.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SimCore as S } from '../src/core/index.js';
import { PRESETS, resetConfig, kep, RE } from '../src/app/presets-data.js';
import { GM_MOON, GM_SUN } from '../src/core/constants.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../index.html'), 'utf8');
const leapText = /<script type="application\/json" id="leap-seconds">([\s\S]*?)<\/script>/.exec(html)[1];
S.setLeapSeconds(JSON.parse(leapText), leapText);

const EXTRA = [
  ['Validation: SRP, 700 km sun-synchronous, A/m = 0.1', () => ({ parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P2D',
    integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60, force_model: { srp: true },
    satellites: { count: 1, mass_kg: 100, cr: 1.5, area_m2: 10, names: ['SRP-LEO'], orbits: [kep(RE + 700e3, 0.001, 98.2, 30, 0, 0)] } })],
  ['Validation: SRP, geostationary, A/m = 0.1', () => ({ parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P3D',
    integrator: { type: 'rk4', time_step_s: 60 }, output_step_s: 600, force_model: { srp: true },
    satellites: { count: 1, mass_kg: 100, cr: 1.5, area_m2: 10, names: ['SRP-GEO'], orbits: [kep(42164137, 0.0002, 0.1, 0, 0, 0)] } })],
];
// v0.4.0 additions: the adaptive integrator, NRLMSISE-00 drag with the bundled space weather, and Sun and Moon gravity
const DOP = { type: 'dop853', rtol: 1e-10, atol: 1e-6 };
const withDop = name => () => { const c = PRESETS.find(p => p[0].includes(name))[1](); c.integrator = { ...DOP }; return c; };
const earth = (epoch, dur, out, fm, sats) => ({ parent: { shape: 'earth_default' }, start_epoch: epoch, duration: dur, integrator: { ...DOP }, output_step_s: out, force_model: fm, satellites: sats });
const V4 = [
  ['v0.4.0: DOP853, low orbit, Molniya and geostationary', withDop('Molniya')],
  ['v0.4.0: DOP853, drag decay and re-boost burns', withDop('drag decay')],
  ['v0.4.0: NRLMSISE-00 drag, May 2024 storm', () => earth('2024-05-10T12:00:00.000 UTC', 'P1D', 300, { drag: true, atmosphere: 'nrlmsise00' },
    { count: 1, mass_kg: 100, cd: 2.2, area_m2: 1, names: ['STORM-400'], orbits: [kep(RE + 400e3, 0.0005, 51.6, 10, 0, 0)] })],
  ['v0.4.0: NRLMSISE-00 drag, solar minimum 2019', () => earth('2019-06-01T00:00:00.000 UTC', 'P1D', 300, { drag: true, atmosphere: 'nrlmsise00' },
    { count: 1, mass_kg: 100, cd: 2.2, area_m2: 1, names: ['QUIET-400'], orbits: [kep(RE + 400e3, 0.0005, 51.6, 10, 0, 0)] })],
  ['v0.4.0: Sun and Moon gravity, 500 km', () => earth('2026-11-10T06:30:00.000 UTC', 'P3D', 600, { third_body: true },
    { count: 1, mass_kg: 100, names: ['LEO-3B'], orbits: [kep(RE + 500e3, 0.001, 51.6, 10, 30, 0)] })],
  ['v0.4.0: Sun and Moon gravity, geostationary', () => earth('2026-11-10T06:30:00.000 UTC', 'P30D', 3600, { third_body: true },
    { count: 1, mass_kg: 3000, names: ['GEO-3B'], orbits: [kep(42164137, 0.0002, 0.05, 20, 0, 0)] })],
];
const CASES = [['Reset (New Trial)', resetConfig], ...PRESETS, ...EXTRA, ...V4];

function rowsOf(csv) {
  const L = csv.split('\n').filter(l => l && l[0] !== '#'), head = L[0].split(','), ix = k => head.indexOf(k), out = {};
  for (const l of L.slice(1)) {
    const c = l.split(','), n = c[ix('sat_name')];
    (out[n] = out[n] || []).push([+c[ix('t_s')], ...['x_m', 'y_m', 'z_m', 'vx_m_s', 'vy_m_s', 'vz_m_s'].map(k => +c[ix(k)])]);
  }
  return out;
}
function elementsOf(cfg) {
  const sa = cfg.satellites;
  const list = sa.pattern ? S.expandPattern(sa.pattern, sa.count) : sa.orbits;
  return list.map(o => (o.type === 'keplerian' ? { a_m: o.a_m, e: o.e, i_deg: o.i_deg, raan_deg: o.raan_deg, argp_deg: o.argp_deg, ta_deg: o.ta_deg } : null));
}
fs.mkdirSync(path.join(here, 'runs'), { recursive: true });
CASES.forEach(([name, fn], k) => {
  const cfg = fn(), c = S.normalizeConfig(cfg), P = S.makeParent(c.parent), t0 = Date.now();
  // the finer run: half the step for RK4, tolerances / 100 for DOP853
  const r1 = S.run(cfg), half = JSON.parse(JSON.stringify(cfg));
  if (half.integrator.type === 'rk4') half.integrator.time_step_s /= 2; else { half.integrator.rtol /= 100; half.integrator.atol /= 100; }
  const r2 = S.run(half), rows = rowsOf(r1.csv), rowsHalf = rowsOf(r2.csv), el = elementsOf(cfg);
  const out = {
    name, config: cfg, tt0: c.epoch.tt, step_s: c.dt, drag: c.drag, srp: c.srp, third_body: c.thirdBody, atmosphere: c.atmosphere, space_weather: c.spaceWeather,
    integrator: c.integrator === 'dop853' ? 'DOP853 ' + cfg.integrator.rtol.toExponential(0) : 'RK4 ' + c.dt + ' s', gm_sun: GM_SUN, gm_moon: GM_MOON,
    parent: { shape: P.shape, mu: P.mu, radius: P.radius, J2: S.EARTH.J2, J3: S.EARTH.J3, J4: S.EARTH.J4, a: S.EARTH.a, f: S.EARTH.f, omega: S.EARTH.omega },
    sats: c.sats.map((s, i) => ({ name: s.name, state: s.state, mass: s.mass, cd: s.cd, area: s.area, cr: s.cr && s.cr.type === 'constant' ? s.cr.value : null, elements: el[i],
      burns: c.burns[i].map(b => ({ t: b.t, dv: b.dv, frame: b.frame })), impact: r1.report[i].impact ? r1.report[i].impact.t : null,
      rows: rows[s.name], rows_half: rowsHalf[s.name] })),
  };
  const f = path.join(here, 'runs', String(k).padStart(2, '0') + '.json');
  fs.writeFileSync(f, JSON.stringify(out));
  console.log(f.split('/').pop(), name, c.sats.length + ' sats', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
});
