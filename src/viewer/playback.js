// Loads a plan into the viewer, interpolates satellite states and handles selection.
import { V } from './state.js';
import { D2R, R2D, S } from '../app/boot.js';
import { $, el } from '../app/dom.js';
import { colour, fields } from '../app/util.js';
import { cam, placeCamera, resize } from './camera.js';
import { SPEEDS } from './index.js';
import { TAU, buildTrace, mapBaseFrom, setView, view } from './map.js';
import { T, amb, api, baseCanvas, globe, head, impactMarks, labels, markerGeo, satGroup, sunLine, sunMark, texture } from './scene.js';

export var st;

export function stateAt(s, t) {
  var n = s.t.length, lo = 0, hi = n - 1;
  if (t >= s.t[hi]) { for (var k = 0; k < 6; k++) st[k] = s.y[6 * hi + k]; return t > s.t[hi] + 1e-9; }
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (s.t[mid] <= t) lo = mid; else hi = mid; }
  var h = s.t[hi] - s.t[lo], u = (t - s.t[lo]) / h, u2 = u * u, u3 = u2 * u, a = 2 * u3 - 3 * u2 + 1, b = (u3 - 2 * u2 + u) * h, c = -2 * u3 + 3 * u2, d = (u3 - u2) * h, da = (6 * u2 - 6 * u) / h, db = 3 * u2 - 4 * u + 1, dc = -da, dd = 3 * u2 - 2 * u;
  for (var q = 0; q < 3; q++) { var y0 = s.y[6 * lo + q], y1 = s.y[6 * hi + q], v0 = s.y[6 * lo + 3 + q], v1 = s.y[6 * hi + 3 + q]; st[q] = a * y0 + b * v0 + c * y1 + d * v1; st[3 + q] = da * y0 + db * v0 + dc * y1 + dd * v1; }
  return false;
}

export function rotAt(t) {
  var tm = V.plan.times, n = tm.length, lo = 0, hi = n - 1; if (t >= tm[hi]) return V.plan.rot[hi];
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (tm[mid] <= t) lo = mid; else hi = mid; }
  var dt = tm[hi] - tm[lo], d = V.plan.rot[hi] - V.plan.rot[lo]; d += 2 * Math.PI * Math.round((V.plan.parent.omega * dt - d) / (2 * Math.PI));
  return V.plan.rot[lo] + d * (t - tm[lo]) / dt;
}

export function select(i) { V.selected = i; V.sats.forEach(function (o, k) { o.btn.setAttribute('aria-pressed', k === i); o.path.material.uniforms.uGain.value = k === i ? 1.0 : 0.6; }); $('telemetry').hidden = false; V.lastHud = 0; }

export function setPlaying(v) { V.playing = v; $('play').textContent = v ? 'Pause' : 'Play'; }

export var v3, m4;

export function init() {
  // state of satellite s at time t (cubic Hermite between plan.csv rows, using the velocity columns)
  st = new Float64Array(6);

  api.setPlan = function (p) {
    V.plan = p; V.planSeq++; V.simT = 0; V.selected = 0; var R = p.parent.radius, rmax = R;
    if (globe.material.map) globe.material.map.dispose();
    globe.material.map = texture(p.parent.shape); globe.material.needsUpdate = true; globe.scale.set(1, 1 - p.parent.flattening, 1);
    while (satGroup.children.length) { var ch = satGroup.children[0]; satGroup.remove(ch); if (ch.geometry !== markerGeo) ch.geometry.dispose(); ch.material.dispose(); }
    while (impactMarks.children.length) impactMarks.remove(impactMarks.children[0]);
    labels.textContent = ''; $('legend').textContent = ''; V.sats = [];
    V.isEarth = p.parent.shape === 'earth_default'; amb.intensity = V.isEarth ? 0.4 : 0.62; head.intensity = V.isEarth ? 1.05 : 0.75; sunMark.visible = sunLine.visible = V.isEarth;
    V.sunLabel = el('span', 'Sun'); V.sunLabel.style.color = '#ffd000'; V.sunLabel.style.display = 'none'; labels.appendChild(V.sunLabel);
    var imp = {}; p.meta.impacts.forEach(function (s) { var f = fields(s); imp[f.sat] = f; });
    p.sats.forEach(function (s, i) {
      var col = new T.Color(colour(i)), n = s.t.length, pts = [], tv = [], shv = [], k, j, isE = p.parent.shape === 'earth_default';
      var put = function (t, x, y, z) { pts.push(x / R, y / R, z / R); tv.push(t); shv.push(isE && S.inShadow(x, y, z, S.sunDirection(p.tt0 + t), S.EARTH.a) ? 1 : 0); };
      for (k = 0; k < n; k++) {      // densify between rows (cubic Hermite on position and velocity) so the fade is smooth
        var x = s.y[6 * k], y = s.y[6 * k + 1], z = s.y[6 * k + 2]; rmax = Math.max(rmax, Math.hypot(x, y, z));
        if (k > 0) {
          var x0 = s.y[6 * k - 6], y0 = s.y[6 * k - 5], z0 = s.y[6 * k - 4], cc = (x * x0 + y * y0 + z * z0) / (Math.hypot(x, y, z) * Math.hypot(x0, y0, z0));
          var m = Math.min(16, Math.max(1, Math.ceil(Math.acos(Math.max(-1, Math.min(1, cc))) / (3 * D2R))));
          if (n * m > 60000) m = Math.max(1, Math.floor(60000 / n));
          for (j = 1; j < m; j++) { var tj = s.t[k - 1] + (s.t[k] - s.t[k - 1]) * j / m; stateAt(s, tj); put(tj, st[0], st[1], st[2]); }
        }
        put(s.t[k], x, y, z);
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); g.setAttribute('aT', new T.Float32BufferAttribute(tv, 1)); g.setAttribute('aSh', new T.Float32BufferAttribute(shv, 1));
      var path = new T.Line(g, new T.ShaderMaterial({ transparent: true, depthWrite: false,
        uniforms: { uColor: { value: col }, uNow: { value: 0 }, uTrail: { value: 86400 }, uGain: { value: 0.6 } },
        vertexShader: 'attribute float aT; attribute float aSh; varying float vT; varying float vSh; void main() { vT = aT; vSh = aSh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uNow, uTrail, uGain; varying float vT; varying float vSh;\n' +
          'void main() { float age = uNow - vT; float a; if (age >= 0.0) { if (age > uTrail) discard; a = uGain * (1.0 - age / uTrail); } else { if (-age > uTrail) discard; a = 0.22; } gl_FragColor = vec4(uColor * (1.0 - 0.72 * step(0.5, vSh)), a); }' }));
      satGroup.add(path);
      var marker = new T.Mesh(markerGeo, new T.MeshBasicMaterial({ color: col })); satGroup.add(marker);
      var lab = el('span', s.name); lab.style.color = colour(i); labels.appendChild(lab);
      var btn = el('button'), dot = el('span', '', 'dot'); dot.style.background = colour(i); btn.appendChild(dot); btn.appendChild(document.createTextNode(s.name)); btn.title = s.name;
      btn.addEventListener('click', function () { select(i); }); $('legend').appendChild(btn);
      var im = imp[s.name], mark = null;
      if (im) { var b = im.body_fixed_m.split(' ').map(Number); mark = new T.Mesh(markerGeo, new T.MeshBasicMaterial({ color: 0xff5a4a })); mark.position.set(b[0] / R, b[1] / R, b[2] / R); mark.scale.setScalar(0.025); mark.visible = false; impactMarks.add(mark); }
      V.sats.push({ s: s, path: path, marker: marker, label: lab, btn: btn, impact: im ? +im.t_s : Infinity, mark: mark, lost: null,
        trace: buildTrace(p, s), impLL: im ? [+im.lon_deg * D2R, +im.lat_deg * D2R] : null, mapPts: [] });
    });
    cam.home = cam.dist = Math.max(3.2, 2.7 * rmax / R); cam.az = 0.9; cam.el = 0.42; placeCamera();
    var dur = p.times[p.times.length - 1], best = SPEEDS[0]; SPEEDS.forEach(function (sp) { if (Math.abs(Math.log(dur / sp / 75)) < Math.abs(Math.log(dur / best / 75))) best = sp; });
    $('speed').value = best; $('scrub').max = p.times.length - 1; $('scrub').value = 0;
    $('tLabels').checked = p.sats.length <= 24;
    V.mapBase = p.parent.shape === 'earth_default' ? null : mapBaseFrom(baseCanvas(p.parent.shape, false)); V.mapFitted = false; setView(view);
    V.dut1 = (p.meta.config.earth_orientation && p.meta.config.earth_orientation.dut1_s) || 0;
    if (p.parent.shape === 'earth_default') {     // LTAN series for the chart, one Earth orientation matrix per output time
      var Mc = {}; p.times.forEach(function (t) { Mc[t] = S.earthRotation(p.tt0 + t, V.dut1).M; });
      V.sats.forEach(function (o) {
        var tt = [], hh = [];
        for (var q = 0; q < o.s.t.length; q++) {
          var v = S.ltanFromMatrix(Mc[o.s.t[q]], o.s.y.subarray(6 * q, 6 * q + 6), p.tt0 + o.s.t[q], V.dut1); if (isNaN(v)) continue;
          if (hh.length) v = S.unwrapHours(hh[hh.length - 1], v); tt.push(o.s.t[q]); hh.push(v);
        }
        var fit = S.fitLine(tt, hh); o.lt = tt.length > 1 ? { t: Float64Array.from(tt), h: Float64Array.from(hh), slope: fit[0], icpt: fit[1], fitOk: true } : null;
      });
    }
    // orbital period (for the 1-orbit trail), beta angle and eclipse series
    V.sats.forEach(function (o) {
      var e0 = S.stateToKep(p.parent.mu, o.s.y.subarray(0, 6)); o.period = e0.a > 0 && e0.e < 1 ? TAU * Math.sqrt(Math.pow(e0.a, 3) / p.parent.mu) : 86400;
      o.beta = null; o.ecl = null; o.eclEv = [];
      if (p.parent.shape !== 'earth_default') return;
      var n = o.s.t.length, bh = new Float64Array(n);
      for (var q = 0; q < n; q++) bh[q] = S.betaAngle(o.s.y, 6 * q, S.sunDirection(p.tt0 + o.s.t[q])) * R2D;
      var fb = S.fitLine(o.s.t, bh); o.beta = { t: o.s.t, h: bh, slope: fb[0], icpt: fb[1], fitOk: n > 1 };
      o.eclEv = S.eclipseEvents(o.s, p.tt0, S.EARTH.a);
      var done = o.eclEv.filter(function (e) { return !e.open; }), mx = 0; done.forEach(function (e) { mx = Math.max(mx, (e.t1 - e.t0) / 60); });
      o.ecl = { t: Float64Array.from(done.map(function (e) { return (e.t0 + e.t1) / 2; })), h: Float64Array.from(done.map(function (e) { return (e.t1 - e.t0) / 60; })), ev: o.eclEv, max: mx, fitOk: false };
    });
    // altitude series: instantaneous, and averaged over one orbit (centred window of one period) for the drift rate
    var uf = p.parent.radius < 1e5 ? 1 : 1000;
    V.sats.forEach(function (o) {
      var sv = o.s, n = sv.t.length, raw = new Float64Array(n), q;
      for (q = 0; q < n; q++) { var rb = S.mvec(S.bodyMatrix(p.poleRa, p.poleDec, rotAt(sv.t[q])), [sv.y[6 * q], sv.y[6 * q + 1], sv.y[6 * q + 2]]); raw[q] = S.geodetic(rb[0], rb[1], rb[2], p.parent.radius, p.parent.flattening).h / uf; }
      var k0 = S.stateToKep(p.parent.mu, sv.y.subarray(0, 6)), per = k0.a > 0 && k0.e < 1 ? TAU * Math.sqrt(Math.pow(k0.a, 3) / p.parent.mu) : 0;
      var dtq = n > 1 ? sv.t[1] - sv.t[0] : 0, w = dtq ? Math.round(per / dtq) : 0, tm = [], hm = [], avg = w >= 3 && w < n;
      if (avg) { var cs = new Float64Array(n + 1); for (q = 0; q < n; q++) cs[q + 1] = cs[q] + raw[q]; for (q = 0; q + w < n; q++) { tm.push((sv.t[q] + sv.t[q + w]) / 2); hm.push((cs[q + w + 1] - cs[q]) / (w + 1)); } }
      else { tm = Array.from(sv.t); hm = Array.from(raw); }
      var fa = S.fitLine(tm, hm);
      o.alt = { t: Float64Array.from(tm), h: Float64Array.from(hm), rt: sv.t, raw: raw, slope: fa[0], icpt: fa[1], uf: uf, avg: avg,
        fitOk: per > 0 && sv.t[n - 1] - sv.t[0] >= Math.max(3 * per, 43200) };   // a drift rate needs at least 3 orbits and 12 h
    });
    select(0); setPlaying(true); resize();
  };

  $('play').addEventListener('click', function () { if (!V.plan) return; if (!V.playing && V.simT >= V.plan.times[V.plan.times.length - 1]) V.simT = 0; setPlaying(!V.playing); });

  $('scrub').addEventListener('input', function () { if (V.plan) { V.simT = V.plan.times[+this.value]; V.lastHud = 0; } });

  document.addEventListener('keydown', function (e) { if (e.code === 'Space' && !/^(TEXTAREA|INPUT|SELECT|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); $('play').click(); } });

  v3 = new T.Vector3();
  m4 = new T.Matrix4();
}
