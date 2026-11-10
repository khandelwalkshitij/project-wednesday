// Time scales (UTC, TAI, TT, TDB, GPS), leap seconds, epoch and ISO 8601 duration parsing.
import { ConfigError } from './constants.js';
import { crc32 } from './math.js';
import { TDB_TERMS } from '../data/tdb-series.js';

// ---------------------------------------------------------------- time scales (SIM_014, SIM_060)
export var leap = null;

export function dayNumber(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5) - 10957; }
   // days since 2000-01-01
export function setLeapSeconds(obj, rawText) {
  var days = [], dat = [], thr = [];
  obj.entries.forEach(function (e) {
    var p = e[0].split('-').map(Number), dn = dayNumber(p[0], p[1], p[2]);
    days.push(dn); dat.push(e[1]); thr.push(dn * 86400 - 43200 + e[1]);
  });
  leap = { name: obj.name, version: obj.version, source: obj.source, days: days, dat: dat, thr: thr, checksum: crc32(rawText || JSON.stringify(obj)) };
}

export function datForDay(dn) { var i = -1; for (var k = 0; k < leap.days.length; k++) if (leap.days[k] <= dn) i = k; return i; }

export function leapIndexForTai(tai) { var i = 0; for (var k = 0; k < leap.thr.length; k++) if (tai >= leap.thr[k]) i = k; return i; }

export function tdbMinusTt(tt) {            // truncated Fairhead & Bretagnon series (ERFA dtdb), geocentre
  var t = tt / (86400 * 365250), w = 0;
  for (var k = TDB_TERMS.length - 1; k >= 0; k--) { var g = TDB_TERMS[k], s = 0; for (var j = 0; j < g.length; j++) s += g[j][0] * Math.sin(g[j][1] * t + g[j][2]); w = w * t + s; }
  return w;
}

export var EPOCH_RE = /^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\s*(UTC|TAI|TT|TDB|GPS)\s*$/;

export function parseEpoch(str, path) {
  path = path || 'epoch';
  var m = typeof str === 'string' && EPOCH_RE.exec(str);
  if (!m) throw new ConfigError([path + ': expected "YYYY-MM-DDThh:mm:ss.sss SCALE" with SCALE one of UTC, TAI, TT, TDB, GPS']);
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +m[6], scale = m[7];
  var dn = dayNumber(y, mo, d), chk = new Date((dn + 10957) * 864e5);
  if (y < 1900 || y > 2200 || chk.getUTCFullYear() !== y || chk.getUTCMonth() + 1 !== mo || chk.getUTCDate() !== d || h > 23 || mi > 59 || s >= 61)
    throw new ConfigError([path + ': not a valid date and time (years 1900 to 2200)']);
  var nominal = dn * 86400 - 43200 + h * 3600 + mi * 60 + s, tt;
  if (s >= 60) {
    var nx = scale === 'UTC' && h === 23 && mi === 59 ? leap.days.indexOf(dn + 1) : -1;
    if (nx < 1 || leap.dat[nx] <= leap.dat[nx - 1]) throw new ConfigError([path + ': seconds of 60 are only valid in UTC during a leap second']);
  }
  if (scale === 'TT') tt = nominal;
  else if (scale === 'TAI') tt = nominal + 32.184;
  else if (scale === 'GPS') tt = nominal + 19 + 32.184;
  else if (scale === 'TDB') tt = nominal - tdbMinusTt(nominal);
  else {
    var i = datForDay(dn);
    if (i < 0) throw new ConfigError([path + ': UTC epochs before 1972-01-01 are not supported']);
    tt = nominal + leap.dat[i] + 32.184;
  }
  return { tt: tt, scale: scale };
}

export function utcNominal(tt) { var tai = tt - 32.184; return tai - leap.dat[leapIndexForTai(tai)]; }

export function p2(n) { return (n < 10 ? '0' : '') + n; }

export function formatUtc(tt) {
  var tai = tt - 32.184, i = leapIndexForTai(tai), inLeap = i + 1 < leap.thr.length && tai >= leap.thr[i + 1] - 1;
  var u = tai - leap.dat[i] - (inLeap ? 1 : 0);
  var ms = Math.round((u + 43200) * 1000), days = Math.floor(ms / 864e5), r = ms - days * 864e5;
  if (inLeap && r < 864e5 - 1000) { days -= 1; r = 864e5 - 1; }
  var dt = new Date((days + 10957) * 864e5), hh = Math.floor(r / 36e5), mm = Math.floor(r / 6e4) % 60, ss = Math.floor(r / 1000) % 60 + (inLeap ? 1 : 0), ml = r % 1000;
  return dt.getUTCFullYear() + '-' + p2(dt.getUTCMonth() + 1) + '-' + p2(dt.getUTCDate()) + 'T' + p2(hh) + ':' + p2(mm) + ':' + p2(ss) + '.' + ('00' + ml).slice(-3) + 'Z';
}

export function parseDuration(v, path) {
  if (typeof v === 'number') { if (!(v > 0) || !isFinite(v)) throw new ConfigError([path + ': must be a positive number of seconds']); return v; }
  var m = typeof v === 'string' && /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v.trim());
  var s = m ? (+m[1] || 0) * 604800 + (+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0) : 0;
  if (!m || !(s > 0)) throw new ConfigError([path + ': expected seconds or an ISO 8601 duration such as "P1DT6H" (weeks, days, hours, minutes, seconds)']);
  return s;
}
