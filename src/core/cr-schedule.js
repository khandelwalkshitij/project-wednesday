// SRP coefficient (Cr): constant or time schedule, parsing and interpolation.
import { parseEpoch } from './time.js';

// ---------------------------------------------------------------- Solar Radiation Pressure / Drag Cr helpers
export function parseCr(v, p, tt0, E) {
  if (v === undefined) return { type: 'constant', value: 1.8 };
  if (typeof v === 'number') {
    if (!(v > 0) || !isFinite(v) || v > 3.0) { E.push(p + ': must be a number between 0 and 3.0'); return { type: 'constant', value: 1.8 }; }
    return { type: 'constant', value: v };
  }
  if (Array.isArray(v)) {
    if (!v.length) { E.push(p + ': schedule array cannot be empty'); return { type: 'constant', value: 1.8 }; }
    var entries = [];
    v.forEach(function (item, j) {
      var pj = p + '[' + j + ']', t = null, crVal = null;
      if (Array.isArray(item) && item.length === 2) {
        if (typeof item[0] === 'number' && isFinite(item[0])) t = item[0];
        else E.push(pj + '[0]: must be a number of seconds');
        if (typeof item[1] === 'number' && isFinite(item[1])) crVal = item[1];
        else E.push(pj + '[1]: must be a number');
      } else if (item && typeof item === 'object') {
        if (typeof item.cr === 'number' && isFinite(item.cr)) crVal = item.cr;
        else E.push(pj + '.cr: must be a number');
        if (typeof item.t_s === 'number' && isFinite(item.t_s)) t = item.t_s;
        else if (item.epoch !== undefined) {
          try { t = parseEpoch(item.epoch, pj + '.epoch').tt - tt0; } catch (e) { E.push(e.message); }
        } else {
          E.push(pj + ': must specify t_s (seconds) or epoch');
        }
      } else {
        E.push(pj + ': expected [t_s, cr] or {t_s/epoch, cr}');
      }
      if (crVal !== null && (!(crVal > 0) || crVal > 3.0)) {
        E.push(pj + '.cr: must be between 0 and 3.0');
      }
      if (t !== null && crVal !== null) entries.push([t, crVal]);
    });
    entries.sort(function (a, b) { return a[0] - b[0]; });
    return { type: 'schedule', entries: entries };
  }
  E.push(p + ': must be a number (0 to 3.0) or an array schedule of [t_s, cr] or {t_s/epoch, cr}');
  return { type: 'constant', value: 1.8 };
}

export function getCr(crDef, t) {
  if (!crDef || crDef.type === 'constant') return crDef ? crDef.value : 1.8;
  var ent = crDef.entries;
  if (!ent || !ent.length) return 1.8;
  if (t <= ent[0][0]) return ent[0][1];
  if (t >= ent[ent.length - 1][0]) return ent[ent.length - 1][1];
  var lo = 0, hi = ent.length - 1;
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    if (ent[mid][0] <= t) lo = mid; else hi = mid;
  }
  var dt = ent[hi][0] - ent[lo][0];
  if (dt <= 1e-12) return ent[lo][1];
  var u = (t - ent[lo][0]) / dt;
  return ent[lo][1] + u * (ent[hi][1] - ent[lo][1]);
}
