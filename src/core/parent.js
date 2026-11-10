// Parent body models (WGS84 Earth with J2 to J4, uniform sphere): gravity, potential, orientation, surface test.
import { EARTH, G, TWO_PI } from './constants.js';
import { bodyMatrix, earthPole, earthRotation } from './earth-orientation.js';

// ---------------------------------------------------------------- parent body (SIM_001 to SIM_003, SIM_006, SIM_025)
// accel writes inertial acceleration into out[o..o+2]; p = unit spin pole in the inertial frame.
export function makeParent(c) {
  var P = { shape: c.shape };
  if (c.shape === 'sphere_uniform') {
    P.radius = c.radius; P.flattening = 0; P.mu = G * c.density * 4 / 3 * Math.PI * Math.pow(c.radius, 3);
    P.omega = TWO_PI / c.spinPeriod; P.poleFixed = [Math.cos(c.poleDec) * Math.cos(c.poleRa), Math.cos(c.poleDec) * Math.sin(c.poleRa), Math.sin(c.poleDec)];
    P.frame = 'ICRF axes'; P.centre = 'parent centre of mass';
    P.bodyFrame = 'pole RA/Dec and prime meridian angle W in ICRF (IAU convention): body = Rz(W) Rx(90deg - Dec) Rz(90deg + RA) inertial';
    P.poleAt = function () { return P.poleFixed; };
    P.matrixAt = function (tt, t) { return bodyMatrix(c.poleRa, c.poleDec, c.w0 + P.omega * t); };
    P.accel = function (x, y, z, p, out, o) { var r2 = x * x + y * y + z * z, k = -P.mu / (r2 * Math.sqrt(r2)); out[o] = k * x; out[o + 1] = k * y; out[o + 2] = k * z; };
    P.potential = function (x, y, z) { return P.mu / Math.sqrt(x * x + y * y + z * z); };
    P.surface = function (x, y, z) { return Math.sqrt(x * x + y * y + z * z) / P.radius - 1; };
  } else {
    var mu = EARTH.mu, R = EARTH.a, b2 = Math.pow(EARTH.a * (1 - EARTH.f), 2), a2 = R * R;
    P.radius = R; P.flattening = EARTH.f; P.mu = mu; P.omega = EARTH.omega; P.dut1 = c.dut1 || 0;
    P.frame = 'GCRF (ICRF axes)'; P.centre = 'Earth centre of mass';
    P.bodyFrame = 'ITRF from IAU 2006 precession, IAU 2000B nutation and Earth rotation angle (UT1 = UTC + dut1_s); polar motion not applied';
    P.poleAt = earthPole;
    P.matrixAt = function (tt) { return earthRotation(tt, P.dut1).M; };
    P.accel = function (x, y, z, p, out, o) {
      var r2 = x * x + y * y + z * z, r = Math.sqrt(r2), zz = x * p[0] + y * p[1] + z * p[2], s2 = zz * zz / r2, r5 = r2 * r2 * r, r7 = r5 * r2;
      var k2 = -1.5 * EARTH.J2 * mu * R * R / r5, k3 = -2.5 * EARTH.J3 * mu * R * R * R / r7, k4 = 1.875 * EARTH.J4 * mu * R * R * R * R / r7;
      var cr = -mu / (r2 * r) + k2 * (1 - 5 * s2) + k3 * (3 * zz - 7 * zz * s2) + k4 * (1 - 14 * s2 + 21 * s2 * s2);
      var cp = k2 * 2 * zz + k3 * (3 * zz * zz - 0.6 * r2) + k4 * zz * (4 - 28 / 3 * s2);
      out[o] = cr * x + cp * p[0]; out[o + 1] = cr * y + cp * p[1]; out[o + 2] = cr * z + cp * p[2];
    };
    P.potential = function (x, y, z, p) {
      var r2 = x * x + y * y + z * z, r = Math.sqrt(r2), s = (x * p[0] + y * p[1] + z * p[2]) / r, s2 = s * s, q = R / r, q2 = q * q;
      return mu / r * (1 - EARTH.J2 * q2 * (3 * s2 - 1) / 2 - EARTH.J3 * q2 * q * (5 * s2 - 3) * s / 2 - EARTH.J4 * q2 * q2 * (35 * s2 * s2 - 30 * s2 + 3) / 8);
    };
    P.surface = function (x, y, z, p) { var zz = x * p[0] + y * p[1] + z * p[2], rho2 = x * x + y * y + z * z - zz * zz; return Math.sqrt(rho2 / a2 + zz * zz / b2) - 1; };
  }
  return P;
}
