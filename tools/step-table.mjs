// Prints the step-size table in docs/accuracy.md: position error after one day for each integrator setting, against DOP853 at
// rtol 1e-13 (which agrees with Orekit to millimetres, see docs/benchmark-orekit.md). Usage: node tools/step-table.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SimCore as S } from '../src/core/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leap = /id="leap-seconds">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))[1];
S.setLeapSeconds(JSON.parse(leap), leap);
const RE = S.EARTH.a, kep = (a, e, i, raan, argp) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: argp, ta_deg: 0 });
const ORBITS = [
  ['LEO 400 km', kep(RE + 400e3, 0.0005, 51.6, 10, 0), null],
  ['LEO 400 km, drag + SRP', kep(RE + 400e3, 0.0005, 51.6, 10, 0), { drag: true, srp: true }],
  ['SSO 800 km', kep(RE + 800e3, 0.001, 98.6, 80, 0), null],
  ['Molniya (e = 0.72)', kep(26600e3, 0.72, 63.4, 40, 270), null],
  ['GEO', kep(42164e3, 0.0002, 0.05, 20, 0), null],
];
const RK4 = [1, 5, 10, 30, 60, 120], DOP = [1e-8, 1e-10, 1e-12];
const cfg = (orbit, fm, integ) => ({ parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P1D', integrator: integ, output_step_s: 600,
  force_model: fm || 'gravity_only', satellites: { count: 1, mass_kg: 100, cd: 2.2, cr: 1.5, area_m2: 1, orbits: [orbit] } });
const pos = r => r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(',').slice(3, 6).map(Number));
const err = (a, b) => Math.max(...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1], p[2] - b[k][2])));
const sig = x => String(+x.toPrecision(2)), fmt = m => m < 0.001 ? '< 1 mm' : m < 1 ? sig(m * 100) + ' cm' : m < 1000 ? sig(m) + ' m' : sig(m / 1000) + ' km';
console.log('| Orbit, 1 day | ' + RK4.map(h => 'RK4 ' + h + ' s').join(' | ') + ' | ' + DOP.map(t => 'DOP853 ' + t.toExponential(0).replace('e-', 'e-')).join(' | ') + ' |');
console.log('|---|' + RK4.concat(DOP).map(() => '---|').join(''));
for (const [name, orbit, fm] of ORBITS) {
  const ref = pos(S.run(cfg(orbit, fm, { type: 'dop853', rtol: 1e-13, atol: 1e-9 }))), cells = [];
  for (const h of RK4) { try { cells.push(fmt(err(pos(S.run(cfg(orbit, fm, { type: 'rk4', time_step_s: h }))), ref))); } catch (e) { cells.push('rejected'); } }
  for (const t of DOP) { const r = S.run(cfg(orbit, fm, { type: 'dop853', rtol: t, atol: t * 1e4 })); cells.push(fmt(err(pos(r), ref)) + ' (' + r.steps + ' steps)'); }
  console.log('| ' + name + ' | ' + cells.join(' | ') + ' |');
}
