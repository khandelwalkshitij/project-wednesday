// Keplerian elements to and from Cartesian state.
import { TWO_PI } from './constants.js';

// ---------------------------------------------------------------- orbit elements (SIM_019, SIM_020)
export function kepToState(mu, a, e, i, raan, argp, ta) {
  var p = a * (1 - e * e), cn = Math.cos(ta), sn = Math.sin(ta), r = p / (1 + e * cn), s = Math.sqrt(mu / p);
  var xp = r * cn, yp = r * sn, vxp = -s * sn, vyp = s * (e + cn);
  var cO = Math.cos(raan), sO = Math.sin(raan), co = Math.cos(argp), so = Math.sin(argp), ci = Math.cos(i), si = Math.sin(i);
  var r11 = cO * co - sO * so * ci, r12 = -cO * so - sO * co * ci, r21 = sO * co + cO * so * ci, r22 = -sO * so + cO * co * ci, r31 = so * si, r32 = co * si;
  return [r11 * xp + r12 * yp, r21 * xp + r22 * yp, r31 * xp + r32 * yp, r11 * vxp + r12 * vyp, r21 * vxp + r22 * vyp, r31 * vxp + r32 * vyp];
}

export function stateToKep(mu, s) {
  var x = s[0], y = s[1], z = s[2], vx = s[3], vy = s[4], vz = s[5], r = Math.hypot(x, y, z), v2 = vx * vx + vy * vy + vz * vz, rv = x * vx + y * vy + z * vz;
  var hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx, h = Math.hypot(hx, hy, hz), nx = -hy, ny = hx, n = Math.hypot(nx, ny);
  var k = v2 - mu / r, ex = (k * x - rv * vx) / mu, ey = (k * y - rv * vy) / mu, ez = (k * z - rv * vz) / mu, e = Math.hypot(ex, ey, ez);
  var a = -mu / (2 * (v2 / 2 - mu / r)), inc = Math.acos(Math.max(-1, Math.min(1, hz / h))), eq = n < 1e-11 * h, circ = e < 1e-11;
  var ac = function (c) { return Math.acos(Math.max(-1, Math.min(1, c))); }, wrap = function (q) { return q < 0 ? q + TWO_PI : q; };
  var raan = eq ? 0 : wrap(Math.atan2(ny, nx)), argp, ta;
  if (circ) argp = 0; else if (eq) argp = wrap(Math.atan2(ey, ex) * (hz < 0 ? -1 : 1)); else { argp = ac((nx * ex + ny * ey) / (n * e)); if (ez < 0) argp = TWO_PI - argp; }
  if (!circ) { ta = ac((ex * x + ey * y + ez * z) / (e * r)); if (rv < 0) ta = TWO_PI - ta; }
  else if (!eq) { ta = ac((nx * x + ny * y) / (n * r)); if (z < 0) ta = TWO_PI - ta; }
  else ta = wrap(Math.atan2(y, x) * (hz < 0 ? -1 : 1));
  return { a: a, e: e, i: inc, raan: raan, argp: argp, ta: ta };
}
