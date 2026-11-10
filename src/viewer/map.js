// Mercator map: land, day and night, ground traces, pan and zoom.
import { V } from './state.js';
import { D2R, R2D, S } from '../app/boot.js';
import { $ } from '../app/dom.js';
import { colour } from '../app/util.js';
import { LAND } from '../data/land-110m.js';
import { SPECS, isEarthPlan, ltCv } from './charts.js';
import { rotAt, select, st, stateAt } from './playback.js';
import { THEME, canvas, labels, stage } from './scene.js';

export var mapCv, mctx, view = 'globe', TAU = 2 * Math.PI, YMAX = Math.PI, LATMAX;
  // Web Mercator, +-85.0511 deg
export var mv = { s: 1, cx: 0, cy: 0 }, MONO = '11px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif', CHUNK = 64;

export var trailMode = '24h';

export function trailOf(o) { return trailMode === 'all' ? Infinity : trailMode === 'orbit' ? o.period : trailMode === '6h' ? 21600 : 86400; }
   // past trace fades over this; the preview ahead is the same length
export var OCEAN = '#0f3a6e', LANDCOL = '#5a9a5e', landMerc = null;

export function mercY(lat) { var l = Math.max(-LATMAX, Math.min(LATMAX, lat)); return -Math.log(Math.tan(Math.PI / 4 + l / 2)); }
   // positive down (south)
export function latOf(Y) { return 2 * Math.atan(Math.exp(-Y)) - Math.PI / 2; }

export function mapBaseFrom(src) {      // reproject an equirectangular canvas to Web Mercator
  var W = src.width, H = W, c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.imageSmoothingEnabled = true;
  for (var y = 0; y < H; y++) { var lat = latOf(-YMAX + (y + 0.5) / H * 2 * YMAX), sy = (0.5 - lat / Math.PI) * src.height;
    g.drawImage(src, 0, Math.max(0, Math.min(src.height - 1, sy - 0.5)), W, 1, 0, y, W, 1); }
  return c;
}

export function landPath() {        // Natural Earth 110m land (public domain) as one path in (longitude, Mercator y)
  if (landMerc) return landMerc; landMerc = new Path2D();
  LAND.forEach(function (r) { for (var i = 0; i < r.length; i += 2) { var x = r[i] / 100 * D2R, y = mercY(r[i + 1] / 100 * D2R); if (i) landMerc.lineTo(x, y); else landMerc.moveTo(x, y); } landMerc.closePath(); });
  return landMerc;
}

export function mapArea() { return { W: Math.max(50, stage.clientWidth), H: Math.max(50, stage.clientHeight - ($('transport').offsetHeight || 0)) }; }

export function limitScale(s) { var lo = mapArea().W / TAU; return Math.max(lo, Math.min(lo * 64, s)); }

export function clampMap() { var a = mapArea(); mv.s = limitScale(mv.s); var half = a.H / (2 * mv.s);
  mv.cy = half >= YMAX ? 0 : Math.max(-YMAX + half, Math.min(YMAX - half, mv.cy)); mv.cx = ((mv.cx + Math.PI) % TAU + TAU) % TAU - Math.PI; }

export function zoomAt(clientX, clientY, f) {
  var r = mapCv.getBoundingClientRect(), a = mapArea(), px = clientX - r.left - a.W / 2, py = clientY - r.top - a.H / 2, wx = mv.cx + px / mv.s, wy = mv.cy + py / mv.s;
  mv.s = limitScale(mv.s * f); mv.cx = wx - px / mv.s; mv.cy = wy - py / mv.s; clampMap();
}

export function frameLabel() {
  if (!V.plan) return; var sp = SPECS[view];
  $('frame').textContent = view === 'docs' ? 'Simulator Documentation & Astrodynamics Models' :
    sp ? (sp.label || (view === 'alt' ? (isEarthPlan() ? 'Altitude above the WGS84 ellipsoid' : 'Altitude above the surface') : 'Distance between satellites')) :
    view === 'map' ? 'Ground trace · body-fixed' + (isEarthPlan() ? ' (ITRF), geodetic latitude' : '') + ' · Mercator' : V.plan.parent.frame + ' · parent to scale';
}

export function setView(v) {
  view = v; 
  mapCv.hidden = v !== 'map'; 
  ltCv.hidden = !SPECS[v]; 
  canvas.hidden = v !== 'globe'; 
  labels.hidden = v !== 'globe';
  var docEl = $('docs'); if(docEl) docEl.hidden = v !== 'docs';
  $('tAxes').disabled = v !== 'globe';
  var noHud = v === 'docs';
  $('hud').hidden = noHud;
  var chart = !!SPECS[v]; 
  $('tPaths').disabled = $('tLabels').disabled = $('trail').disabled = chart || noHud; 
  $('resetView').disabled = chart || noHud; 
  $('side').hidden = chart || noHud; 
  $('saveChart').hidden = !chart;
  Array.prototype.forEach.call(document.querySelectorAll('.tabs [role=tab]'), function (b) { b.setAttribute('aria-selected', b.dataset.v === v ? 'true' : 'false'); });
  try { localStorage.setItem('orbitalsim.view', v); } catch (e) {}
  frameLabel();
}

// ground trace: densified (lon, mercator y, t) points, stored as Path2D chunks so the past part can be drawn each frame cheaply
export function seg(path, Lp, Yp, L, Y) { if (Math.abs(L - Lp) > Math.PI) { var sh = L > Lp ? -TAU : TAU; path.lineTo(L + sh, Y); path.moveTo(Lp - sh, Yp); } path.lineTo(L, Y); }

export function rangePath(tr, i0, i1, path) { path = path || new Path2D(); path.moveTo(tr.lon[i0], tr.Y[i0]); for (var i = i0 + 1; i <= i1; i++) seg(path, tr.lon[i - 1], tr.Y[i - 1], tr.lon[i], tr.Y[i]); return path; }

export function rangePathSh(tr, i0, i1) {      // only the segments flown in Earth's shadow
  var path = null; for (var i = i0 + 1; i <= i1; i++) if (tr.sh[i] && tr.sh[i - 1]) { if (!path) path = new Path2D(); path.moveTo(tr.lon[i - 1], tr.Y[i - 1]); seg(path, tr.lon[i - 1], tr.Y[i - 1], tr.lon[i], tr.Y[i]); }
  return path;
}

export function buildTrace(p, s) {
  var lon = [], Ys = [], ts = [], sh = [], n = s.t.length, R = p.parent.radius, isE = p.parent.shape === 'earth_default';
  function add(t, x, y, z) {
    var rb = S.mvec(S.bodyMatrix(p.poleRa, p.poleDec, rotAt(t)), [x, y, z]), gd = S.geodetic(rb[0], rb[1], rb[2], R, p.parent.flattening); lon.push(gd.lon); Ys.push(mercY(gd.lat)); ts.push(t);
    sh.push(isE && S.inShadow(x, y, z, S.sunDirection(p.tt0 + t), S.EARTH.a) ? 1 : 0);
  }
  for (var q = 0; q < n; q++) {
    var x = s.y[6 * q], y = s.y[6 * q + 1], z = s.y[6 * q + 2];
    if (q > 0) {
      var x0 = s.y[6 * q - 6], y0 = s.y[6 * q - 5], z0 = s.y[6 * q - 4], c = (x * x0 + y * y0 + z * z0) / (Math.hypot(x, y, z) * Math.hypot(x0, y0, z0));
      var ang = Math.acos(Math.max(-1, Math.min(1, c))) + Math.abs(V.plan.parent.omega * (s.t[q] - s.t[q - 1])), m = Math.min(24, Math.ceil(ang / (2 * D2R)));
      for (var j = 1; j < m; j++) { var tj = s.t[q - 1] + (s.t[q] - s.t[q - 1]) * j / m; stateAt(s, tj); add(tj, st[0], st[1], st[2]); }
    }
    add(s.t[q], x, y, z);
  }
  var tr = { lon: Float64Array.from(lon), Y: Float64Array.from(Ys), t: Float64Array.from(ts), sh: Uint8Array.from(sh), n: ts.length, chunks: [], shChunks: [] };
  for (var c0 = 0; c0 < tr.n - 1; c0 += CHUNK) { var c1 = Math.min(tr.n - 1, c0 + CHUNK); tr.chunks.push(rangePath(tr, c0, c1)); tr.shChunks.push(rangePathSh(tr, c0, c1)); }
  return tr;
}

export function lastBefore(arr, t) { var lo = 0, hi = arr.length - 1; if (t >= arr[hi]) return hi; if (t < arr[0]) return -1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arr[mid] <= t) lo = mid; else hi = mid; } return lo; }

export function drawMap() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2), CW = stage.clientWidth, CH = stage.clientHeight, a = mapArea(), W = a.W, H = a.H, g = mctx, k, osm = false, earth = V.plan.parent.shape === 'earth_default';
  if (mapCv.width !== Math.round(CW * dpr) || mapCv.height !== Math.round(CH * dpr)) { mapCv.width = Math.round(CW * dpr); mapCv.height = Math.round(CH * dpr); }
  if (!V.mapFitted) { mv.s = W / TAU; mv.cx = 0; mv.cy = 0; V.mapFitted = true; }
  clampMap();
  var s = mv.s, k0 = Math.floor((mv.cx - W / 2 / s + Math.PI) / TAU), k1 = Math.floor((mv.cx + W / 2 / s + Math.PI) / TAU);
  function world(kk) { g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((TAU * kk - mv.cx) * s + W / 2), dpr * (H / 2 - mv.cy * s)); }
  function sy(Y) { return (Y - mv.cy) * s + H / 2; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = THEME.stage; g.fillRect(0, 0, CW, CH);
  g.imageSmoothingEnabled = true;
  for (k = k0; k <= k1; k++) { world(k);
    if (earth) { g.fillStyle = OCEAN; g.fillRect(-Math.PI, -YMAX, TAU + 1 / s, 2 * YMAX); }
    else g.drawImage(V.mapBase, -Math.PI, -YMAX, TAU, 2 * YMAX); }
  if (earth) for (k = k0 - 1; k <= k1 + 1; k++) { world(k); g.fillStyle = LANDCOL; g.fill(landPath(), 'evenodd'); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // graticule
  var gs = [90, 60, 45, 30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01].filter(function (v) { return v * D2R * s >= 90; }).pop() || 30, dec = gs < 0.1 ? 2 : gs < 1 ? 1 : 0;
  var yTop = Math.max(0, sy(-YMAX)), yBot = Math.min(H, sy(YMAX)), lonA = (mv.cx - W / 2 / s) * R2D, lonB = (mv.cx + W / 2 / s) * R2D, lo, la, x, y;
  var latA = latOf(mv.cy + (H - mv.cy * 0 - H / 2) / s) * R2D, latB = latOf(mv.cy - H / 2 / s) * R2D;
  g.lineWidth = 1; g.font = MONO; g.textBaseline = 'middle'; g.shadowColor = osm ? '#fff' : '#000';
  var line = osm ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.16)', txt = osm ? '#1b1b1b' : '#f0f0f0', edge = THEME.dark ? '#000' : '#fff';
  for (lo = Math.ceil(lonA / gs) * gs; lo <= lonB; lo += gs) {
    x = (lo * D2R - mv.cx) * s + W / 2; var ln = ((lo + 180) % 360 + 360) % 360 - 180, l0 = Math.abs(ln) < gs / 2;
    g.strokeStyle = l0 ? (osm ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)') : line; g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, yBot); g.stroke();
    g.fillStyle = txt; g.textAlign = 'center'; g.shadowBlur = 3; g.fillText(l0 ? '0°' : Math.abs(ln).toFixed(dec) + '°' + (Math.abs(Math.abs(ln) - 180) < 1e-9 ? '' : ln < 0 ? 'W' : 'E'), x, yBot - 10); g.shadowBlur = 0;
  }
  for (la = Math.ceil(latA / gs) * gs; la <= latB; la += gs) {
    if (Math.abs(la) > 85) continue; y = sy(mercY(la * D2R)); var e0 = Math.abs(la) < gs / 2;
    g.strokeStyle = e0 ? (osm ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)') : line; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    if (!e0) { g.fillStyle = txt; g.textAlign = 'left'; g.shadowBlur = 3; g.fillText(Math.abs(la).toFixed(dec) + '°' + (la < 0 ? 'S' : 'N'), 6, y - 8); g.shadowBlur = 0; }
  }
  // Sun on the map (earth_default): night side shaded, subsolar point marked
  if (earth) {
    var sv = S.mvec(S.bodyMatrix(V.plan.poleRa, V.plan.poleDec, rotAt(V.simT)), S.sunDirection(V.plan.tt0 + V.simT)), sLat = Math.asin(Math.max(-1, Math.min(1, sv[2]))), sLon = Math.atan2(sv[1], sv[0]);
    var tl = Math.tan(Math.abs(sLat) < 1e-5 ? (sLat < 0 ? -1e-5 : 1e-5) : sLat), edgeY = sLat > 0 ? yBot : yTop, xp;
    g.beginPath(); g.moveTo(0, edgeY);
    for (xp = 0; xp <= W + 3; xp += 3) g.lineTo(xp, Math.max(yTop, Math.min(yBot, sy(mercY(Math.atan(-Math.cos(mv.cx + (xp - W / 2) / s - sLon) / tl))))));
    g.lineTo(W, edgeY); g.closePath(); g.fillStyle = 'rgba(0,0,0,0.42)'; g.fill();
    for (k = k0; k <= k1; k++) {
      var sxp = (sLon + TAU * k - mv.cx) * s + W / 2, syp = sy(mercY(sLat)); if (sxp < -30 || sxp > W + 30) continue;
      g.strokeStyle = '#ffd000'; g.lineWidth = 2; g.beginPath(); for (var ry = 0; ry < 8; ry++) { var ra = ry * Math.PI / 4; g.moveTo(sxp + 10 * Math.cos(ra), syp + 10 * Math.sin(ra)); g.lineTo(sxp + 15 * Math.cos(ra), syp + 15 * Math.sin(ra)); } g.stroke();
      g.fillStyle = '#ffd000'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.arc(sxp, syp, 7, 0, TAU); g.fill(); g.stroke();
      if ($('tLabels').checked) { g.fillStyle = '#ffd000'; g.textAlign = 'left'; g.shadowColor = '#000'; g.shadowBlur = 3; g.fillText('Sun', sxp + 19, syp); g.shadowBlur = 0; }
    }
    window.OrbitalSim && (window.OrbitalSim.subsolar = [sLat * R2D, sLon * R2D]);
  }
  // current sub-satellite points
  var Mb = S.bodyMatrix(V.plan.poleRa, V.plan.poleDec, rotAt(V.simT)), P = V.plan.parent, showL = $('tLabels').checked, showF = $('tPaths').checked;
  V.sats.forEach(function (o) {
    var gone = stateAt(o.s, V.simT) && V.simT >= o.impact;
    if (gone) o.cur = o.impLL ? [o.impLL[0], mercY(o.impLL[1]), true] : null;
    else { var rb = S.mvec(Mb, [st[0], st[1], st[2]]), gd = S.geodetic(rb[0], rb[1], rb[2], P.radius, P.flattening); o.cur = [gd.lon, mercY(gd.lat), false]; }
  });
  // traces: solid behind each satellite, fading out over the trail length; faint dashed preview the same length ahead; parts in Earth's shadow darkened
  function pieces(tr, iA, iB) {       // Path2D pieces covering points iA..iB, reusing prebuilt chunks where whole
    var out = [];
    for (var c = Math.floor(iA / CHUNK); c * CHUNK < iB; c++) {
      var j0 = Math.max(c * CHUNK, iA), j1 = Math.min((c + 1) * CHUNK, iB); if (j1 <= j0) continue;
      var whole = j0 === c * CHUNK && j1 === Math.min((c + 1) * CHUNK, tr.n - 1) && !!tr.chunks[c];
      out.push({ p: whole ? tr.chunks[c] : rangePath(tr, j0, j1), sp: whole ? tr.shChunks[c] : rangePathSh(tr, j0, j1), t: tr.t[(j0 + j1) >> 1] });
    }
    return out;
  }
  var many = V.sats.length > 20;
  V.sats.forEach(function (o, i) {
    var tr = o.trace, TR = trailOf(o), idx = lastBefore(tr.t, V.simT), past = [], fut = [], kk, sel = i === V.selected, live = o.cur && !o.cur[2];
    if (idx >= 0) {
      past = pieces(tr, Math.max(0, lastBefore(tr.t, V.simT - TR)), idx);
      if (live) { var tail = new Path2D(); tail.moveTo(tr.lon[idx], tr.Y[idx]); seg(tail, tr.lon[idx], tr.Y[idx], o.cur[0], o.cur[1]); past.push({ p: tail, sp: tr.sh[idx] ? tail : null, t: V.simT }); }
      if (showF && live && idx < tr.n - 1) {
        var iNew = Math.max(idx + 1, lastBefore(tr.t, V.simT + TR)), head = new Path2D();
        head.moveTo(o.cur[0], o.cur[1]); seg(head, o.cur[0], o.cur[1], tr.lon[idx + 1], tr.Y[idx + 1]);
        fut = [{ p: head }].concat(pieces(tr, idx + 1, iNew));
      }
    }
    past.forEach(function (q) { q.a = TR === Infinity ? 1 : Math.max(0, 1 - (V.simT - q.t) / TR); });
    past = past.filter(function (q) { return q.a > 0.02; });
    for (kk = k0 - 1; kk <= k1 + 1; kk++) {
      world(kk); g.lineJoin = 'round';
      if (fut.length) { g.setLineDash([5 / s, 5 / s]); g.strokeStyle = colour(i); g.globalAlpha = sel ? 0.7 : 0.35; g.lineWidth = 1.2 / s; fut.forEach(function (q) { g.stroke(q.p); }); g.setLineDash([]); }
      if (sel || !many) { g.strokeStyle = edge; g.lineWidth = (sel ? 4.5 : 3.4) / s; past.forEach(function (q) { g.globalAlpha = 0.6 * q.a; g.stroke(q.p); }); }
      g.strokeStyle = colour(i); g.lineWidth = (sel ? 2.4 : 1.6) / s; past.forEach(function (q) { g.globalAlpha = (sel ? 1 : 0.8) * q.a; g.stroke(q.p); });
      g.strokeStyle = '#000'; past.forEach(function (q) { if (q.sp) { g.globalAlpha = 0.62 * q.a; g.stroke(q.sp); } });
    }
    g.globalAlpha = 1;
  });
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  V.sats.forEach(function (o, i) {
    o.mapPts = []; if (!o.cur) return; var yy = sy(o.cur[1]), gone = o.cur[2];
    for (var kk = k0; kk <= k1; kk++) {
      var xx = (o.cur[0] + TAU * kk - mv.cx) * s + W / 2; if (xx < -40 || xx > W + 40) continue; o.mapPts.push([xx, yy]);
      g.shadowColor = osm ? '#fff' : '#000';
      if (gone) { g.strokeStyle = THEME.bad; g.lineWidth = 2.4; g.beginPath(); g.moveTo(xx - 5, yy - 5); g.lineTo(xx + 5, yy + 5); g.moveTo(xx + 5, yy - 5); g.lineTo(xx - 5, yy + 5); g.stroke(); }
      else { g.fillStyle = colour(i); g.strokeStyle = edge; g.lineWidth = 1.6; g.beginPath(); g.arc(xx, yy, i === V.selected ? 6 : 4.5, 0, TAU); g.fill(); g.stroke(); }
      if (showL) { g.fillStyle = osm ? '#000' : gone ? THEME.bad : colour(i); g.textAlign = 'left'; g.shadowBlur = 4; g.fillText(o.s.name, xx + 9, yy); g.shadowBlur = 0; }
    }
  });
}

export var mp = {}, mpinch = 0, mdown = null;

export function init() {
  // ---------------------------------------------------------------- Mercator map: ground trace in the body-fixed frame
  mapCv = $('map');
  mctx = mapCv.getContext('2d');
  LATMAX = 2 * Math.atan(Math.exp(Math.PI)) - Math.PI / 2;
    // Web Mercator, +-85.0511 deg
  V.mapBase = null;
  V.mapFitted = false;
  try { trailMode = localStorage.getItem('orbitalsim.trail') || '24h'; } catch (e) {}

  if (!/^(orbit|6h|24h|all)$/.test(trailMode)) trailMode = '24h';
  $('trail').value = trailMode;

  $('trail').addEventListener('change', function () { trailMode = this.value; try { localStorage.setItem('orbitalsim.trail', trailMode); } catch (e) {} });

  mapCv.addEventListener('pointerdown', function (e) { mapCv.setPointerCapture(e.pointerId); mp[e.pointerId] = [e.clientX, e.clientY]; mpinch = 0; mdown = Object.keys(mp).length === 1 ? [e.clientX, e.clientY] : null; });

  mapCv.addEventListener('pointermove', function (e) {
    var p = mp[e.pointerId]; if (!p) return; var ids = Object.keys(mp);
    if (ids.length === 1) { mv.cx -= (e.clientX - p[0]) / mv.s; mv.cy -= (e.clientY - p[1]) / mv.s; clampMap(); }
    mp[e.pointerId] = [e.clientX, e.clientY];
    if (ids.length === 2) { var a = mp[ids[0]], b = mp[ids[1]], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (mpinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dd / mpinch); mpinch = dd; }
  });

  mapCv.addEventListener('pointerup', function (e) {
    if (mdown && Math.hypot(e.clientX - mdown[0], e.clientY - mdown[1]) < 5) {
      var r = mapCv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, best = -1, bd = 14;
      V.sats.forEach(function (o, i) { (o.mapPts || []).forEach(function (q) { var d = Math.hypot(q[0] - px, q[1] - py); if (d < bd) { bd = d; best = i; } }); });
      if (best >= 0) select(best);
    }
    delete mp[e.pointerId]; mpinch = 0; mdown = null;
  });

  mapCv.addEventListener('pointercancel', function (e) { delete mp[e.pointerId]; mpinch = 0; mdown = null; });

  mapCv.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
}
