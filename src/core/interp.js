// Cubic Hermite interpolation between ephemeris rows.
// state of a plan.csv satellite {t, y} at time t, cubic Hermite between rows. Returns true when t is past the last row.
export function interpState(s, t, out) {
  var n = s.t.length, lo = 0, hi = n - 1, k;
  if (t >= s.t[hi]) { for (k = 0; k < 6; k++) out[k] = s.y[6 * hi + k]; return t > s.t[hi] + 1e-9; }
  if (t <= s.t[0]) { for (k = 0; k < 6; k++) out[k] = s.y[k]; return false; }
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (s.t[mid] <= t) lo = mid; else hi = mid; }
  var h = s.t[hi] - s.t[lo], u = (t - s.t[lo]) / h, u2 = u * u, u3 = u2 * u, a = 2 * u3 - 3 * u2 + 1, b = (u3 - 2 * u2 + u) * h, c = -2 * u3 + 3 * u2, d = (u3 - u2) * h, da = (6 * u2 - 6 * u) / h, db = 3 * u2 - 4 * u + 1, dd = 3 * u2 - 2 * u;
  for (k = 0; k < 3; k++) { var y0 = s.y[6 * lo + k], y1 = s.y[6 * hi + k], v0 = s.y[6 * lo + 3 + k], v1 = s.y[6 * hi + 3 + k]; out[k] = a * y0 + b * v0 + c * y1 + d * v1; out[3 + k] = da * y0 + db * v0 - da * y1 + dd * v1; }
  return false;
}

export function hermite(y0, f0, y1, f1, o, h, s, out) {
  var s2 = s * s, s3 = s2 * s, a = 2 * s3 - 3 * s2 + 1, b = (s3 - 2 * s2 + s) * h, c = -2 * s3 + 3 * s2, d = (s3 - s2) * h;
  for (var k = 0; k < 6; k++) out[k] = a * y0[o + k] + b * f0[o + k] + c * y1[o + k] + d * f1[o + k];
}
