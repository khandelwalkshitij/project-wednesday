// Walker and train constellation generators.
import { R2D } from './constants.js';

// ---------------------------------------------------------------- orbit list generators (SIM_022, SIM_023). Input already validated.
export function expandPattern(pat, count) {
  var out = [], k;
  if (pat.type === 'walker') {
    var T = pat.t, Pn = pat.p, S = T / Pn, F = pat.f || 0;
    for (var pl = 0; pl < Pn; pl++) for (var q = 0; q < S; q++)
      out.push({ type: 'keplerian', a_m: pat.a_m, e: pat.e || 0, i_deg: pat.i_deg, raan_deg: ((pat.raan0_deg || 0) + 360 * pl / Pn) % 360, argp_deg: pat.argp_deg || 0, ta_deg: ((pat.ta0_deg || 0) + 360 * q / S + 360 * F * pl / T) % 360 });
  } else {
    var b = pat.base, off = pat.offset;
    for (k = 0; k < count; k++) {
      var o = { type: 'keplerian', a_m: b.a_m, e: b.e, i_deg: b.i_deg, raan_deg: b.raan_deg, argp_deg: b.argp_deg, ta_deg: b.ta_deg };
      if (off.raan_deg !== undefined) o.raan_deg += k * off.raan_deg;
      else if (off.ta_deg !== undefined) o.ta_deg += k * off.ta_deg;
      else o.ta_deg += k * off.along_track_m / b.a_m * R2D;
      out.push(o);
    }
  }
  return out;
}
