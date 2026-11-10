// Geodetic coordinates, exponential atmosphere and dipole magnetic field.
import { D2R, EARTH } from './constants.js';

// ---------------------------------------------------------------- Earth environment models (SIM_003)
export function geodetic(x, y, z, a, f) {             // body-fixed -> geodetic lat, lon [rad], height [m]
  var e2 = f * (2 - f), p = Math.hypot(x, y), lat = Math.atan2(z, p * (1 - e2)), N = a, h = 0;
  for (var k = 0; k < 8; k++) {
    var sl = Math.sin(lat); N = a / Math.sqrt(1 - e2 * sl * sl);
    h = p * Math.cos(lat) + z * sl - a * Math.sqrt(1 - e2 * sl * sl);
    lat = Math.atan2(z, p * (1 - e2 * N / (N + h)));
  }
  return { lat: lat, lon: Math.atan2(y, x), h: h };
}

export var ATMO = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714],
  [70, 8.770e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
  [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546],
  [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835],
  [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00]];

export function atmosphereDensity(h) {                // exponential atmosphere, kg/m^3, h = geodetic height [m]
  var hk = Math.max(0, h / 1000), i = 0; for (var k = 0; k < ATMO.length; k++) if (ATMO[k][0] <= hk) i = k;
  return ATMO[i][1] * Math.exp(-(hk - ATMO[i][0]) / ATMO[i][2]);
}

export function magneticField(rb) {                   // tilted centred dipole [T], body-fixed input and output
  var r = Math.hypot(rb[0], rb[1], rb[2]), u = [rb[0] / r, rb[1] / r, rb[2] / r], cl = Math.cos(EARTH.magPoleLat * D2R), lo = EARTH.magPoleLon * D2R;
  var m = [-cl * Math.cos(lo), -cl * Math.sin(lo), -Math.sin(EARTH.magPoleLat * D2R)], k = EARTH.B0 * Math.pow(EARTH.a / r, 3), md = 3 * (m[0] * u[0] + m[1] * u[1] + m[2] * u[2]);
  return [k * (md * u[0] - m[0]), k * (md * u[1] - m[1]), k * (md * u[2] - m[2])];
}

export function geoHeight(p, z) {            // WGS84 height [m] from distance to the spin axis p and height above the equator z
  var e2 = EARTH.f * (2 - EARTH.f), a = EARTH.a, lat = Math.atan2(z, p * (1 - e2)), sl = 0;
  for (var k = 0; k < 3; k++) { sl = Math.sin(lat); lat = Math.atan2(z + e2 * a / Math.sqrt(1 - e2 * sl * sl) * sl, p); }
  sl = Math.sin(lat); return p * Math.cos(lat) + z * sl - a * Math.sqrt(1 - e2 * sl * sl);
}
