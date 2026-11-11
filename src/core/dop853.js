// DOP853: explicit Runge-Kutta 8(5,3) with adaptive step size and 7th-order dense output (Hairer, Norsett, Wanner,
// "Solving Ordinary Differential Equations I", II.10). Step control, error norm and initial step follow SciPy's DOP853.
// The first nErr components are error-controlled; any after that (here: accumulated non-gravitational work) are
// integrated with the same stages but do not steer the step.
import { A, B, C, D, E3, E5, N_STAGES, N_STAGES_EXTENDED } from '../data/dop853-coefficients.js';

var SAFETY = 0.9, MIN_FACTOR = 0.2, MAX_FACTOR = 10, EXPONENT = -1 / 8;

// fun(t, y, out) writes dy/dt into out. opt: { rtol, atol, maxStep, initialStep }
export function Dop853(n, nErr, fun, opt) {
  var K = [], k; for (k = 0; k < N_STAGES_EXTENDED; k++) K.push(new Float64Array(n));
  this.n = n; this.nErr = nErr; this.fun = fun; this.rtol = opt.rtol; this.atol = opt.atol; this.maxStep = opt.maxStep || Infinity; this.h0 = opt.initialStep || 0;
  this.K = K; this.y = new Float64Array(n); this.yOld = new Float64Array(n); this.f = K[0]; this.fOld = new Float64Array(n);
  this.ys = new Float64Array(n); this.Q = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  this.t = 0; this.tOld = 0; this.h = 0; this.hAbs = 0; this.denseReady = false; this.accepted = 0; this.rejected = 0; this.hMin = Infinity; this.hMax = 0;
}

Dop853.prototype.init = function (t, y, tEnd) {
  this.t = t; this.y.set(y); this.fun(t, this.y, this.K[0]);
  this.hAbs = this.h0 > 0 ? Math.min(this.h0, this.maxStep) : this.initialStep(tEnd);
};

// after the state is changed outside the integrator (a burn): new derivative, keep the step size
Dop853.prototype.reset = function () { this.fun(this.t, this.y, this.K[0]); this.denseReady = false; };

Dop853.prototype.rms = function (v, scale) { var s = 0; for (var k = 0; k < this.nErr; k++) { var q = v[k] / scale[k]; s += q * q; } return Math.sqrt(s / this.nErr); };

Dop853.prototype.initialStep = function (tEnd) {      // Hairer's starting-step heuristic (SciPy select_initial_step, order 7)
  var n = this.n, y0 = this.y, f0 = this.K[0], sc = new Float64Array(n), y1 = new Float64Array(n), f1 = new Float64Array(n), df = new Float64Array(n), k, len = Math.abs(tEnd - this.t);
  if (len === 0) return 0;
  for (k = 0; k < n; k++) sc[k] = this.atol + Math.abs(y0[k]) * this.rtol;
  var d0 = this.rms(y0, sc), d1 = this.rms(f0, sc), h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * d0 / d1; h0 = Math.min(h0, len);
  for (k = 0; k < n; k++) y1[k] = y0[k] + h0 * f0[k];
  this.fun(this.t + h0, y1, f1); for (k = 0; k < n; k++) df[k] = f1[k] - f0[k];
  var d2 = this.rms(df, sc) / h0, h1 = d1 <= 1e-15 && d2 <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : Math.pow(0.01 / Math.max(d1, d2), 1 / 8);
  return Math.min(100 * h0, h1, len, this.maxStep);
};

// one accepted step, not past tEnd. Returns false if the step size underflows.
Dop853.prototype.step = function (tEnd) {
  var n = this.n, K = this.K, y = this.y, ys = this.ys, t = this.t, rtol = this.rtol, atol = this.atol, s, j, k;
  var minStep = 10 * Math.abs(t) * 2.220446049250313e-16 + 1e-12, hAbs = Math.min(Math.max(this.hAbs, minStep), this.maxStep), rejected = false;
  for (;;) {
    if (hAbs < minStep) return false;
    var tNew = t + hAbs, clipped = tNew >= tEnd; if (clipped) tNew = tEnd;
    var h = tNew - t;
    for (s = 1; s < N_STAGES; s++) {
      var a = A[s];
      for (k = 0; k < n; k++) { var dy = 0; for (j = 0; j < s; j++) if (a[j] !== 0) dy += a[j] * K[j][k]; ys[k] = y[k] + h * dy; }
      this.fun(t + C[s] * h, ys, K[s]);
    }
    var yNew = this.yOld;     // reuse the old buffer for the candidate state; swapped in on acceptance
    for (k = 0; k < n; k++) { var acc = 0; for (j = 0; j < N_STAGES; j++) if (B[j] !== 0) acc += B[j] * K[j][k]; yNew[k] = y[k] + h * acc; }
    this.fun(tNew, yNew, K[N_STAGES]);
    var e5 = 0, e3 = 0;
    for (k = 0; k < this.nErr; k++) {
      var sc = atol + Math.max(Math.abs(y[k]), Math.abs(yNew[k])) * rtol, q5 = 0, q3 = 0;
      for (j = 0; j <= N_STAGES; j++) { q5 += E5[j] * K[j][k]; q3 += E3[j] * K[j][k]; }
      q5 /= sc; q3 /= sc; e5 += q5 * q5; e3 += q3 * q3;
    }
    var err = e5 === 0 && e3 === 0 ? 0 : Math.abs(h) * e5 / Math.sqrt((e5 + 0.01 * e3) * this.nErr);
    if (err < 1) {
      var factor = err === 0 ? MAX_FACTOR : Math.min(MAX_FACTOR, SAFETY * Math.pow(err, EXPONENT)); if (rejected) factor = Math.min(1, factor);
      this.fOld.set(K[0]); this.yOld = y; this.y = yNew; K[0].set(K[N_STAGES]);
      // a step clipped to land on tEnd (a burn, the end of the run) keeps the untried proposal rather than restarting small
      this.tOld = t; this.t = tNew; this.h = h; this.hAbs = clipped ? hAbs : hAbs * factor; this.denseReady = false;
      this.accepted++; if (h < this.hMin && !clipped) this.hMin = h; if (h > this.hMax) this.hMax = h;
      return true;
    }
    hAbs *= Math.max(MIN_FACTOR, SAFETY * Math.pow(err, EXPONENT)); rejected = true; this.rejected++;
  }
};

// undo the last accepted step (an event was found inside it); the caller then steps to the event time instead
Dop853.prototype.rollback = function () {
  var y = this.y; this.y = this.yOld; this.yOld = y; this.t = this.tOld; this.K[0].set(this.fOld);
  this.accepted--; this.denseReady = false; this.hAbs = Math.min(this.hAbs, this.h);
};

// state at time t inside the last accepted step [tOld, t], from the 7th-order continuous extension
Dop853.prototype.dense = function (t, out) {
  var n = this.n, K = this.K, h = this.h, y0 = this.yOld, y1 = this.y, Q = this.Q, s, j, k;
  if (!this.denseReady) {
    // K[0] already holds f(t); the extension needs f(tOld) as stage 0 and f(t) as stage 12
    var K0 = K[0], keep = this.ys; keep.set(K0); K0.set(this.fOld);
    for (s = N_STAGES + 1; s < N_STAGES_EXTENDED; s++) {
      var a = A[s], yy = new Float64Array(n);
      for (k = 0; k < n; k++) { var dy = 0; for (j = 0; j < s; j++) if (a[j] !== 0) dy += a[j] * (j === N_STAGES ? keep[k] : K[j][k]); yy[k] = y0[k] + h * dy; }
      this.fun(this.tOld + C[s] * h, yy, K[s]);
    }
    for (k = 0; k < n; k++) {
      var dY = y1[k] - y0[k]; Q[0][k] = dY; Q[1][k] = h * this.fOld[k] - dY; Q[2][k] = 2 * dY - h * (keep[k] + this.fOld[k]);
      for (var r = 0; r < 4; r++) { var acc = 0; for (j = 0; j < N_STAGES_EXTENDED; j++) if (D[r][j] !== 0) acc += D[r][j] * (j === N_STAGES ? keep[k] : K[j][k]); Q[3 + r][k] = h * acc; }
    }
    K0.set(keep); this.denseReady = true;
  }
  var x = (t - this.tOld) / h;
  for (k = 0; k < n; k++) {
    var v = 0;
    for (var i = 0; i < 7; i++) { v += Q[6 - i][k]; v *= i % 2 === 0 ? x : 1 - x; }
    out[k] = v + y0[k];
  }
};
