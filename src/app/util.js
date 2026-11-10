// Number and time formatting helpers for the report and telemetry.
// ------------------------------------------------------------ formatting helpers
export function fmtLen(m) { var a = Math.abs(m); return a >= 1e4 ? (m / 1000).toFixed(a >= 1e7 ? 0 : 1) + ' km' : m.toFixed(a >= 100 ? 0 : 1) + ' m'; }

export function fmtSpeed(v) { return v >= 100 ? (v / 1000).toFixed(3) + ' km/s' : v.toFixed(3) + ' m/s'; }

export function fmtElapsed(t) { var d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), p = function (n) { return (n < 10 ? '0' : '') + n; }; return 'T+ ' + (d ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(s); }

export function colour(i) { return 'hsl(' + ((i * 137.508 + 38) % 360).toFixed(0) + ',100%,60%)'; }

export function fields(str) { var o = {}; str.split('; ').forEach(function (kv) { var j = kv.indexOf('='); o[kv.slice(0, j)] = kv.slice(j + 1); }); return o; }
