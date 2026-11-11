// Telemetry panel, animation loop, view switching and transport controls.
import { V } from './state.js';
import { D2R, R2D, S } from '../app/boot.js';
import { $, download, el } from '../app/dom.js';
import { colour, fmtElapsed, fmtLen, fmtSpeed } from '../app/util.js';
import { getCr } from '../core/cr-schedule.js';
import { cam, placeCamera, resize } from './camera.js';
import { SPECS, drawChart } from './charts.js';
import { drawMap, setView, trailOf, view } from './map.js';
import { m4, rotAt, setPlaying, st, stateAt, v3 } from './playback.js';
import { api, axes, body, camera, head, renderer, scene, spin, stage, sunLine, sunMark } from './scene.js';

export function telemetry() {
  var o = V.sats[V.selected], P = V.plan.parent; stateAt(o.s, Math.min(V.simT, o.impact));
  var k = S.stateToKep(P.mu, st), M = S.bodyMatrix(V.plan.poleRa, V.plan.poleDec, rotAt(V.simT)), rb = S.mvec(M, [st[0], st[1], st[2]]), g = S.geodetic(rb[0], rb[1], rb[2], P.radius, P.flattening);
  var rowsT = [['altitude', fmtLen(g.h)], ['speed', fmtSpeed(Math.hypot(st[3], st[4], st[5]))], ['lat / lon', (g.lat * R2D).toFixed(2) + '° / ' + (g.lon * R2D).toFixed(2) + '°'],
    ['a', fmtLen(k.a)], ['e', k.e.toFixed(5)], ['i', (k.i * R2D).toFixed(3) + '°']];
  if (P.shape === 'earth_default') { var lh = S.ltanHours(st, V.plan.tt0 + Math.min(V.simT, o.impact), V.dut1); rowsT.push(['LTAN', isNaN(lh) ? 'n/a' : S.fmtHms(lh)]);
    var sdn = S.sunDirection(V.plan.tt0 + V.simT); rowsT.push(['beta', (S.betaAngle(st, 0, sdn) * R2D).toFixed(2) + '\u00b0']); rowsT.push(['Sun', S.inShadow(st[0], st[1], st[2], sdn, S.EARTH.a) ? 'in eclipse' : 'sunlit']); }
  if (P.shape === 'earth_default') {
    if (V.plan.srp && o.s.satCfg && o.s.satCfg.cr) {
      rowsT.push(['solar Cr', getCr(o.s.satCfg.cr, Math.min(V.simT, o.impact)).toFixed(3)]);
    }
    var tNow = V.plan.tt0 + Math.min(V.simT, o.impact), rhoNow = V.plan.atmosphere === 'nrlmsise00' ? S.msisDensity(tNow, g.lat, g.lon, g.h, V.plan.spaceWeather) : S.atmosphereDensity(g.h);
    rowsT.push([V.plan.atmosphere === 'nrlmsise00' ? 'air density (MSIS)' : 'air density', rhoNow.toExponential(2) + ' kg/m³']);
    var B = S.magneticField(rb);
    rowsT.push(['|B| dipole', (Math.hypot(B[0], B[1], B[2]) * 1e9).toFixed(0) + ' nT']);
  }
  var box = $('telemetry'); box.textContent = ''; var head = el('b', o.s.name + (V.simT >= o.impact ? ' (impacted)' : '')); head.style.color = colour(V.selected); box.appendChild(head);
  rowsT.forEach(function (r) { var d = el('div'); d.appendChild(el('span', r[0])); d.appendChild(el('span', r[1])); box.appendChild(d); });
}

export function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (now - V.lastFrame) / 1000 || 0); V.lastFrame = now;
  if (!V.plan) { renderer.render(scene, camera); return; }
  var tEnd = V.plan.times[V.plan.times.length - 1];
  if (V.playing) { V.simT += dt * +$('speed').value; if (V.simT >= tEnd) { V.simT = tEnd; setPlaying(false); } var lo = 0, hi = V.plan.times.length - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (V.plan.times[mid] <= V.simT) lo = mid; else hi = mid; } $('scrub').value = V.simT >= tEnd ? hi : lo; }
  if (view === 'docs') { /* HTML handles this */ }
  else if (view === 'map') drawMap(); else if (SPECS[view]) drawChart(SPECS[view], view); else {
  // parent orientation: body -> inertial is the transpose of bodyMatrix
  var M = S.bodyMatrix(V.plan.poleRa, V.plan.poleDec, rotAt(V.simT));
  m4.set(M[0], M[3], M[6], 0, M[1], M[4], M[7], 0, M[2], M[5], M[8], 0, 0, 0, 0, 1); body.quaternion.setFromRotationMatrix(m4);
  var R = V.plan.parent.radius, H = stage.clientHeight, W = stage.clientWidth, px = 2 * Math.tan(camera.fov * D2R / 2) / H, showL = $('tLabels').checked, showP = $('tPaths').checked;
  axes.visible = $('tAxes').checked; axes.scale.setScalar(Math.max(1.6, cam.home * 0.42)); spin.visible = axes.visible;
  scene.updateMatrixWorld(); var cp = camera.position;
  if (V.isEarth) {     // light the globe from the Sun and mark its direction (scene axes: x, z, -y of GCRF)
    var sd = S.sunDirection(V.plan.tt0 + V.simT), SD = 1.2e5, len = Math.max(1.6, cam.home * 0.42);
    head.position.set(sd[0] * 10, sd[2] * 10, -sd[1] * 10);
    sunMark.position.set(sd[0] * SD, sd[2] * SD, -sd[1] * SD); sunMark.scale.setScalar(sunMark.position.distanceTo(cp) * px * 9);
    var sp = sunLine.geometry.attributes.position; sp.setXYZ(1, sd[0] * len, sd[2] * len, -sd[1] * len); sp.needsUpdate = true; sunLine.computeLineDistances(); sunLine.visible = axes.visible;
    v3.copy(sunMark.position); var sdot = (v3.x - cp.x) * -cp.x + (v3.y - cp.y) * -cp.y + (v3.z - cp.z) * -cp.z, sl2 = v3.distanceToSquared(cp), st2 = sdot / sl2, shid = false;
    if (st2 > 0 && st2 < 1) shid = Math.hypot(cp.x + st2 * (v3.x - cp.x), cp.y + st2 * (v3.y - cp.y), cp.z + st2 * (v3.z - cp.z)) < 0.985;
    var sfront = (v3.x - cp.x) * -cp.x + (v3.y - cp.y) * -cp.y + (v3.z - cp.z) * -cp.z > 0;
    sunMark.visible = !shid; v3.project(camera);
    if (!showL || shid || !sfront || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) V.sunLabel.style.display = 'none';
    else { V.sunLabel.style.display = ''; V.sunLabel.style.left = ((v3.x + 1) / 2 * W + 6).toFixed(1) + 'px'; V.sunLabel.style.top = ((1 - v3.y) / 2 * H).toFixed(1) + 'px'; }
  }
  V.sats.forEach(function (o, i) {
    var gone = stateAt(o.s, V.simT) && V.simT >= o.impact;
    o.marker.position.set(st[0] / R, st[1] / R, st[2] / R); o.marker.visible = !gone; o.path.visible = showP; o.path.material.uniforms.uNow.value = V.simT; o.path.material.uniforms.uTrail.value = Math.min(trailOf(o), 1e30); if (o.mark) o.mark.visible = gone;
    if (gone !== o.lost) { o.lost = gone; o.btn.lastChild.textContent = o.s.name + (gone ? '  impact' : ''); }
    o.marker.getWorldPosition(v3); var d = v3.distanceTo(cp); o.marker.scale.setScalar(d * px * (i === V.selected ? 5.5 : 4));
    // hide the label when the parent is in front of the satellite
    var sx = v3.x - cp.x, sy = v3.y - cp.y, sz = v3.z - cp.z, tt = -(cp.x * sx + cp.y * sy + cp.z * sz) / (d * d), hid = false;
    if (tt > 0 && tt < 1) hid = Math.hypot(cp.x + tt * sx, cp.y + tt * sy, cp.z + tt * sz) < 0.985;
    v3.project(camera);
    if (!showL || gone || hid || v3.z > 1) o.label.style.display = 'none';
    else { o.label.style.display = ''; o.label.style.left = ((v3.x + 1) / 2 * W).toFixed(1) + 'px'; o.label.style.top = ((1 - v3.y) / 2 * H).toFixed(1) + 'px'; }
  });
  renderer.render(scene, camera);
  }
  if (now - V.lastHud > 120) { V.lastHud = now; $('epoch').textContent = S.formatUtc(V.plan.tt0 + V.simT).replace('T', ' ').replace('Z', ' UTC'); $('elapsed').textContent = fmtElapsed(V.simT) + '  of  ' + fmtElapsed(tEnd).slice(3); telemetry(); }
}

export var sv = 'globe';

export function init() {
  Array.prototype.forEach.call(document.querySelectorAll('.tabs [role=tab]'), function (b) { b.addEventListener('click', function () { setView(b.dataset.v); }); });
  try { sv = localStorage.getItem('orbitalsim.view') || 'globe'; } catch (e) {}

  setView(sv === 'map' || SPECS[sv] ? sv : 'globe');

  $('saveChart').addEventListener('click', function () { var sp = SPECS[view]; if (V.plan && sp && !sp.need() && sp.series().length) download(view + '.csv', sp.csv(), 'text/csv'); });

  placeCamera();
  resize();
  requestAnimationFrame(frame);

  api.state = function () { return { simT: V.simT, playing: V.playing, selected: V.selected, n: V.sats.length }; };
}
