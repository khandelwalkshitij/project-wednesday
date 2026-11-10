// GCRF to ITRF: IAU 2006 precession, IAU 2000B nutation, Earth rotation angle. Also generic body orientation.
import { AS2R, TURNAS, TWO_PI } from './constants.js';
import { frac, mmul, rotX, rotY, rotZ } from './math.js';
import { utcNominal } from './time.js';
import { NUT00B } from '../data/nutation-iau2000b.js';

// ---------------------------------------------------------------- Earth orientation (SIM_067): IAU 2006 precession, IAU 2000B nutation, ERA
export function npbMatrix(tt) {
  var t = tt / (86400 * 36525);
  var gamb = (-0.052928 + (10.556378 + (0.4932044 + (-0.00031238 + (-0.000002788 + 0.0000000260 * t) * t) * t) * t) * t) * AS2R;
  var phib = (84381.412819 + (-46.811016 + (0.0511268 + (0.00053289 + (-0.000000440 - 0.0000000176 * t) * t) * t) * t) * t) * AS2R;
  var psib = (-0.041775 + (5038.481484 + (1.5584175 + (-0.00018522 + (-0.000026452 - 0.0000000148 * t) * t) * t) * t) * t) * AS2R;
  var epsa = (84381.406 + (-46.836769 + (-0.0001831 + (0.00200340 + (-0.000000576 - 0.0000000434 * t) * t) * t) * t) * t) * AS2R;
  var el = ((485868.249036 + 1717915923.2178 * t) % TURNAS) * AS2R, elp = ((1287104.79305 + 129596581.0481 * t) % TURNAS) * AS2R,
    f = ((335779.526232 + 1739527262.8478 * t) % TURNAS) * AS2R, d = ((1072260.70369 + 1602961601.2090 * t) % TURNAS) * AS2R,
    om = ((450160.398036 - 6962890.5431 * t) % TURNAS) * AS2R;
  var dp = 0, de = 0;
  for (var i = NUT00B.length - 1; i >= 0; i--) {
    var x = NUT00B[i], arg = x[0] * el + x[1] * elp + x[2] * f + x[3] * d + x[4] * om, sa = Math.sin(arg), ca = Math.cos(arg);
    dp += (x[5] + x[6] * t) * sa + x[7] * ca; de += (x[8] + x[9] * t) * ca + x[10] * sa;
  }
  dp = dp * AS2R / 1e7 - 0.135e-3 * AS2R; de = de * AS2R / 1e7 + 0.388e-3 * AS2R;
  var fj2 = -2.7774e-6 * t; dp += dp * (0.4697e-6 + fj2); de += de * fj2;
  var m = mmul(rotX(-(epsa + de)), mmul(rotZ(-(psib + dp)), mmul(rotX(phib), rotZ(gamb))));
  return { m: m, t: t, om: om, f: f, d: d, dpsi: dp, eps: epsa + de };
}

export function earthPole(tt) { var m = npbMatrix(tt).m; return [m[6], m[7], m[8]]; }

export function earthRotation(tt, dut1) {             // GCRF -> ITRF (no polar motion)
  var n = npbMatrix(tt), t = n.t, X = n.m[6], Y = n.m[7], a = 2 * (n.f - n.d);
  var s = -X * Y / 2 + AS2R * 1e-6 * (94 + (3808.65 + (-122.68 + (-72574.11 + (27.98 + 15.62 * t) * t) * t) * t) * t
    - 2640.73 * Math.sin(n.om) - 63.53 * Math.sin(2 * n.om) - 11.75 * Math.sin(a + 3 * n.om) - 11.21 * Math.sin(a + n.om) + 4.57 * Math.sin(a + 2 * n.om)
    + 743.52 * t * t * Math.sin(n.om));
  var r2 = X * X + Y * Y, e = r2 > 0 ? Math.atan2(Y, X) : 0, dd = Math.atan(Math.sqrt(r2 / (1 - r2)));
  var c2i = mmul(rotZ(-(e + s)), mmul(rotY(dd), rotZ(e)));
  var tu = (utcNominal(tt) + (dut1 || 0)) / 86400, era = TWO_PI * frac(frac(tu) + 0.7790572732640 + 0.00273781191135448 * tu);
  return { M: mmul(rotZ(era), c2i), pole: [X, Y, n.m[8]], era: era };
}

// IAU-style body orientation: inertial -> body = Rz(W) Rx(90deg - dec) Rz(90deg + ra)   (SIM_006, SIM_068)
export function bodyMatrix(ra, dec, W) { return mmul(rotZ(W), mmul(rotX(Math.PI / 2 - dec), rotZ(Math.PI / 2 + ra))); }

export function poleRaDec(p) { return [Math.atan2(p[1], p[0]), Math.asin(Math.max(-1, Math.min(1, p[2])))]; }

export function primeMeridianAngle(M) {
  var rd = poleRaDec([M[6], M[7], M[8]]), n = [-Math.sin(rd[0]), Math.cos(rd[0]), 0];
  var q = [M[7] * n[2] - M[8] * n[1], M[8] * n[0] - M[6] * n[2], M[6] * n[1] - M[7] * n[0]];
  var w = Math.atan2(M[0] * q[0] + M[1] * q[1] + M[2] * q[2], M[0] * n[0] + M[1] * n[1] + M[2] * n[2]);
  return w < 0 ? w + TWO_PI : w;
}
