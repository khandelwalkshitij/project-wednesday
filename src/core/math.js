// 3x3 matrix helpers, rotations and CRC-32.
// ---------------------------------------------------------------- small maths
export function frac(x) { return x - Math.floor(x); }

export function mmul(a, b) { var r = new Array(9); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]; return r; }

export function mvec(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }

export function mTvec(m, v) { return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]]; }

export function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }

export function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }

export function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }

export function crc32(str) {
  var c, crc = -1;
  for (var i = 0; i < str.length; i++) { c = (crc ^ str.charCodeAt(i)) & 0xff; for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ('00000000' + ((crc ^ -1) >>> 0).toString(16)).slice(-8);
}
