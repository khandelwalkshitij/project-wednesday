// Solar flux and geomagnetic indices for NRLMSISE-00 from the bundled CelesTrak table (src/data/space-weather.js), with
// fixed values from the config able to replace any of them. No network access: data past the table end falls back to
// CelesTrak's monthly predictions (F10.7 only) and then to fixed defaults, and the config validation says so.
import { SW_DAILY, SW_META, SW_MONTHLY } from '../data/space-weather.js';

export var SW_DEFAULT = { f107: 150, f107a: 150, ap: 15 };    // used where the table has no value (the usual moderate-activity defaults)
var REC = 15, DEC = {}, LEV = SW_META.apLevels;
for (var q = 0; q < SW_META.alphabet.length; q++) DEC[SW_META.alphabet.charAt(q)] = q;
function num(pos, n) { var v = 0; for (var k = 0; k < n; k++) v = v * 91 + DEC[SW_DAILY.charAt(pos + k)]; return v; }

export function dayOfUtc(utc) { return Math.floor((utc + 43200) / 86400); }      // utc: nominal UTC seconds from J2000 (as utcNominal)
export function dayLabel(dn) { return new Date((dn + 10957) * 864e5).toISOString().slice(0, 10); }
var M0 = SW_MONTHLY.length ? SW_MONTHLY[0][0] * 12 + SW_MONTHLY[0][1] - 1 : 0;

// one day's values and where they come from: 'observed' | 'predicted' (CelesTrak daily) | 'monthly' (CelesTrak monthly, no Ap) | 'none'
export function dayRecord(dn) {
  var i = dn - SW_META.firstDay;
  if (i >= 0 && i < SW_META.days) {
    var p = i * REC;
    return { src: dn <= SW_META.lastObservedDay ? 'observed' : 'predicted', ap: num(p + 8, 2), f107: num(p + 10, 3) / 10, f107a: num(p + 13, 2) / 10 };
  }
  if (i >= SW_META.days) {
    var d = new Date((dn + 10957) * 864e5), mi = d.getUTCFullYear() * 12 + d.getUTCMonth() - M0;
    if (mi < SW_MONTHLY.length) { var m = SW_MONTHLY[Math.max(0, mi)]; return { src: 'monthly', ap: null, f107: m[2], f107a: m[3] }; }
  }
  return { src: 'none', ap: null, f107: null, f107a: null };
}

function ap3(k) { var i = k >> 3, j = k & 7; return i >= 0 && i < SW_META.days ? LEV[DEC[SW_DAILY.charAt((i * REC) + j)]] : NaN; }

// MSIS inputs at a UTC instant. ov: config override { f107, f107a, ap } (any subset). Returns a new object.
export function spaceWeather(utc, ov) {
  var dn = dayOfUtc(utc), today = dayRecord(dn), prev = dayRecord(dn - 1); ov = ov || {};
  var r = { f107: ov.f107 !== undefined ? ov.f107 : prev.f107 !== null ? prev.f107 : SW_DEFAULT.f107,
    f107A: ov.f107a !== undefined ? ov.f107a : today.f107a !== null ? today.f107a : SW_DEFAULT.f107a,
    ap: ov.ap !== undefined ? ov.ap : today.ap !== null ? today.ap : SW_DEFAULT.ap, ap_a: null, src: today.src };
  if (ov.ap === undefined && today.ap !== null) {          // 3-hour ap history: now, 3, 6, 9 h before, then means over 12-33 h and 36-57 h before
    var k = (dn - SW_META.firstDay) * 8 + Math.floor((utc + 43200 - dn * 86400) / 10800), a = [r.ap, ap3(k), ap3(k - 1), ap3(k - 2), ap3(k - 3), 0, 0], j;
    for (j = 4; j < 12; j++) a[5] += ap3(k - j) / 8;
    for (j = 12; j < 20; j++) a[6] += ap3(k - j) / 8;
    if (a.every(function (v) { return isFinite(v); })) r.ap_a = a;
  }
  return r;
}

// config warnings for a run spanning [utc0, utc1]
export function spaceWeatherNotes(utc0, utc1, ov) {
  ov = ov || {}; var W = [], d0 = dayOfUtc(utc0) - 1, d1 = dayOfUtc(utc1), seen = {}, first = {}, dn, s;
  if (ov.f107 !== undefined && ov.f107a !== undefined && ov.ap !== undefined) return W;
  for (dn = d0; dn <= d1; dn++) { s = dayRecord(dn).src; if (!seen[s]) { seen[s] = true; first[s] = dn; } }
  var upd = ' (bundled CelesTrak table, updated ' + SW_META.updated + ')';
  if (seen.predicted) W.push('Space weather from ' + dayLabel(first.predicted) + ' is CelesTrak\'s daily prediction, not measured' + upd + '. Set force_model.space_weather to use your own values.');
  if (seen.monthly) W.push('Space weather from ' + dayLabel(first.monthly) + ' is CelesTrak\'s monthly F10.7 prediction' + (ov.ap === undefined ? ', and Ap is not predicted, so Ap = ' + SW_DEFAULT.ap + ' is used' : '') + upd + '. Set force_model.space_weather to use your own values.');
  if (seen.none) W.push('No space weather data for ' + dayLabel(first.none) + (dayRecord(d1).src === 'none' && first.none !== d1 ? ' to ' + dayLabel(d1) : '') + ': using F10.7 = ' + SW_DEFAULT.f107 + ', Ap = ' + SW_DEFAULT.ap + ' unless set in force_model.space_weather.');
  return W;
}

export function spaceWeatherVersion() { return SW_META.updated; }
