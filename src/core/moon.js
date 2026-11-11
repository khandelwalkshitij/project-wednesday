// Geocentric position of the Moon: Meeus (Astronomical Algorithms, 2nd ed., ch. 47) as implemented by ERFA eraMoon98,
// position part only. Mean ecliptic of date, rotated to GCRF with the IAU 2006 Fukushima-Williams angles.
// ERFA quotes 2.9" RMS (6 km) against ELP/MPP02 over 1950-2100; ample for third-body gravity.
import { D2R } from './constants.js';
import { fwAngles } from './earth-orientation.js';
import { mmul, mvec, rotX, rotZ } from './math.js';
import { MOON_B, MOON_LR } from '../data/moon98-series.js';

function deg(c0, c1, c2, c3, c4, t) { return D2R * ((c0 + (c1 + (c2 + (c3 + c4 * t) * t) * t) * t) % 360); }

export function moonPosition(tt) {       // tt: TT seconds from J2000. Returns GCRF position [m]
  var t = tt / (86400 * 36525);
  var elp = deg(218.31665436, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000, t), d = deg(297.8501921, 445267.1114034, -0.0018819, 1 / 545868, 1 / 113065000, t),
    em = deg(357.5291092, 35999.0502909, -0.0001536, 1 / 24490000, 0, t), emp = deg(134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000, t),
    f = deg(93.2720950, 483202.0175233, -0.0036539, 1 / 3526000, 1 / 863310000, t);
  var a1 = D2R * (119.75 + 131.849 * t), a2 = D2R * (53.09 + 479264.290 * t), a3 = D2R * (313.45 + 481266.484 * t), e = 1 + (-0.002516 - 0.0000074 * t) * t, esq = e * e;
  var vel = 0.003958 * Math.sin(a1) + 0.001962 * Math.sin(elp - f) + 0.000318 * Math.sin(a2), vr = 0, n, x, en, arg;
  var vb = -0.002235 * Math.sin(elp) + 0.000382 * Math.sin(a3) + 0.000175 * Math.sin(a1 - f) + 0.000175 * Math.sin(a1 + f) + 0.000127 * Math.sin(elp - emp) - 0.000115 * Math.sin(elp + emp);
  for (n = MOON_LR.length - 1; n >= 0; n--) {
    x = MOON_LR[n]; en = Math.abs(x[1]) === 1 ? e : Math.abs(x[1]) === 2 ? esq : 1; arg = x[0] * d + x[1] * em + x[2] * emp + x[3] * f;
    vel += x[4] * Math.sin(arg) * en; vr += x[5] * Math.cos(arg) * en;
  }
  for (n = MOON_B.length - 1; n >= 0; n--) {
    x = MOON_B[n]; en = Math.abs(x[1]) === 1 ? e : Math.abs(x[1]) === 2 ? esq : 1; arg = x[0] * d + x[1] * em + x[2] * emp + x[3] * f;
    vb += x[4] * Math.sin(arg) * en;
  }
  var el = elp + D2R * vel, b = D2R * vb, r = vr + 385000560.0, cb = Math.cos(b), fw = fwAngles(t);
  var m = mmul(rotZ(-fw[0]), mmul(rotX(-fw[1]), rotZ(fw[2])));
  return mvec(m, [r * cb * Math.cos(el), r * cb * Math.sin(el), r * Math.sin(b)]);
}
