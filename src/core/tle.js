// Two-line element parsing and conversion to a GCRF state.
import { D2R, EARTH, TWO_PI } from './constants.js';
import { npbMatrix } from './earth-orientation.js';
import { kepToState } from './elements.js';
import { mTvec, mvec, rotZ } from './math.js';
import { datForDay, dayNumber, leap } from './time.js';

// ---------------------------------------------------------------- TLE import. Approximate: mean elements are used as if osculating.
export function parseTle(l1, l2) {
  l1 = String(l1 || '').replace(/\s+$/, ''); l2 = String(l2 || '').replace(/\s+$/, '');
  if (!/^1 /.test(l1) || !/^2 /.test(l2) || l1.length < 68 || l2.length < 68) throw new Error('not a two-line element set (line 1 must start with "1 ", line 2 with "2 ", 69 characters each)');
  [l1, l2].forEach(function (l, j) {
    var s = 0; for (var i = 0; i < 68; i++) { var ch = l.charAt(i); if (ch >= '0' && ch <= '9') s += +ch; else if (ch === '-') s += 1; }
    if (l.length >= 69 && s % 10 !== +l.charAt(68)) throw new Error('checksum of line ' + (j + 1) + ' does not match');
  });
  var yy = +l1.substr(18, 2), doy = +l1.substr(20, 12), year = yy < 57 ? 2000 + yy : 1900 + yy, e = +('0.' + l2.substr(26, 7).replace(/ /g, '0')), n = +l2.substr(52, 11);
  if (!(doy >= 1 && doy < 367) || !(n > 0) || !(e >= 0 && e < 1)) throw new Error('could not read the epoch, eccentricity or mean motion');
  var dn = dayNumber(year, 1, 1) + Math.floor(doy) - 1, li = datForDay(dn); if (li < 0) throw new Error('epochs before 1972 are not supported');
  return { tt: dn * 86400 - 43200 + (doy - Math.floor(doy)) * 86400 + leap.dat[li] + 32.184, satnum: l1.substr(2, 5).trim(),
    inc: +l2.substr(8, 8) * D2R, raan: +l2.substr(17, 8) * D2R, e: e, argp: +l2.substr(34, 8) * D2R, M: +l2.substr(43, 8) * D2R, n: n * TWO_PI / 86400 };
}

export function tleState(tle, tt) {          // GCRF state at tt: SGP4-style semi-major axis, J2 secular rates from the TLE epoch, TEME -> GCRF
  var mu = EARTH.mu, R = EARTH.a, e = tle.e, ci = Math.cos(tle.inc), b = Math.sqrt(1 - e * e), k2 = 0.5 * EARTH.J2 * R * R;
  var a1 = Math.cbrt(mu / (tle.n * tle.n)), d1 = 1.5 * k2 * (3 * ci * ci - 1) / (a1 * a1 * b * b * b), a0 = a1 * (1 - d1 / 3 - d1 * d1 - 134 / 81 * d1 * d1 * d1);
  var d0 = 1.5 * k2 * (3 * ci * ci - 1) / (a0 * a0 * b * b * b), a = a0 / (1 - d0), n0 = tle.n / (1 + d0), p = a * (1 - e * e), q = 1.5 * EARTH.J2 * (R / p) * (R / p) * n0, dt = tt - tle.tt;
  var raan = tle.raan - q * ci * dt, argp = tle.argp + q * (2 - 2.5 * (1 - ci * ci)) * dt, M = tle.M + tle.n * dt, Ea = M;
  for (var i = 0; i < 30; i++) Ea -= (Ea - e * Math.sin(Ea) - M) / (1 - e * Math.cos(Ea));
  var nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(Ea / 2), Math.sqrt(1 - e) * Math.cos(Ea / 2));
  var s = kepToState(mu, a, e, tle.inc, raan, argp, nu), nb = npbMatrix(tt), tz = rotZ(-nb.dpsi * Math.cos(nb.eps));
  return mTvec(nb.m, mvec(tz, s.slice(0, 3))).concat(mTvec(nb.m, mvec(tz, s.slice(3))));
}
