// Reads a plan.csv back into satellite tracks for playback.
import { normalizeConfig } from './config.js';
import { D2R } from './constants.js';
import { makeParent } from './parent.js';
import { COLUMNS } from './propagator.js';

// ---------------------------------------------------------------- plan.csv reader (SIM_051, SIM_074)
export function parsePlanCsv(text) {
  var lines = text.split(/\r?\n/), meta = { dataFiles: [], reports: [], impacts: [] }, i = 0;
  for (; i < lines.length && lines[i].charAt(0) === '#'; i++) {
    var m = /^#\s*([a-z_0-9]+):\s*(.*)$/.exec(lines[i]); if (!m) continue;
    if (m[1] === 'config') meta.config = JSON.parse(m[2]);
    else if (m[1] === 'data_file') meta.dataFiles.push(m[2]); else if (m[1] === 'report') meta.reports.push(m[2]); else if (m[1] === 'impact') meta.impacts.push(m[2]);
    else if (m[1] !== 'column') meta[m[1]] = m[2];
  }
  if (!meta.config || (lines[i] || '').indexOf(COLUMNS.slice(0, 10).map(function (c) { return c[0]; }).join(',')) !== 0)
    throw new Error('This file is not a plan.csv written by this simulator (missing "# config:" line or column header).');
  var cfg = normalizeConfig(meta.config), P = makeParent(cfg.parent), sats = [], byName = {}, times = [], rot = [];
  for (i++; i < lines.length; i++) {
    if (!lines[i]) continue;
    var q = lines[i].split(','), t = +q[2], s = byName[q[0]];
    if (!s) { s = byName[q[0]] = { name: q[0], t: [], y: [] }; sats.push(s); }
    s.t.push(t); s.y.push(+q[3], +q[4], +q[5], +q[6], +q[7], +q[8]);
    if (!times.length || t > times[times.length - 1]) { times.push(t); rot.push(+q[9] * D2R); }
  }
  if (!sats.length) throw new Error('plan.csv has no data rows.');
  sats.forEach(function (s) {
    s.t = Float64Array.from(s.t); s.y = Float64Array.from(s.y);
    cfg.sats.forEach(function (sc) { if (sc.name === s.name) s.satCfg = sc; });
  });
  var burns = {}; cfg.sats.forEach(function (sc, k) { burns[sc.name] = cfg.burns[k].map(function (b) { return b.t; }); });
  return { meta: meta, tt0: cfg.epoch.tt, drag: cfg.drag, srp: cfg.srp, burns: burns, parent: { shape: P.shape, radius: P.radius, flattening: P.flattening, mu: P.mu, omega: P.omega, frame: P.frame },
    poleRa: +meta.parent_pole_ra_deg * D2R, poleDec: +meta.parent_pole_dec_deg * D2R, times: Float64Array.from(times), rot: Float64Array.from(rot), sats: sats };
}
