// three.js scene: renderer, camera, stars, axes, parent body, Sun, satellite markers and textures.
import { V } from './state.js';
import { $ } from '../app/dom.js';
import { LAND } from '../data/land-110m.js';

export var canvas, stage;

export var api;

export var T, renderer;

export var scene, camera;

export var icrf;
      // ICRF z is "up" on screen
export var amb;
export var head;

export var axes;

export var body;

export var globe;

export var spin;

export var impactMarks;

export var satGroup;

export var SUN_COL = 0xffd000, sunMark;

export var sunLine;

export var labels, markerGeo;

export function baseCanvas(shape, grid) {
  var W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d'), i, j;
  if (shape === 'earth_default') {
    g.fillStyle = '#0f3a6e'; g.fillRect(0, 0, W, H); g.fillStyle = '#5a9a5e';
    [-1, 0, 1].forEach(function (cp) { g.beginPath();
      LAND.forEach(function (r) { for (var q = 0; q < r.length; q += 2) { var x = (r[q] / 100 + 180) / 360 * W + cp * W, y = (90 - r[q + 1] / 100) / 180 * H; if (q) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); });
      g.fill('evenodd'); });
  } else {
    g.fillStyle = '#77716a'; g.fillRect(0, 0, W, H); var seed = 11; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (i = 0; i < 420; i++) { var x = rnd() * W, y = rnd() * H, rr = 6 + rnd() * rnd() * 90, sh = rnd(); g.fillStyle = sh > 0.5 ? 'rgba(40,36,32,' + (0.10 + 0.2 * rnd()) + ')' : 'rgba(190,182,170,' + (0.06 + 0.12 * rnd()) + ')';
      for (var w = -1; w <= 1; w++) { g.beginPath(); g.ellipse(x + w * W, y, rr / Math.max(0.25, Math.sin(Math.PI * y / H)), rr, 0, 0, 2 * Math.PI); g.fill(); } }
  }
  if (!grid) return c;
  g.lineWidth = 1.5;
  for (i = 0; i <= 12; i++) { g.strokeStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(i * W / 12, 0); g.lineTo(i * W / 12, H); g.stroke(); }
  for (j = 1; j < 6; j++) { g.strokeStyle = j === 3 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(0, j * H / 6); g.lineTo(W, j * H / 6); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,0,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();   // prime meridian
  return c;
}

export function texture(shape) { var t = new T.CanvasTexture(baseCanvas(shape, true)); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }

export var THEME = { stage: '#000000', dark: true, bad: '#ff0000' };

export function init() {
  canvas = $('gl');
  stage = $('stage');
  V.plan = null;
  V.planSeq = 0;
  V.simT = 0;
  V.playing = false;
  V.selected = 0;
  V.lastFrame = 0;
  V.lastHud = 0;

  api = { setPlan: function (p) { V.plan = p; } };

  if (!window.THREE || !function () { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } }()) {
    $('notice').hidden = false; $('notice').textContent = 'The 3D view needs WebGL and three.js (loaded from cdnjs). The simulation still runs and plan.csv can be downloaded.';
    $('transport').hidden = true; $('side').hidden = true;
    return api;
  }

  T = THREE;
  renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000);

  scene = new T.Scene();
  camera = new T.PerspectiveCamera(42, 1, 0.01, 4e5);

  icrf = new T.Group();
  icrf.rotation.x = -Math.PI / 2;
  scene.add(icrf);
        // ICRF z is "up" on screen
  amb = new T.AmbientLight(0xffffff, 0.62);
  scene.add(amb);
  head = new T.DirectionalLight(0xffffff, 0.75);
  scene.add(head);

  // stars
  (function () { var n = 1400, a = new Float32Array(3 * n), seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < n; i++) { var u = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), q = Math.sqrt(1 - u * u); a[3 * i] = 2e5 * q * Math.cos(ph); a[3 * i + 1] = 2e5 * u; a[3 * i + 2] = 2e5 * q * Math.sin(ph); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(a, 3)); scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false }))); })();

  // inertial axes
  axes = new T.Group();
  icrf.add(axes);

  [[1, 0, 0, 0xff6b5e], [0, 1, 0, 0x6fd08c], [0, 0, 1, 0x6aa9ff]].forEach(function (a) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, a[0], a[1], a[2]], 3)); axes.add(new T.Line(g, new T.LineBasicMaterial({ color: a[3], transparent: true, opacity: 0.7 }))); });

  // parent
  body = new T.Group();
  icrf.add(body);

  globe = new T.Mesh(new T.SphereGeometry(1, 96, 64), new T.MeshLambertMaterial({ color: 0xffffff }));
  globe.rotation.x = Math.PI / 2;
  body.add(globe);

  spin = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xffff00 }));
  spin.geometry.setAttribute('position', new T.Float32BufferAttribute([0, 0, -1.3, 0, 0, 1.3], 3));
  body.add(spin);

  impactMarks = new T.Group();
  body.add(impactMarks);

  satGroup = new T.Group();
  icrf.add(satGroup);

  // Sun (earth_default only, display only): low-precision analytic position, good to about 0.01 deg. Unit vector in GCRF.
  sunMark = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshBasicMaterial({ color: SUN_COL }));
  scene.add(sunMark);

  sunLine = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: SUN_COL, dashSize: 0.08, gapSize: 0.05 }));
  scene.add(sunLine);

  sunLine.geometry.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
  V.sunLabel = null;
  V.isEarth = false;

  V.sats = [];
  labels = $('labels');
  markerGeo = new T.SphereGeometry(1, 14, 10);
}
