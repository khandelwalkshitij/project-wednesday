// Globe camera controls and resizing.
import { V } from './state.js';
import { $ } from '../app/dom.js';
import { T, camera, canvas, head, renderer, stage } from './scene.js';

export var cam = { az: 0.9, el: 0.42, dist: 4, home: 4 }, ptr = {}, pinch = 0;

export function placeCamera() { cam.el = Math.max(-1.55, Math.min(1.55, cam.el)); cam.dist = Math.max(1.08, Math.min(1.5e5, cam.dist)); var ce = Math.cos(cam.el);
  camera.position.set(cam.dist * ce * Math.cos(cam.az), cam.dist * Math.sin(cam.el), cam.dist * ce * Math.sin(cam.az)); camera.lookAt(0, 0, 0);
  head.position.copy(camera.position).add(new T.Vector3(0, cam.dist * 0.5, 0)); }

export function resize() { var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

export function init() {
  canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); ptr[e.pointerId] = [e.clientX, e.clientY]; pinch = 0; });

  canvas.addEventListener('pointermove', function (e) {
    var p = ptr[e.pointerId]; if (!p) return; var ids = Object.keys(ptr);
    if (ids.length === 1) { cam.az += (e.clientX - p[0]) * 0.006; cam.el += (e.clientY - p[1]) * 0.006; }
    ptr[e.pointerId] = [e.clientX, e.clientY];
    if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist *= pinch / dd; pinch = dd; }
    placeCamera();
  });

  ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function (e) { delete ptr[e.pointerId]; pinch = 0; }); });

  canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = 1 + (cam.dist - 1) * Math.exp(e.deltaY * 0.0012); placeCamera(); }, { passive: false });

  $('resetView').addEventListener('click', function () { V.mapFitted = false; cam.az = 0.9; cam.el = 0.42; cam.dist = cam.home; placeCamera(); });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
}
