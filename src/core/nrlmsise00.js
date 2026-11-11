// NRLMSISE-00 empirical atmosphere (Picone, Hedin, Drob and Aikin, J. Geophys. Res. 107(A12), 2002), ported to JavaScript from
// Dominik Brodowski's public-domain C version (nrlmsise-00.c, 2001). Functions, state and side effects follow the C line by line;
// only ghp7 (pressure input) is left out. U.S. Government work, not subject to copyright protection (17 U.S.C. 105, 403);
// no endorsement by or affiliation with the Naval Research Laboratory is implied.
import { PAVGM, PD, PDL, PDM, PMA, PS, PT, PTL, PTM } from '../data/nrlmsise00-data.js';

// ---------------------------------------------------------------- module state (C statics)
var gsurf = 0, re = 0, dm04 = 0, dm16 = 0, dm28 = 0, dm32 = 0, dm40 = 0, dm01 = 0, dm14 = 0;
var meso_tn1 = [0, 0, 0, 0, 0], meso_tn2 = [0, 0, 0, 0], meso_tn3 = [0, 0, 0, 0, 0], meso_tgn1 = [0, 0], meso_tgn2 = [0, 0], meso_tgn3 = [0, 0];
var dfa = 0, plg = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)];
var ctloc = 0, stloc = 0, c2tloc = 0, s2tloc = 0, s3tloc = 0, c3tloc = 0, apdf = 0, apt = [0, 0, 0, 0];

function tselec(flags) {
  for (var i = 0; i < 24; i++) {
    if (i !== 9) { flags.sw[i] = flags.switches[i] === 1 ? 1 : 0; flags.swc[i] = flags.switches[i] > 0 ? 1 : 0; }
    else { flags.sw[i] = flags.switches[i]; flags.swc[i] = flags.switches[i]; }
  }
}

function glatf(lat) {
  var dgtr = 1.74533E-2, c2 = Math.cos(2.0 * dgtr * lat);
  gsurf = 980.616 * (1.0 - 0.0026373 * c2);
  re = 2.0 * gsurf / (3.085462E-6 + 2.27E-9 * c2) * 1.0E-5;
}

function ccor(alt, r, h1, zh) {         // chemistry/dissociation correction
  var e = (alt - zh) / h1;
  if (e > 70) return Math.exp(0);
  if (e < -70) return Math.exp(r);
  return Math.exp(r / (1.0 + Math.exp(e)));
}

function ccor2(alt, r, h1, zh, h2) {
  var e1 = (alt - zh) / h1, e2 = (alt - zh) / h2;
  if (e1 > 70 || e2 > 70) return Math.exp(0);
  if (e1 < -70 && e2 < -70) return Math.exp(r);
  return Math.exp(r / (1.0 + 0.5 * (Math.exp(e1) + Math.exp(e2))));
}

function scalh(alt, xm, temp) { var g = gsurf / Math.pow(1.0 + alt / re, 2.0); return 831.4 * temp / (g * xm); }

function dnet(dd_, dm, zhm, xmm, xm) {  // turbopause correction
  var a = zhm / (xmm - xm);
  if (!(dm > 0 && dd_ > 0)) {
    if (dd_ === 0 && dm === 0) dd_ = 1;
    if (dm === 0) return dd_;
    if (dd_ === 0) return dm;
  }
  var ylog = a * Math.log(dm / dd_);
  if (ylog < -10) return dd_;
  if (ylog > 10) return dm;
  return dd_ * Math.pow(1.0 + Math.exp(ylog), 1.0 / a);
}

function splini(xa, ya, y2a, n, x) {    // integral of the cubic spline from xa[0] to x
  var yi = 0, klo = 0, khi = 1, xx, h, a, b, a2, b2;
  while (x > xa[klo] && khi < n) {
    xx = x;
    if (khi < n - 1) xx = x < xa[khi] ? x : xa[khi];
    h = xa[khi] - xa[klo]; a = (xa[khi] - xx) / h; b = (xx - xa[klo]) / h; a2 = a * a; b2 = b * b;
    yi += ((1.0 - a2) * ya[klo] / 2.0 + b2 * ya[khi] / 2.0 + ((-(1.0 + a2 * a2) / 4.0 + a2 / 2.0) * y2a[klo] + (b2 * b2 / 4.0 - b2 / 2.0) * y2a[khi]) * h * h / 6.0) * h;
    klo++; khi++;
  }
  return yi;
}

function splint(xa, ya, y2a, n, x) {    // cubic spline value
  var klo = 0, khi = n - 1, k;
  while (khi - klo > 1) { k = (khi + klo) >> 1; if (xa[k] > x) khi = k; else klo = k; }
  var h = xa[khi] - xa[klo], a = (xa[khi] - x) / h, b = (x - xa[klo]) / h;
  return a * ya[klo] + b * ya[khi] + ((a * a * a - a) * y2a[klo] + (b * b * b - b) * y2a[khi]) * h * h / 6.0;
}

function spline(x, y, n, yp1, ypn, y2) { // second derivatives of the cubic spline
  var u = new Array(n), sig, p, qn, un, i, k;
  if (yp1 > 0.99E30) { y2[0] = 0; u[0] = 0; }
  else { y2[0] = -0.5; u[0] = (3.0 / (x[1] - x[0])) * ((y[1] - y[0]) / (x[1] - x[0]) - yp1); }
  for (i = 1; i < n - 1; i++) {
    sig = (x[i] - x[i - 1]) / (x[i + 1] - x[i - 1]); p = sig * y2[i - 1] + 2.0; y2[i] = (sig - 1.0) / p;
    u[i] = (6.0 * ((y[i + 1] - y[i]) / (x[i + 1] - x[i]) - (y[i] - y[i - 1]) / (x[i] - x[i - 1])) / (x[i + 1] - x[i - 1]) - sig * u[i - 1]) / p;
  }
  if (ypn > 0.99E30) { qn = 0; un = 0; }
  else { qn = 0.5; un = (3.0 / (x[n - 1] - x[n - 2])) * (ypn - (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2])); }
  y2[n - 1] = (un - qn * u[n - 2]) / (qn * y2[n - 2] + 1.0);
  for (k = n - 2; k >= 0; k--) y2[k] = y2[k] * y2[k + 1] + u[k];
}

function zeta(zz, zl) { return (zz - zl) * (re + zl) / (re + zz); }

// lower atmosphere temperature and density; tz is a one-element array (C: double *tz)
function densm(alt, d0, xm, tz, mn3, zn3, tn3, tgn3, mn2, zn2, tn2, tgn2) {
  var xs = new Array(10), ys = new Array(10), y2out = new Array(10), rgas = 831.4, z, z1, z2, t1, t2, zg, zgdif, yd1, yd2, x, y, yi, expl, gamm, glb, mn, k;
  var densm_tmp = d0;
  if (alt > zn2[0]) return xm === 0.0 ? tz[0] : d0;
  // stratosphere/mesosphere temperature
  z = alt > zn2[mn2 - 1] ? alt : zn2[mn2 - 1];
  mn = mn2; z1 = zn2[0]; z2 = zn2[mn - 1]; t1 = tn2[0]; t2 = tn2[mn - 1]; zg = zeta(z, z1); zgdif = zeta(z2, z1);
  for (k = 0; k < mn; k++) { xs[k] = zeta(zn2[k], z1) / zgdif; ys[k] = 1.0 / tn2[k]; }
  yd1 = -tgn2[0] / (t1 * t1) * zgdif; yd2 = -tgn2[1] / (t2 * t2) * zgdif * Math.pow((re + z2) / (re + z1), 2.0);
  spline(xs, ys, mn, yd1, yd2, y2out); x = zg / zgdif; y = splint(xs, ys, y2out, mn, x);
  tz[0] = 1.0 / y;
  if (xm !== 0.0) {
    glb = gsurf / Math.pow(1.0 + z1 / re, 2.0); gamm = xm * glb * zgdif / rgas;
    yi = splini(xs, ys, y2out, mn, x); expl = gamm * yi; if (expl > 50.0) expl = 50.0;
    densm_tmp = densm_tmp * (t1 / tz[0]) * Math.exp(-expl);
  }
  if (alt > zn3[0]) return xm === 0.0 ? tz[0] : densm_tmp;
  // troposphere/stratosphere temperature
  z = alt; mn = mn3; z1 = zn3[0]; z2 = zn3[mn - 1]; t1 = tn3[0]; t2 = tn3[mn - 1]; zg = zeta(z, z1); zgdif = zeta(z2, z1);
  for (k = 0; k < mn; k++) { xs[k] = zeta(zn3[k], z1) / zgdif; ys[k] = 1.0 / tn3[k]; }
  yd1 = -tgn3[0] / (t1 * t1) * zgdif; yd2 = -tgn3[1] / (t2 * t2) * zgdif * Math.pow((re + z2) / (re + z1), 2.0);
  spline(xs, ys, mn, yd1, yd2, y2out); x = zg / zgdif; y = splint(xs, ys, y2out, mn, x);
  tz[0] = 1.0 / y;
  if (xm !== 0.0) {
    glb = gsurf / Math.pow(1.0 + z1 / re, 2.0); gamm = xm * glb * zgdif / rgas;
    yi = splini(xs, ys, y2out, mn, x); expl = gamm * yi; if (expl > 50.0) expl = 50.0;
    densm_tmp = densm_tmp * (t1 / tz[0]) * Math.exp(-expl);
  }
  return xm === 0.0 ? tz[0] : densm_tmp;
}

// upper atmosphere temperature and density (Bates profile above za, spline below); writes tn1[0], tgn1[0] like the C
function densu(alt, dlb, tinf, tlb, xm, alpha, tz, zlb, s2, mn1, zn1, tn1, tgn1) {
  var yd2, yd1, x = 0, y, rgas = 831.4, densu_temp, za, z, zg2, tt, ta, dta, z1 = 0, z2, t1 = 0, t2, zg, zgdif = 0, mn = 0, k, glb, expl, yi, densa, gamma, gamm;
  var xs = new Array(5), ys = new Array(5), y2out = new Array(5);
  za = zn1[0]; z = alt > za ? alt : za;
  zg2 = zeta(z, zlb);
  tt = tinf - (tinf - tlb) * Math.exp(-s2 * zg2); ta = tt; tz[0] = tt; densu_temp = tz[0];
  if (alt < za) {
    dta = (tinf - ta) * s2 * Math.pow((re + zlb) / (re + za), 2.0);
    tgn1[0] = dta; tn1[0] = ta;
    z = alt > zn1[mn1 - 1] ? alt : zn1[mn1 - 1];
    mn = mn1; z1 = zn1[0]; z2 = zn1[mn - 1]; t1 = tn1[0]; t2 = tn1[mn - 1];
    zg = zeta(z, z1); zgdif = zeta(z2, z1);
    for (k = 0; k < mn; k++) { xs[k] = zeta(zn1[k], z1) / zgdif; ys[k] = 1.0 / tn1[k]; }
    yd1 = -tgn1[0] / (t1 * t1) * zgdif; yd2 = -tgn1[1] / (t2 * t2) * zgdif * Math.pow((re + z2) / (re + z1), 2.0);
    spline(xs, ys, mn, yd1, yd2, y2out); x = zg / zgdif; y = splint(xs, ys, y2out, mn, x);
    tz[0] = 1.0 / y; densu_temp = tz[0];
  }
  if (xm === 0) return densu_temp;
  // density above za
  glb = gsurf / Math.pow(1.0 + zlb / re, 2.0); gamma = xm * glb / (s2 * rgas * tinf);
  expl = Math.exp(-s2 * gamma * zg2); if (expl > 50.0) expl = 50.0; if (tt <= 0) expl = 50.0;
  densa = dlb * Math.pow(tlb / tt, 1.0 + alpha + gamma) * expl; densu_temp = densa;
  if (alt >= za) return densu_temp;
  // density below za
  glb = gsurf / Math.pow(1.0 + z1 / re, 2.0); gamm = xm * glb * zgdif / rgas;
  yi = splini(xs, ys, y2out, mn, x); expl = gamm * yi; if (expl > 50.0) expl = 50.0; if (tz[0] <= 0) expl = 50.0;
  return densu_temp * Math.pow(t1 / tz[0], 1.0 + alpha) * Math.exp(-expl);
}

// 3-hour magnetic activity functions (eq. A24a-d)
function g0(a, p) { return a - 4.0 + (p[25] - 1.0) * (a - 4.0 + (Math.exp(-Math.sqrt(p[24] * p[24]) * (a - 4.0)) - 1.0) / Math.sqrt(p[24] * p[24])); }
function sumex(ex) { return 1.0 + (1.0 - Math.pow(ex, 19.0)) / (1.0 - ex) * Math.pow(ex, 0.5); }
function sg0(ex, p, ap) {
  return (g0(ap[1], p) + (g0(ap[2], p) * ex + g0(ap[3], p) * ex * ex + g0(ap[4], p) * Math.pow(ex, 3.0) + (g0(ap[5], p) * Math.pow(ex, 4.0) + g0(ap[6], p) * Math.pow(ex, 12.0)) * (1.0 - Math.pow(ex, 8.0)) / (1.0 - ex))) / sumex(ex);
}

function globe7(p, input, flags) {      // G(L) function, upper thermosphere parameters
  var t = new Array(15).fill(0), i, apd, tloc = input.lst, c, s, c2, c4, s2, sr = 7.2722E-5, dgtr = 1.74533E-2, dr = 1.72142E-2, hr = 0.2618;
  var cd32, cd18, cd14, cd39, df, f1, f2, tinf, sw = flags.sw, swc = flags.swc;
  c = Math.sin(input.g_lat * dgtr); s = Math.cos(input.g_lat * dgtr); c2 = c * c; c4 = c2 * c2; s2 = s * s;
  plg[0][1] = c; plg[0][2] = 0.5 * (3.0 * c2 - 1.0); plg[0][3] = 0.5 * (5.0 * c * c2 - 3.0 * c); plg[0][4] = (35.0 * c4 - 30.0 * c2 + 3.0) / 8.0;
  plg[0][5] = (63.0 * c2 * c2 * c - 70.0 * c2 * c + 15.0 * c) / 8.0; plg[0][6] = (11.0 * c * plg[0][5] - 5.0 * plg[0][4]) / 6.0;
  plg[1][1] = s; plg[1][2] = 3.0 * c * s; plg[1][3] = 1.5 * (5.0 * c2 - 1.0) * s; plg[1][4] = 2.5 * (7.0 * c2 * c - 3.0 * c) * s;
  plg[1][5] = 1.875 * (21.0 * c4 - 14.0 * c2 + 1.0) * s; plg[1][6] = (11.0 * c * plg[1][5] - 6.0 * plg[1][4]) / 5.0;
  plg[2][2] = 3.0 * s2; plg[2][3] = 15.0 * s2 * c; plg[2][4] = 7.5 * (7.0 * c2 - 1.0) * s2; plg[2][5] = 3.0 * c * plg[2][4] - 2.0 * plg[2][3];
  plg[2][6] = (11.0 * c * plg[2][5] - 7.0 * plg[2][4]) / 4.0; plg[2][7] = (13.0 * c * plg[2][6] - 8.0 * plg[2][5]) / 5.0;
  plg[3][3] = 15.0 * s2 * s; plg[3][4] = 105.0 * s2 * s * c; plg[3][5] = (9.0 * c * plg[3][4] - 7. * plg[3][3]) / 2.0; plg[3][6] = (11.0 * c * plg[3][5] - 8. * plg[3][4]) / 3.0;
  if (!((sw[7] === 0 && sw[8] === 0) && sw[14] === 0)) {
    stloc = Math.sin(hr * tloc); ctloc = Math.cos(hr * tloc); s2tloc = Math.sin(2.0 * hr * tloc); c2tloc = Math.cos(2.0 * hr * tloc); s3tloc = Math.sin(3.0 * hr * tloc); c3tloc = Math.cos(3.0 * hr * tloc);
  }
  cd32 = Math.cos(dr * (input.doy - p[31])); cd18 = Math.cos(2.0 * dr * (input.doy - p[17])); cd14 = Math.cos(dr * (input.doy - p[13])); cd39 = Math.cos(2.0 * dr * (input.doy - p[38]));
  // F10.7 effect
  df = input.f107 - input.f107A; dfa = input.f107A - 150.0;
  t[0] = p[19] * df * (1.0 + p[59] * dfa) + p[20] * df * df + p[21] * dfa + p[29] * Math.pow(dfa, 2.0);
  f1 = 1.0 + (p[47] * dfa + p[19] * df + p[20] * df * df) * swc[1];
  f2 = 1.0 + (p[49] * dfa + p[19] * df + p[20] * df * df) * swc[1];
  t[1] = (p[1] * plg[0][2] + p[2] * plg[0][4] + p[22] * plg[0][6]) + (p[14] * plg[0][2]) * dfa * swc[1] + p[26] * plg[0][1];   // time independent
  t[2] = p[18] * cd32;                                                // symmetrical annual
  t[3] = (p[15] + p[16] * plg[0][2]) * cd18;                          // symmetrical semiannual
  t[4] = f1 * (p[9] * plg[0][1] + p[10] * plg[0][3]) * cd14;          // asymmetrical annual
  t[5] = p[37] * plg[0][1] * cd39;                                    // asymmetrical semiannual
  if (sw[7]) {                                                        // diurnal
    var t71 = (p[11] * plg[1][2]) * cd14 * swc[5], t72 = (p[12] * plg[1][2]) * cd14 * swc[5];
    t[6] = f2 * ((p[3] * plg[1][1] + p[4] * plg[1][3] + p[27] * plg[1][5] + t71) * ctloc + (p[6] * plg[1][1] + p[7] * plg[1][3] + p[28] * plg[1][5] + t72) * stloc);
  }
  if (sw[8]) {                                                        // semidiurnal
    var t81 = (p[23] * plg[2][3] + p[35] * plg[2][5]) * cd14 * swc[5], t82 = (p[33] * plg[2][3] + p[36] * plg[2][5]) * cd14 * swc[5];
    t[7] = f2 * ((p[5] * plg[2][2] + p[41] * plg[2][4] + t81) * c2tloc + (p[8] * plg[2][2] + p[42] * plg[2][4] + t82) * s2tloc);
  }
  if (sw[14]) {                                                       // terdiurnal
    t[13] = f2 * ((p[39] * plg[3][3] + (p[93] * plg[3][4] + p[46] * plg[3][6]) * cd14 * swc[5]) * s3tloc + (p[40] * plg[3][3] + (p[94] * plg[3][4] + p[48] * plg[3][6]) * cd14 * swc[5]) * c3tloc);
  }
  if (sw[9] === -1) {                                                 // magnetic activity from the 3-hour ap history
    var ap = input.ap_a;
    if (p[51] !== 0) {
      var exp1 = Math.exp(-10800.0 * Math.sqrt(p[51] * p[51]) / (1.0 + p[138] * (45.0 - Math.sqrt(input.g_lat * input.g_lat))));
      if (exp1 > 0.99999) exp1 = 0.99999;
      if (p[24] < 1.0E-4) p[24] = 1.0E-4;
      apt[0] = sg0(exp1, p, ap);
      if (sw[9]) {
        t[8] = apt[0] * (p[50] + p[96] * plg[0][2] + p[54] * plg[0][4] + (p[125] * plg[0][1] + p[126] * plg[0][3] + p[127] * plg[0][5]) * cd14 * swc[5] +
          (p[128] * plg[1][1] + p[129] * plg[1][3] + p[130] * plg[1][5]) * swc[7] * Math.cos(hr * (tloc - p[131])));
      }
    }
  } else {                                                            // magnetic activity from daily Ap
    apd = input.ap - 4.0; var p44 = p[43], p45 = p[44]; if (p44 < 0) p44 = 1.0E-5;
    apdf = apd + (p45 - 1.0) * (apd + (Math.exp(-p44 * apd) - 1.0) / p44);
    if (sw[9]) {
      t[8] = apdf * (p[32] + p[45] * plg[0][2] + p[34] * plg[0][4] + (p[100] * plg[0][1] + p[101] * plg[0][3] + p[102] * plg[0][5]) * cd14 * swc[5] +
        (p[121] * plg[1][1] + p[122] * plg[1][3] + p[123] * plg[1][5]) * swc[7] * Math.cos(hr * (tloc - p[124])));
    }
  }
  if (sw[10] && input.g_long > -1000.0) {
    if (sw[11]) {                                                     // longitudinal
      t[10] = (1.0 + p[80] * dfa * swc[1]) *
        ((p[64] * plg[1][2] + p[65] * plg[1][4] + p[66] * plg[1][6] + p[103] * plg[1][1] + p[104] * plg[1][3] + p[105] * plg[1][5] +
          swc[5] * (p[109] * plg[1][1] + p[110] * plg[1][3] + p[111] * plg[1][5]) * cd14) * Math.cos(dgtr * input.g_long) +
         (p[90] * plg[1][2] + p[91] * plg[1][4] + p[92] * plg[1][6] + p[106] * plg[1][1] + p[107] * plg[1][3] + p[108] * plg[1][5] +
          swc[5] * (p[112] * plg[1][1] + p[113] * plg[1][3] + p[114] * plg[1][5]) * cd14) * Math.sin(dgtr * input.g_long));
    }
    if (sw[12]) {                                                     // ut and mixed ut, longitude
      t[11] = (1.0 + p[95] * plg[0][1]) * (1.0 + p[81] * dfa * swc[1]) * (1.0 + p[119] * plg[0][1] * swc[5] * cd14) *
        ((p[68] * plg[0][1] + p[69] * plg[0][3] + p[70] * plg[0][5]) * Math.cos(sr * (input.sec - p[71])));
      t[11] += swc[11] * (p[76] * plg[2][3] + p[77] * plg[2][5] + p[78] * plg[2][7]) * Math.cos(sr * (input.sec - p[79]) + 2.0 * dgtr * input.g_long) * (1.0 + p[137] * dfa * swc[1]);
    }
    if (sw[13]) {                                                     // ut, longitude magnetic activity
      if (sw[9] === -1) {
        if (p[51]) {
          t[12] = apt[0] * swc[11] * (1. + p[132] * plg[0][1]) * ((p[52] * plg[1][2] + p[98] * plg[1][4] + p[67] * plg[1][6]) * Math.cos(dgtr * (input.g_long - p[97]))) +
            apt[0] * swc[11] * swc[5] * (p[133] * plg[1][1] + p[134] * plg[1][3] + p[135] * plg[1][5]) * cd14 * Math.cos(dgtr * (input.g_long - p[136])) +
            apt[0] * swc[12] * (p[55] * plg[0][1] + p[56] * plg[0][3] + p[57] * plg[0][5]) * Math.cos(sr * (input.sec - p[58]));
        }
      } else {
        t[12] = apdf * swc[11] * (1.0 + p[120] * plg[0][1]) * ((p[60] * plg[1][2] + p[61] * plg[1][4] + p[62] * plg[1][6]) * Math.cos(dgtr * (input.g_long - p[63]))) +
          apdf * swc[11] * swc[5] * (p[115] * plg[1][1] + p[116] * plg[1][3] + p[117] * plg[1][5]) * cd14 * Math.cos(dgtr * (input.g_long - p[118])) +
          apdf * swc[12] * (p[83] * plg[0][1] + p[84] * plg[0][3] + p[85] * plg[0][5]) * Math.cos(sr * (input.sec - p[75]));
      }
    }
  }
  tinf = p[30];
  for (i = 0; i < 14; i++) tinf = tinf + Math.abs(sw[i + 1]) * t[i];
  return tinf;
}

function glob7s(p, input, flags) {      // version of globe for the lower atmosphere (10/26/99)
  var pset = 2.0, t = new Array(14).fill(0), tt, cd32, cd18, cd14, cd39, i, dr = 1.72142E-2, dgtr = 1.74533E-2, sw = flags.sw, swc = flags.swc;
  if (p[99] === 0) p[99] = pset;
  if (p[99] !== pset) return -1;
  cd32 = Math.cos(dr * (input.doy - p[31])); cd18 = Math.cos(2.0 * dr * (input.doy - p[17])); cd14 = Math.cos(dr * (input.doy - p[13])); cd39 = Math.cos(2.0 * dr * (input.doy - p[38]));
  t[0] = p[21] * dfa;
  t[1] = p[1] * plg[0][2] + p[2] * plg[0][4] + p[22] * plg[0][6] + p[26] * plg[0][1] + p[14] * plg[0][3] + p[59] * plg[0][5];
  t[2] = (p[18] + p[47] * plg[0][2] + p[29] * plg[0][4]) * cd32;
  t[3] = (p[15] + p[16] * plg[0][2] + p[30] * plg[0][4]) * cd18;
  t[4] = (p[9] * plg[0][1] + p[10] * plg[0][3] + p[20] * plg[0][5]) * cd14;
  t[5] = (p[37] * plg[0][1]) * cd39;
  if (sw[7]) {
    var t71 = p[11] * plg[1][2] * cd14 * swc[5], t72 = p[12] * plg[1][2] * cd14 * swc[5];
    t[6] = (p[3] * plg[1][1] + p[4] * plg[1][3] + t71) * ctloc + (p[6] * plg[1][1] + p[7] * plg[1][3] + t72) * stloc;
  }
  if (sw[8]) {
    var t81 = (p[23] * plg[2][3] + p[35] * plg[2][5]) * cd14 * swc[5], t82 = (p[33] * plg[2][3] + p[36] * plg[2][5]) * cd14 * swc[5];
    t[7] = (p[5] * plg[2][2] + p[41] * plg[2][4] + t81) * c2tloc + (p[8] * plg[2][2] + p[42] * plg[2][4] + t82) * s2tloc;
  }
  if (sw[14]) t[13] = p[39] * plg[3][3] * s3tloc + p[40] * plg[3][3] * c3tloc;
  if (sw[9]) {
    if (sw[9] === 1) t[8] = apdf * (p[32] + p[45] * plg[0][2] * swc[2]);
    if (sw[9] === -1) t[8] = p[50] * apt[0] + p[96] * plg[0][2] * apt[0] * swc[2];
  }
  if (!(sw[10] === 0 || sw[11] === 0 || input.g_long <= -1000.0)) {
    t[10] = (1.0 + plg[0][1] * (p[80] * swc[5] * Math.cos(dr * (input.doy - p[81])) + p[85] * swc[6] * Math.cos(2.0 * dr * (input.doy - p[86]))) +
      p[83] * swc[3] * Math.cos(dr * (input.doy - p[84])) + p[87] * swc[4] * Math.cos(2.0 * dr * (input.doy - p[88]))) *
      ((p[64] * plg[1][2] + p[65] * plg[1][4] + p[66] * plg[1][6] + p[74] * plg[1][1] + p[75] * plg[1][3] + p[76] * plg[1][5]) * Math.cos(dgtr * input.g_long) +
       (p[90] * plg[1][2] + p[91] * plg[1][4] + p[92] * plg[1][6] + p[77] * plg[1][1] + p[78] * plg[1][3] + p[79] * plg[1][5]) * Math.sin(dgtr * input.g_long));
  }
  tt = 0;
  for (i = 0; i < 14; i++) tt += Math.abs(sw[i + 1]) * t[i];
  return tt;
}

function gts7(input, flags, output) {   // thermospheric portion (alt > 72.5 km)
  var sw = flags.sw, zn1 = [120.0, 110.0, 100.0, 90.0, 72.5], mn1 = 5, dgtr = 1.74533E-2, dr = 1.72142E-2, j, i, z, tinf, gg0, tlb, s, rl;
  var alpha = [-0.38, 0.0, 0.0, 0.0, 0.17, 0.0, -0.38, 0.0, 0.0], altl = [200.0, 300.0, 160.0, 250.0, 240.0, 450.0, 320.0, 450.0], tz = [0], t1 = [0];
  var za = PDL[1][15]; zn1[0] = za;
  for (j = 0; j < 9; j++) output.d[j] = 0;
  tinf = input.alt > zn1[0] ? PTM[0] * PT[0] * (1.0 + sw[16] * globe7(PT, input, flags)) : PTM[0] * PT[0];
  output.t[0] = tinf;
  gg0 = input.alt > zn1[4] ? PTM[3] * PS[0] * (1.0 + sw[19] * globe7(PS, input, flags)) : PTM[3] * PS[0];
  tlb = PTM[1] * (1.0 + sw[17] * globe7(PD[3], input, flags)) * PD[3][0];
  s = gg0 / (tinf - tlb);
  if (input.alt < 300.0) {
    meso_tn1[1] = PTM[6] * PTL[0][0] / (1.0 - sw[18] * glob7s(PTL[0], input, flags));
    meso_tn1[2] = PTM[2] * PTL[1][0] / (1.0 - sw[18] * glob7s(PTL[1], input, flags));
    meso_tn1[3] = PTM[7] * PTL[2][0] / (1.0 - sw[18] * glob7s(PTL[2], input, flags));
    meso_tn1[4] = PTM[4] * PTL[3][0] / (1.0 - sw[18] * sw[20] * glob7s(PTL[3], input, flags));
    meso_tgn1[1] = PTM[8] * PMA[8][0] * (1.0 + sw[18] * sw[20] * glob7s(PMA[8], input, flags)) * meso_tn1[4] * meso_tn1[4] / Math.pow(PTM[4] * PTL[3][0], 2.0);
  } else {
    meso_tn1[1] = PTM[6] * PTL[0][0]; meso_tn1[2] = PTM[2] * PTL[1][0]; meso_tn1[3] = PTM[7] * PTL[2][0]; meso_tn1[4] = PTM[4] * PTL[3][0];
    meso_tgn1[1] = PTM[8] * PMA[8][0] * meso_tn1[4] * meso_tn1[4] / Math.pow(PTM[4] * PTL[3][0], 2.0);
  }
  var g28 = sw[21] * globe7(PD[2], input, flags);                     // N2 variation factor at Zlb
  var zhf = PDL[1][24] * (1.0 + sw[5] * PDL[0][24] * Math.sin(dgtr * input.g_lat) * Math.cos(dr * (input.doy - PT[13])));   // turbopause height
  output.t[0] = tinf;
  var xmm = PDM[2][4]; z = input.alt;
  // N2
  var db28 = PDM[2][0] * Math.exp(g28) * PD[2][0];
  output.d[2] = densu(z, db28, tinf, tlb, 28.0, alpha[2], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  var zh28 = PDM[2][2] * zhf, zhm28 = PDM[2][3] * PDL[1][5], xmd = 28.0 - xmm;
  var b28 = densu(zh28, db28, tinf, tlb, xmd, alpha[2] - 1.0, tz, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
  if (sw[15] && z <= altl[2]) {
    dm28 = densu(z, b28, tinf, tlb, xmm, alpha[2], tz, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    output.d[2] = dnet(output.d[2], dm28, zhm28, xmm, 28.0);
  }
  // He
  var g4 = sw[21] * globe7(PD[0], input, flags), db04 = PDM[0][0] * Math.exp(g4) * PD[0][0];
  output.d[0] = densu(z, db04, tinf, tlb, 4., alpha[0], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15] && z < altl[0]) {
    var zh04 = PDM[0][2], b04 = densu(zh04, db04, tinf, tlb, 4. - xmm, alpha[0] - 1., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    dm04 = densu(z, b04, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
    output.d[0] = dnet(output.d[0], dm04, zhm28, xmm, 4.);
    rl = Math.log(b28 * PDM[0][1] / b04);
    output.d[0] = output.d[0] * ccor(z, rl, PDM[0][5] * PDL[1][1], PDM[0][4] * PDL[1][0]);
  }
  // O
  var g16 = sw[21] * globe7(PD[1], input, flags), db16 = PDM[1][0] * Math.exp(g16) * PD[1][0];
  output.d[1] = densu(z, db16, tinf, tlb, 16., alpha[1], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15] && z <= altl[1]) {
    var zh16 = PDM[1][2], b16 = densu(zh16, db16, tinf, tlb, 16.0 - xmm, alpha[1] - 1.0, t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    dm16 = densu(z, b16, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
    output.d[1] = dnet(output.d[1], dm16, zhm28, xmm, 16.);
    rl = PDM[1][1] * PDL[1][16] * (1.0 + sw[1] * PDL[0][23] * (input.f107A - 150.0));
    output.d[1] = output.d[1] * ccor2(z, rl, PDM[1][5] * PDL[1][3], PDM[1][4] * PDL[1][2], PDM[1][5] * PDL[1][4]);
    output.d[1] = output.d[1] * ccor(z, PDM[1][3] * PDL[1][14], PDM[1][7] * PDL[1][13], PDM[1][6] * PDL[1][12]);   // chemistry correction
  }
  // O2
  var g32 = sw[21] * globe7(PD[4], input, flags), db32 = PDM[3][0] * Math.exp(g32) * PD[4][0];
  output.d[3] = densu(z, db32, tinf, tlb, 32., alpha[3], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15]) {
    if (z <= altl[3]) {
      var zh32 = PDM[3][2], b32 = densu(zh32, db32, tinf, tlb, 32. - xmm, alpha[3] - 1., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
      dm32 = densu(z, b32, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
      output.d[3] = dnet(output.d[3], dm32, zhm28, xmm, 32.);
      rl = Math.log(b28 * PDM[3][1] / b32);
      output.d[3] = output.d[3] * ccor(z, rl, PDM[3][5] * PDL[1][7], PDM[3][4] * PDL[1][6]);
    }
    var rc32 = PDM[3][3] * PDL[1][23] * (1. + sw[1] * PDL[0][23] * (input.f107A - 150.));      // departure from diffusive equilibrium above Zlb
    output.d[3] = output.d[3] * ccor2(z, rc32, PDM[3][7] * PDL[1][22], PDM[3][6] * PDL[1][21], PDM[3][7] * PDL[0][22]);
  }
  // Ar
  var g40 = sw[21] * globe7(PD[5], input, flags), db40 = PDM[4][0] * Math.exp(g40) * PD[5][0];
  output.d[4] = densu(z, db40, tinf, tlb, 40., alpha[4], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15] && z <= altl[4]) {
    var zh40 = PDM[4][2], b40 = densu(zh40, db40, tinf, tlb, 40. - xmm, alpha[4] - 1., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    dm40 = densu(z, b40, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
    output.d[4] = dnet(output.d[4], dm40, zhm28, xmm, 40.);
    rl = Math.log(b28 * PDM[4][1] / b40);
    output.d[4] = output.d[4] * ccor(z, rl, PDM[4][5] * PDL[1][9], PDM[4][4] * PDL[1][8]);
  }
  // H
  var g1 = sw[21] * globe7(PD[6], input, flags), db01 = PDM[5][0] * Math.exp(g1) * PD[6][0];
  output.d[6] = densu(z, db01, tinf, tlb, 1., alpha[6], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15] && z <= altl[6]) {
    var zh01 = PDM[5][2], b01 = densu(zh01, db01, tinf, tlb, 1. - xmm, alpha[6] - 1., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    dm01 = densu(z, b01, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
    output.d[6] = dnet(output.d[6], dm01, zhm28, xmm, 1.);
    rl = Math.log(b28 * PDM[5][1] * Math.sqrt(PDL[1][17] * PDL[1][17]) / b01);
    output.d[6] = output.d[6] * ccor(z, rl, PDM[5][5] * PDL[1][11], PDM[5][4] * PDL[1][10]);
    output.d[6] = output.d[6] * ccor(z, PDM[5][3] * PDL[1][20], PDM[5][7] * PDL[1][19], PDM[5][6] * PDL[1][18]);   // chemistry correction
  }
  // N
  var g14 = sw[21] * globe7(PD[7], input, flags), db14 = PDM[6][0] * Math.exp(g14) * PD[7][0];
  output.d[7] = densu(z, db14, tinf, tlb, 14., alpha[7], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[15] && z <= altl[7]) {
    var zh14 = PDM[6][2], b14 = densu(zh14, db14, tinf, tlb, 14. - xmm, alpha[7] - 1., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1);
    dm14 = densu(z, b14, tinf, tlb, xmm, 0., t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
    output.d[7] = dnet(output.d[7], dm14, zhm28, xmm, 14.);
    rl = Math.log(b28 * PDM[6][1] * Math.sqrt(PDL[0][2] * PDL[0][2]) / b14);
    output.d[7] = output.d[7] * ccor(z, rl, PDM[6][5] * PDL[0][1], PDM[6][4] * PDL[0][0]);
    output.d[7] = output.d[7] * ccor(z, PDM[6][3] * PDL[0][5], PDM[6][7] * PDL[0][4], PDM[6][6] * PDL[0][3]);       // chemistry correction
  }
  // anomalous O
  var g16h = sw[21] * globe7(PD[8], input, flags), db16h = PDM[7][0] * Math.exp(g16h) * PD[8][0], tho = PDM[7][9] * PDL[0][6];
  var ddl = densu(z, db16h, tho, tho, 16., alpha[8], t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  var zsht = PDM[7][5], zmho = PDM[7][4], zsho = scalh(zmho, 16.0, tho);
  output.d[8] = ddl * Math.exp(-zsht / zsho * (Math.exp(-(z - zmho) / zsht) - 1.));
  output.d[5] = 1.66E-24 * (4.0 * output.d[0] + 16.0 * output.d[1] + 28.0 * output.d[2] + 32.0 * output.d[3] + 40.0 * output.d[4] + output.d[6] + 14.0 * output.d[7]);
  z = Math.sqrt(input.alt * input.alt);
  densu(z, 1.0, tinf, tlb, 0.0, 0.0, t1, PTM[5], s, mn1, zn1, meso_tn1, meso_tgn1); output.t[1] = t1[0];
  if (sw[0]) { for (i = 0; i < 9; i++) output.d[i] = output.d[i] * 1.0E6; output.d[5] = output.d[5] / 1000; }
}

function gtd7(input, flags, output) {
  var sw = flags.sw, mn3 = 5, zn3 = [32.5, 20.0, 15.0, 10.0, 0.0], mn2 = 4, zn2 = [72.5, 55.0, 45.0, 32.5], zmix = 62.5, tz = [0], i;
  var soutput = { d: new Array(9).fill(0), t: [0, 0] };
  tselec(flags);
  glatf(sw[2] === 0 ? 45.0 : input.g_lat);
  var xmm = PDM[2][4];
  var altt = input.alt > zn2[0] ? input.alt : zn2[0], tmp = input.alt;
  input.alt = altt; gts7(input, flags, soutput); input.alt = tmp;
  var dm28m = sw[0] ? dm28 * 1.0E6 : dm28;
  output.t[0] = soutput.t[0]; output.t[1] = soutput.t[1];
  if (input.alt >= zn2[0]) { for (i = 0; i < 9; i++) output.d[i] = soutput.d[i]; return; }
  // lower mesosphere/upper stratosphere (between zn3[0] and zn2[0])
  meso_tgn2[0] = meso_tgn1[1]; meso_tn2[0] = meso_tn1[4];
  meso_tn2[1] = PMA[0][0] * PAVGM[0] / (1.0 - sw[20] * glob7s(PMA[0], input, flags));
  meso_tn2[2] = PMA[1][0] * PAVGM[1] / (1.0 - sw[20] * glob7s(PMA[1], input, flags));
  meso_tn2[3] = PMA[2][0] * PAVGM[2] / (1.0 - sw[20] * sw[22] * glob7s(PMA[2], input, flags));
  meso_tgn2[1] = PAVGM[8] * PMA[9][0] * (1.0 + sw[20] * sw[22] * glob7s(PMA[9], input, flags)) * meso_tn2[3] * meso_tn2[3] / Math.pow(PMA[2][0] * PAVGM[2], 2.0);
  meso_tn3[0] = meso_tn2[3];
  if (input.alt <= zn3[0]) {          // lower stratosphere and troposphere
    meso_tgn3[0] = meso_tgn2[1];
    meso_tn3[1] = PMA[3][0] * PAVGM[3] / (1.0 - sw[22] * glob7s(PMA[3], input, flags));
    meso_tn3[2] = PMA[4][0] * PAVGM[4] / (1.0 - sw[22] * glob7s(PMA[4], input, flags));
    meso_tn3[3] = PMA[5][0] * PAVGM[5] / (1.0 - sw[22] * glob7s(PMA[5], input, flags));
    meso_tn3[4] = PMA[6][0] * PAVGM[6] / (1.0 - sw[22] * glob7s(PMA[6], input, flags));
    meso_tgn3[1] = PMA[7][0] * PAVGM[7] * (1.0 + sw[22] * glob7s(PMA[7], input, flags)) * meso_tn3[4] * meso_tn3[4] / Math.pow(PMA[6][0] * PAVGM[6], 2.0);
  }
  var dmc = input.alt > zmix ? 1.0 - (zn2[0] - input.alt) / (zn2[0] - zmix) : 0, dz28 = soutput.d[2], dmr;
  dmr = soutput.d[2] / dm28m - 1.0;                                   // N2
  output.d[2] = densm(input.alt, dm28m, xmm, tz, mn3, zn3, meso_tn3, meso_tgn3, mn2, zn2, meso_tn2, meso_tgn2);
  output.d[2] = output.d[2] * (1.0 + dmr * dmc);
  dmr = soutput.d[0] / (dz28 * PDM[0][1]) - 1.0; output.d[0] = output.d[2] * PDM[0][1] * (1.0 + dmr * dmc);   // He
  output.d[1] = 0; output.d[8] = 0;                                   // O
  dmr = soutput.d[3] / (dz28 * PDM[3][1]) - 1.0; output.d[3] = output.d[2] * PDM[3][1] * (1.0 + dmr * dmc);   // O2
  dmr = soutput.d[4] / (dz28 * PDM[4][1]) - 1.0; output.d[4] = output.d[2] * PDM[4][1] * (1.0 + dmr * dmc);   // Ar
  output.d[6] = 0; output.d[7] = 0;                                   // H, N
  output.d[5] = 1.66E-24 * (4.0 * output.d[0] + 16.0 * output.d[1] + 28.0 * output.d[2] + 32.0 * output.d[3] + 40.0 * output.d[4] + output.d[6] + 14.0 * output.d[7]);
  if (sw[0]) output.d[5] = output.d[5] / 1000;
  densm(input.alt, 1.0, 0, tz, mn3, zn3, meso_tn3, meso_tgn3, mn2, zn2, meso_tn2, meso_tgn2);     // temperature at altitude (C: dd = densm(...))
  output.t[1] = tz[0];
}

function gtd7d(input, flags, output) {  // as gtd7, but total mass density includes anomalous oxygen (the one to use for drag)
  gtd7(input, flags, output);
  output.d[5] = 1.66E-24 * (4.0 * output.d[0] + 16.0 * output.d[1] + 28.0 * output.d[2] + 32.0 * output.d[3] + 40.0 * output.d[4] + output.d[6] + 14.0 * output.d[7] + 16.0 * output.d[8]);
  if (flags.sw[0]) output.d[5] = output.d[5] / 1000;
}

var FLAGS = { switches: new Array(24).fill(1), sw: new Array(24).fill(0), swc: new Array(24).fill(0) }, OUT = { d: new Array(9).fill(0), t: [0, 0] };

// in: { doy, sec (UT s of day), alt (km), g_lat, g_long (deg), lst (h), f107A, f107, ap, ap_a (7 values, optional) }.
// SI units: number densities in m^-3 (d[0..4, 6..8]: He, O, N2, O2, Ar, H, N, anomalous O), d[5] total mass density in kg/m^3
// including anomalous oxygen (gtd7d); t[0] exospheric and t[1] local temperature [K]. The returned object is reused between calls.
export function nrlmsise00(input) {
  FLAGS.switches[0] = 1; FLAGS.switches[9] = input.ap_a ? -1 : 1;
  gtd7d(input, FLAGS, OUT);
  return OUT;
}
