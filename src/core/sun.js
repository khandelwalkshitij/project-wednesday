// Low-precision Sun direction and distance, cylindrical shadow, beta angle and eclipse events.
import { D2R } from './constants.js';
import { interpState } from './interp.js';

// ---------------------------------------------------------------- Sun, shadow, beta angle (SIM_084, SIM_085). Also drives SRP (SIM_026).
export function sunDirection(tt) {          // unit vector to the Sun in GCRF, low-precision analytic formula, good to about 0.01 deg
  var n = tt / 86400, g = (357.528 + 0.9856003 * n) * D2R, lam = (280.460 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g) - 1.3972 * n / 36525) * D2R, e = 23.4393 * D2R;
  return [Math.cos(lam), Math.cos(e) * Math.sin(lam), Math.sin(e) * Math.sin(lam)];
}

export function sunDistanceAu(tt) {         // Earth-Sun distance [AU], same low-precision series as sunDirection
  var g = (357.528 + 0.9856003 * tt / 86400) * D2R; return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
}

export function inShadow(x, y, z, sd, R) {   // cylindrical shadow of a sphere of radius R
  var d = x * sd[0] + y * sd[1] + z * sd[2]; if (d >= 0) return false;
  var px = x - d * sd[0], py = y - d * sd[1], pz = z - d * sd[2]; return px * px + py * py + pz * pz < R * R;
}

export function betaAngle(s, o, sd) {        // angle between the Sun direction and the orbit plane [rad]
  var hx = s[o + 1] * s[o + 5] - s[o + 2] * s[o + 4], hy = s[o + 2] * s[o + 3] - s[o] * s[o + 5], hz = s[o] * s[o + 4] - s[o + 1] * s[o + 3];
  return Math.asin(Math.max(-1, Math.min(1, (hx * sd[0] + hy * sd[1] + hz * sd[2]) / Math.hypot(hx, hy, hz))));
}

// eclipse entry and exit times for one satellite, refined by bisection. Events cut by the start or end of the run are marked open.
export function eclipseEvents(s, tt0, R) {
  var ev = [], n = s.t.length, st = new Float64Array(6), cur = null, k, j;
  function sh(t) { interpState(s, t, st); return inShadow(st[0], st[1], st[2], sunDirection(tt0 + t), R); }
  function cross(a, b, into) { for (var i = 0; i < 40; i++) { var m = (a + b) / 2; if (sh(m) === into) b = m; else a = m; } return (a + b) / 2; }
  var prev = sh(s.t[0]); if (prev) cur = { t0: s.t[0], open: true };
  for (k = 1; k < n; k++) {
    var m = Math.max(1, Math.ceil((s.t[k] - s.t[k - 1]) / 120)), ta = s.t[k - 1];
    for (j = 1; j <= m; j++) {
      var tb = s.t[k - 1] + (s.t[k] - s.t[k - 1]) * j / m, now = sh(tb);
      if (now !== prev) { var tc = cross(ta, tb, now); if (now) cur = { t0: tc }; else if (cur) { cur.t1 = tc; ev.push(cur); cur = null; } }
      prev = now; ta = tb;
    }
  }
  if (cur) { cur.t1 = s.t[n - 1]; cur.open = true; ev.push(cur); }
  return ev;
}
