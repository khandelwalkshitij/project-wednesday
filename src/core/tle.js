// Two-line element parsing and conversion to a GCRF state with SGP4/SDP4.
import { D2R, TWO_PI } from './constants.js';
import { npbMatrix } from './earth-orientation.js';
import { mTvec, mvec, rotZ } from './math.js';
import { datForDay, dayNumber, leap } from './time.js';
import { sgp4, twoline2satrec } from '../vendor/sgp4.js';

var SGP4_ERRORS = { 1: 'mean eccentricity out of range', 2: 'mean motion below zero', 3: 'perturbed eccentricity out of range', 4: 'semi-latus rectum below zero', 6: 'satellite has decayed' };

// ---------------------------------------------------------------- TLE import. Elements are propagated with SGP4 (SDP4 for periods of 225 min or more).
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
  var satrec = twoline2satrec(l1, l2);
  if (satrec.error) throw new Error('SGP4 cannot initialise these elements: ' + (SGP4_ERRORS[satrec.error] || 'error ' + satrec.error));
  return { tt: dn * 86400 - 43200 + (doy - Math.floor(doy)) * 86400 + leap.dat[li] + 32.184, satnum: l1.substr(2, 5).trim(), satrec: satrec,
    inc: +l2.substr(8, 8) * D2R, raan: +l2.substr(17, 8) * D2R, e: e, argp: +l2.substr(34, 8) * D2R, M: +l2.substr(43, 8) * D2R, n: n * TWO_PI / 86400 };
}

export function tleState(tle, tt) {          // GCRF state (m, m/s) at tt: SGP4 in TEME, then TEME -> GCRF
  var pv = sgp4(tle.satrec, (tt - tle.tt) / 60);
  if (!pv || !pv.position) throw new Error('SGP4 failed for satellite ' + tle.satnum + ': ' + (SGP4_ERRORS[tle.satrec.error] || 'error ' + tle.satrec.error));
  var r = [pv.position.x * 1000, pv.position.y * 1000, pv.position.z * 1000], v = [pv.velocity.x * 1000, pv.velocity.y * 1000, pv.velocity.z * 1000];
  var nb = npbMatrix(tt), tz = rotZ(-nb.dpsi * Math.cos(nb.eps));
  return mTvec(nb.m, mvec(tz, r)).concat(mTvec(nb.m, mvec(tz, v)));
}
