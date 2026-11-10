// Local time of the ascending node and line fitting for drift rates.
import { earthRotation } from './earth-orientation.js';
import { mvec } from './math.js';
import { p2, utcNominal } from './time.js';

// ---------------------------------------------------------------- LTAN (SIM_083): mean local solar time at the ascending node, hours 0 to 24
// The node is the intersection of the orbit plane with the true equator of date. Mean solar time = UT1 + longitude / 15 deg per hour.
export function ltanFromMatrix(M, s, tt, dut1) {
  var hx = s[1] * s[5] - s[2] * s[4], hy = s[2] * s[3] - s[0] * s[5], hz = s[0] * s[4] - s[1] * s[3];
  var nx = M[7] * hz - M[8] * hy, ny = M[8] * hx - M[6] * hz, nz = M[6] * hy - M[7] * hx;     // pole of date x h points at the ascending node
  if (Math.hypot(nx, ny, nz) < 1e-6 * Math.hypot(hx, hy, hz)) return NaN;                     // equatorial orbit: no node
  var nb = mvec(M, [nx, ny, nz]), ut = (utcNominal(tt) + (dut1 || 0)) / 86400 + 0.5;
  var h = (ut - Math.floor(ut)) * 24 + Math.atan2(nb[1], nb[0]) * 12 / Math.PI;
  return ((h % 24) + 24) % 24;
}

export function ltanHours(s, tt, dut1) { return ltanFromMatrix(earthRotation(tt, dut1).M, s, tt, dut1); }

export function unwrapHours(prev, h) { return h + 24 * Math.round((prev - h) / 24); }

export function fitLine(t, y) {
  var n = t.length, sx = 0, sy = 0, sxx = 0, sxy = 0; for (var i = 0; i < n; i++) { sx += t[i]; sy += y[i]; sxx += t[i] * t[i]; sxy += t[i] * y[i]; }
  var d = n * sxx - sx * sx, m = n > 1 && d ? (n * sxy - sx * sy) / d : 0; return [m, (sy - m * sx) / (n || 1)];
}

export function fmtHms(h) { var x = Math.round((((h % 24) + 24) % 24) * 3600) % 86400; return p2(Math.floor(x / 3600)) + ':' + p2(Math.floor(x / 60) % 60) + ':' + p2(x % 60); }
