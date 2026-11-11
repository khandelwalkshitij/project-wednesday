// Simulator side of tools/bench_orekit.py. Reads one JSON request on stdin, prints a JSON answer:
//   {"kind": "run", "config": {...}}                    -> {"rows": [[t, x, y, z, vx, vy, vz], ...], "ms": wall time, "steps": n}
//   {"kind": "density", "points": [{"tt", "r"}], "sw"}  -> {"rho": [...]}   (NRLMSISE-00, GCRF position r [m], TT seconds from J2000)
//   {"kind": "sgp4", "tles": [[l1, l2]], "minutes": []} -> {"teme": [[[x, y, z, vx, vy, vz] per minute] per TLE], "gcrf": [...]}
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SimCore as S } from '../src/core/index.js';
import { earthRotation } from '../src/core/earth-orientation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leap = /<script type="application\/json" id="leap-seconds">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))[1];
S.setLeapSeconds(JSON.parse(leap), leap);
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
let out;
if (req.kind === 'run') {
  const t0 = performance.now(), r = S.run(req.config), ms = performance.now() - t0;
  out = { ms, steps: r.steps, rows: r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => { const v = l.split(','); return [+v[2], +v[3], +v[4], +v[5], +v[6], +v[7], +v[8]]; }) };
} else if (req.kind === 'density') {
  out = { rho: req.points.map(p => { const rb = S.mvec(earthRotation(p.tt, 0).M, p.r), g = S.geodetic(rb[0], rb[1], rb[2], S.EARTH.a, S.EARTH.f); return S.msisDensity(p.tt, g.lat, g.lon, g.h, req.sw || null); }) };
} else if (req.kind === 'sgp4') {
  out = { teme: [], gcrf: [] };
  for (const [l1, l2] of req.tles) {
    const tle = S.parseTle(l1, l2);
    out.teme.push(req.minutes.map(m => { const p = S.sgp4(tle.satrec, m); return [p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z].map(v => v * 1000); }));
    out.gcrf.push(req.minutes.map(m => S.tleState(tle, tle.tt + 60 * m)));
  }
}
process.stdout.write(JSON.stringify(out));
