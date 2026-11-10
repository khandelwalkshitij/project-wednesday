// LTAN, altitude, beta angle, eclipse and range charts, with CSV export.
import { V } from './state.js';
import { S } from '../app/boot.js';
import { $ } from '../app/dom.js';
import { TAU, lastBefore } from './map.js';
import { select } from './playback.js';
import { stage } from './scene.js';

export var ltCv, lctx, ltHits = [], CHART_FONT = '12px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export function chartColour(i) { return 'hsl(' + ((i * 137.508 + 38) % 360).toFixed(0) + ',90%,36%)'; }

export function pick(steps, raw) { for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i]; return steps[steps.length - 1]; }

export function hhmm(h) { var m = Math.round((((h % 24) + 24) % 24) * 60) % 1440, q = function (n) { return (n < 10 ? '0' : '') + n; }; return q(Math.floor(m / 60)) + ':' + q(m % 60); }

export function bevel(g, x, y, w, h, sunk) {
  g.fillStyle = sunk ? '#808080' : '#fff'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = sunk ? '#fff' : '#0a0a0a'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = sunk ? '#0a0a0a' : '#dfdfdf'; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle = sunk ? '#dfdfdf' : '#808080'; g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + w - 2, y + 1, 1, h - 2);
}

export function interp(ta, ha, t) {
  var n = ta.length; if (t <= ta[0]) return ha[0]; if (t >= ta[n - 1]) return ha[n - 1];
  var lo = 0, hi = n - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ta[mid] <= t) lo = mid; else hi = mid; }
  return ha[lo] + (ha[hi] - ha[lo]) * (t - ta[lo]) / (ta[hi] - ta[lo]);
}

export function sgn(d) { return d >= 0 ? '+' : ''; }

export function nice(raw) { var p10 = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 5, 10].map(function (m) { return m * p10; }).filter(function (v) { return v >= raw; })[0]; }

export function dec(st) { return st < 1 ? Math.min(3, Math.ceil(-Math.log10(st) - 1e-9)) : 0; }

export function isEarthPlan() { return V.plan.parent.shape === 'earth_default'; }

export function lenUnit() { return V.plan.parent.radius < 1e5 ? 1 : 1000; }

export function utc(t) { return S.formatUtc(V.plan.tt0 + t); }

export function satSeries(key) { return V.sats.map(function (o, i) { return { name: o.s.name, d: o[key], i: i }; }).filter(function (q) { return q.d && q.d.t.length > 0; }); }

export var chartCache = { key: '' }, rangeCache = { key: '' };

// distance from the selected satellite to every other one, with line of sight (parent not in the way). SIM_042, SIM_048
export function rangeSeries() {
  var key = V.planSeq + '|' + V.selected; if (rangeCache.key === key) return rangeCache.ser;
  var a = V.sats[V.selected].s, uf = lenUnit(), R = V.plan.parent.radius, ser = [];
  V.sats.forEach(function (o, j) {
    if (j === V.selected) return;
    var b = o.s, n = Math.min(a.t.length, b.t.length), t = new Float64Array(n), h = new Float64Array(n), mask = new Uint8Array(n), mn = Infinity, tm = 0;
    for (var q = 0; q < n; q++) {
      var ax = a.y[6 * q], ay = a.y[6 * q + 1], az = a.y[6 * q + 2], dx = b.y[6 * q] - ax, dy = b.y[6 * q + 1] - ay, dz = b.y[6 * q + 2] - az, d2 = dx * dx + dy * dy + dz * dz;
      var u = d2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / d2)) : 0;
      t[q] = a.t[q]; h[q] = Math.sqrt(d2) / uf; mask[q] = Math.hypot(ax + u * dx, ay + u * dy, az + u * dz) > R ? 1 : 0; if (h[q] < mn) { mn = h[q]; tm = t[q]; }
    }
    if (n) ser.push({ name: o.s.name, i: j, d: { t: t, h: h, mask: mask, min: mn, tmin: tm, uf: uf, fitOk: false } });
  });
  rangeCache = { key: key, ser: ser }; return ser;
}

export function csvJoin(head, fill) { var L = [head]; fill(L); return L.join('\n') + '\n'; }

export var SPECS;

export function drawChart(sp, id) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2), CW = stage.clientWidth, CH = stage.clientHeight, W = CW, H = CH - ($('transport').offsetHeight || 0), g = lctx, k;
  if (ltCv.width !== Math.round(CW * dpr) || ltCv.height !== Math.round(CH * dpr)) { ltCv.width = Math.round(CW * dpr); ltCv.height = Math.round(CH * dpr); }
  ltHits = [];
  var why = sp.need(), ser = why ? [] : sp.series();
  if (why || !ser.length) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, CW, CH); g.font = CHART_FONT; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.textAlign = 'center'; g.fillText(why || sp.empty, W / 2, H / 2); return; }
  var key = [id, V.selected, CW, CH, H, dpr, V.planSeq].join('|'), lay;
  if (chartCache.key !== key) {        // static layer: axes, grid and curves. Redrawn only when the data, selection or size changes.
    var narrow = W < 640, legW = narrow ? 0 : Math.min(280, Math.max(215, W * 0.27)), L = 72, T = 70, R = W - legW - (narrow ? 12 : 24), B = H - (narrow ? 64 : 46);
    var tEnd = V.plan.times[V.plan.times.length - 1], days = tEnd > 2 * 86400, xu = days ? 86400 : 3600, y0 = Infinity, y1 = -Infinity;
    ser.forEach(function (q) { [q.d.h, q.d.raw].forEach(function (arr) { if (arr) for (k = 0; k < arr.length; k++) { y0 = Math.min(y0, arr[k]); y1 = Math.max(y1, arr[k]); } }); });
    if (sp.zero) y0 = Math.min(y0, 0);
    var span = Math.max(y1 - y0, sp.minSpan), lo0 = y0; y0 = (y0 + y1) / 2 - span * 0.56; y1 = y0 + span * 1.12; if (sp.zero && lo0 === 0) { y0 = 0; y1 = span * 1.1; }
    var xs = function (t) { return L + (R - L) * t / tEnd; }, ys = function (h) { return B - (B - T) * (h - y0) / (y1 - y0); };
    var oc = chartCache.cv || document.createElement('canvas'); oc.width = ltCv.width; oc.height = ltCv.height;
    var c = oc.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, CW, CH); c.font = CHART_FONT; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.fillRect(L, T, R - L, B - T); bevel(c, L - 2, T - 2, R - L + 4, B - T + 4, true);
    var yst = sp.step((y1 - y0) / Math.max(3, (B - T) / 45)), xst = pick(days ? [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100] : [0.25, 0.5, 1, 2, 3, 6, 12, 24], tEnd / xu / Math.max(2, (R - L) / 90)), v;
    c.lineWidth = 1; c.setLineDash([1, 2]); c.strokeStyle = '#a0a0a0'; c.fillStyle = '#000'; c.textAlign = 'right';
    for (v = Math.ceil(y0 / yst - 1e-9) * yst; v <= y1 + 1e-9; v += yst) { var yy = Math.round(ys(v)) + 0.5; c.beginPath(); c.moveTo(L, yy); c.lineTo(R, yy); c.stroke(); c.fillText(sp.tick(v, yst), L - 6, yy); }
    c.textAlign = 'center';
    for (v = 0; v <= tEnd / xu + 1e-9; v += xst) { var xx = Math.round(xs(v * xu)) + 0.5; c.beginPath(); c.moveTo(xx, T); c.lineTo(xx, B); c.stroke(); c.fillText(String(+v.toFixed(2)), xx, B + 12); }
    c.setLineDash([]);
    c.fillText('Elapsed time (' + (days ? 'days' : 'hours') + ')', (L + R) / 2, B + 30);
    if (sp.note && !narrow) { c.textAlign = 'right'; c.fillText(sp.note, R, T - 12); }
    c.save(); c.translate(14, (T + B) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(sp.ylab(), 0, 0); c.restore();
    var line = function (ta, ha, width, alpha, col, mask) {
      var n = ta.length, stride = mask ? 1 : Math.max(1, Math.floor(n / (2 * (R - L)))), j;
      c.globalAlpha = alpha; c.lineWidth = width;
      if (!mask) { c.strokeStyle = col; c.beginPath(); for (j = 0; j < n; j += stride) { if (j) c.lineTo(xs(ta[j]), ys(ha[j])); else c.moveTo(xs(ta[j]), ys(ha[j])); } c.lineTo(xs(ta[n - 1]), ys(ha[n - 1])); c.stroke(); }
      else for (var pass = 0; pass < 2; pass++) { c.strokeStyle = pass ? col : '#a8a8a8'; c.beginPath(); for (j = 1; j < n; j++) if ((mask[j] && mask[j - 1] ? 1 : 0) === pass) { c.moveTo(xs(ta[j - 1]), ys(ha[j - 1])); c.lineTo(xs(ta[j]), ys(ha[j])); } c.stroke(); }
      if (sp.points) { c.fillStyle = col; for (j = 0; j < n; j++) c.fillRect(xs(ta[j]) - 2.5, ys(ha[j]) - 2.5, 5, 5); }
      c.globalAlpha = 1;
    };
    c.save(); c.beginPath(); c.rect(L, T, R - L, B - T); c.clip();
    ser.slice().sort(function (a, b) { return (a.i === V.selected) - (b.i === V.selected); }).forEach(function (q) {
      var sel = q.i === V.selected, d = q.d;
      if (d.raw && d.avg) line(d.rt, d.raw, 1, sel ? 0.45 : 0.25, chartColour(q.i));
      line(d.t, d.h, sel ? 2.4 : 1.3, 1, chartColour(q.i), d.mask);
      if (sel && d.fitOk !== false && d.t.length > 1) { c.setLineDash([6, 4]); c.lineWidth = 1; c.strokeStyle = '#000'; c.beginPath(); c.moveTo(xs(0), ys(d.icpt)); c.lineTo(xs(tEnd), ys(d.icpt + d.slope * tEnd)); c.stroke(); c.setLineDash([]); }
    });
    var bl = V.plan.burns[V.sats[V.selected].s.name] || [];      // burn times of the selected satellite
    c.strokeStyle = '#800000'; c.fillStyle = '#800000'; c.setLineDash([3, 3]); c.textAlign = 'left';
    bl.forEach(function (tb, n) { var bx = Math.round(xs(tb)) + 0.5; c.beginPath(); c.moveTo(bx, T); c.lineTo(bx, B); c.stroke(); if (n < 12) c.fillText('burn', bx + 3, T + 9 + (n % 2) * 13); });
    c.setLineDash([]); c.restore();
    chartCache = { key: key, cv: oc, lay: { narrow: narrow, L: L, T: T, R: R, B: B, tEnd: tEnd, y0: y0, y1: y1 } };
  }
  lay = chartCache.lay; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(chartCache.cv, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = CHART_FONT; g.textBaseline = 'middle';
  var L2 = lay.L, T2 = lay.T, R2 = lay.R, B2 = lay.B, xs2 = function (t) { return L2 + (R2 - L2) * t / lay.tEnd; }, ys2 = function (h) { return B2 - (B2 - T2) * (h - lay.y0) / (lay.y1 - lay.y0); };
  var cx = Math.round(xs2(Math.min(V.simT, lay.tEnd))) + 0.5; g.strokeStyle = '#000080'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, T2); g.lineTo(cx, B2); g.stroke();
  if (!sp.points) ser.forEach(function (q) { var d = q.d, ta = d.raw ? d.rt : d.t, ha = d.raw || d.h; if (V.simT > ta[ta.length - 1] + 1e-6) return; var py = ys2(interp(ta, ha, V.simT)); if (py < T2 || py > B2) return;
    g.fillStyle = chartColour(q.i); g.strokeStyle = '#000'; g.beginPath(); g.arc(cx, py, q.i === V.selected ? 4.5 : 3.5, 0, TAU); g.fill(); g.stroke(); });
  // legend: name, value now, summary. Click a row to select that satellite.
  var rowH = 18, tNow = function (q) { var ta = q.d.raw ? q.d.rt : q.d.t; return Math.min(V.simT, ta[ta.length - 1]); };
  if (lay.narrow) {
    var qs = ser.filter(function (q) { return q.i === V.selected; })[0] || ser[0];
    g.fillStyle = chartColour(qs.i); g.fillRect(L2, B2 + 44, 10, 10); g.fillStyle = '#000'; g.textAlign = 'left';
    g.fillText(qs.name + '  ' + sp.now(qs.d, tNow(qs)) + '  ' + sp.drift(qs.d), L2 + 16, B2 + 49);
    return;
  }
  var lx = R2 + 14, lw = W - lx - 8, maxRows = Math.max(1, Math.floor((B2 - T2 - 26) / rowH)), shown = ser.slice(0, maxRows), lh = 24 + shown.length * rowH + (ser.length > maxRows ? rowH : 0) + 6;
  g.fillStyle = '#c0c0c0'; g.fillRect(lx, T2 - 2, lw, lh); bevel(g, lx, T2 - 2, lw, lh, false);
  var grad = g.createLinearGradient(lx + 3, 0, lx + lw - 3, 0); grad.addColorStop(0, '#000080'); grad.addColorStop(1, '#1084d0');
  g.fillStyle = grad; g.fillRect(lx + 3, T2 + 1, lw - 6, 18); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold ' + CHART_FONT;
  var ttl = sp.title(); while (g.measureText(ttl).width > lw - 16 && ttl.length > 6) ttl = ttl.slice(0, -2) + '…'; g.fillText(ttl, lx + 8, T2 + 10); g.font = CHART_FONT;
  shown.forEach(function (q, j) {
    var ry = T2 + 24 + j * rowH, sel = q.i === V.selected, right = sp.now(q.d, tNow(q)) + '  ' + sp.drift(q.d);
    if (sel) { g.fillStyle = '#000080'; g.fillRect(lx + 4, ry, lw - 8, rowH); }
    g.fillStyle = chartColour(q.i); g.fillRect(lx + 9, ry + 4, 10, 10); g.strokeStyle = sel ? '#fff' : '#000'; g.strokeRect(lx + 9.5, ry + 4.5, 9, 9);
    g.fillStyle = sel ? '#fff' : '#000'; g.textAlign = 'left';
    var name = q.name, room = lw - 40 - g.measureText(right).width; while (g.measureText(name).width > room && name.length > 3) name = name.slice(0, -2) + '…';
    g.fillText(name, lx + 25, ry + rowH / 2); g.textAlign = 'right'; g.fillText(right, lx + lw - 10, ry + rowH / 2);
    ltHits.push({ x: lx + 4, y: ry, w: lw - 8, h: rowH, i: q.i });
  });
  if (ser.length > maxRows) { g.fillStyle = '#000'; g.textAlign = 'left'; g.fillText('and ' + (ser.length - maxRows) + ' more', lx + 25, T2 + 24 + shown.length * rowH + rowH / 2); }
}

export function init() {
  // ---------------------------------------------------------------- LTAN drift chart (SIM_083)
  ltCv = $('ltan');
  lctx = ltCv.getContext('2d');
  V.dut1 = 0;

  SPECS = {
    ltan: { title: function () { return 'LTAN now, drift'; }, label: 'LTAN: mean local solar time at the ascending node', minSpan: 10 / 60, ylab: function () { return 'LTAN (hh:mm, mean local solar time)'; },
      need: function () { return isEarthPlan() ? null : 'LTAN is defined for earth_default only.'; }, empty: 'No satellite has an ascending node (equatorial orbits only).', series: function () { return satSeries('lt'); },
      step: function (raw) { return pick([1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720], raw * 60) / 60; }, tick: function (v) { return hhmm(v); },
      now: function (d, t) { return hhmm(interp(d.t, d.h, t)); }, drift: function (d) { var x = d.slope * 60 * 86400; return sgn(x) + x.toFixed(2) + ' min/day'; },
      csv: function () { return csvJoin('sat_name,t_s,epoch_utc,ltan_hours,ltan_hms', function (L) { satSeries('lt').forEach(function (q) { for (var k = 0; k < q.d.t.length; k++) L.push(q.name + ',' + q.d.t[k] + ',' + utc(q.d.t[k]) + ',' + ((q.d.h[k] % 24 + 24) % 24).toFixed(6) + ',' + S.fmtHms(q.d.h[k])); }); }); } },
    alt: { title: function () { return 'Altitude now, drift'; }, label: null, minSpan: 0.5, need: function () { return null; }, empty: 'No altitude data.', series: function () { return satSeries('alt'); }, note: 'thin: instantaneous    thick: one-orbit average',
      ylab: function () { return (isEarthPlan() ? 'Altitude above WGS84 ellipsoid (' : 'Altitude above surface (') + (lenUnit() === 1 ? 'm' : 'km') + ')'; },
      step: nice, tick: function (v, st) { return v.toFixed(dec(st)); },
      now: function (d, t) { return interp(d.rt, d.raw, t).toFixed(1) + (d.uf === 1 ? ' m' : ' km'); },
      drift: function (d) { if (!d.fitOk) return 'run too short'; var x = d.slope * 86400 * d.uf; return sgn(x) + (Math.abs(x) >= 10000 ? (x / 1000).toFixed(2) + ' km/day' : x.toFixed(1) + ' m/day'); },
      csv: function () { return csvJoin('sat_name,series,t_s,epoch_utc,altitude_m', function (L) { satSeries('alt').forEach(function (q) { var d = q.d, k;
        for (k = 0; k < d.rt.length; k++) L.push(q.name + ',instantaneous,' + d.rt[k] + ',' + utc(d.rt[k]) + ',' + (d.raw[k] * d.uf).toFixed(3));
        if (d.avg) for (k = 0; k < d.t.length; k++) L.push(q.name + ',orbit_average,' + d.t[k] + ',' + utc(d.t[k]) + ',' + (d.h[k] * d.uf).toFixed(3)); }); }); } },
    beta: { title: function () { return 'Beta now, drift'; }, label: 'Beta angle: Sun direction to orbit plane', minSpan: 2, ylab: function () { return 'Beta angle (deg)'; },
      need: function () { return isEarthPlan() ? null : 'Beta angle needs the Sun, which is modelled for earth_default only.'; }, empty: 'No data.', series: function () { return satSeries('beta'); },
      step: nice, tick: function (v, st) { return v.toFixed(dec(st)); }, now: function (d, t) { return interp(d.t, d.h, t).toFixed(2) + '°'; },
      drift: function (d) { var x = d.slope * 86400; return sgn(x) + x.toFixed(3) + ' °/day'; },
      csv: function () { return csvJoin('sat_name,t_s,epoch_utc,beta_deg', function (L) { satSeries('beta').forEach(function (q) { for (var k = 0; k < q.d.t.length; k++) L.push(q.name + ',' + q.d.t[k] + ',' + utc(q.d.t[k]) + ',' + q.d.h[k].toFixed(5)); }); }); } },
    ecl: { title: function () { return 'Now, longest eclipse'; }, label: 'Eclipse duration per orbit (cylindrical Earth shadow)', minSpan: 5, zero: true, points: true, ylab: function () { return 'Eclipse duration (min)'; },
      need: function () { return isEarthPlan() ? null : 'Eclipses need the Sun, which is modelled for earth_default only.'; }, empty: 'No complete eclipse in this run.', series: function () { return satSeries('ecl'); },
      step: nice, tick: function (v, st) { return v.toFixed(dec(st)); },
      now: function (d, t) { return d.ev.some(function (e) { return t >= e.t0 && t <= e.t1; }) ? 'in eclipse' : 'sunlit'; }, drift: function (d) { return d.max.toFixed(1) + ' min'; },
      csv: function () { return csvJoin('sat_name,entry_utc,exit_utc,entry_t_s,exit_t_s,duration_s,complete', function (L) { V.sats.forEach(function (o) { (o.eclEv || []).forEach(function (e) {
        L.push(o.s.name + ',' + utc(e.t0) + ',' + utc(e.t1) + ',' + e.t0.toFixed(3) + ',' + e.t1.toFixed(3) + ',' + (e.t1 - e.t0).toFixed(3) + ',' + (e.open ? 'no' : 'yes')); }); }); }); } },
    range: { title: function () { return 'Range from ' + V.sats[V.selected].s.name; }, label: null, minSpan: 1, zero: true, note: 'grey: parent blocks the line of sight',
      ylab: function () { return 'Range to ' + V.sats[V.selected].s.name + ' (' + (lenUnit() === 1 ? 'm' : 'km') + ')'; },
      need: function () { return V.sats.length < 2 ? 'Range needs at least two satellites.' : null; }, empty: 'No data.', series: rangeSeries,
      step: nice, tick: function (v, st) { return v.toFixed(dec(st)); },
      now: function (d, t) { var k = Math.min(d.t.length - 1, Math.max(0, lastBefore(d.t, t))); return interp(d.t, d.h, t).toFixed(0) + (d.uf === 1 ? ' m' : ' km') + (d.mask[k] ? '' : ' blocked') + ','; },
      drift: function (d) { return 'min ' + d.min.toFixed(0) + (d.uf === 1 ? ' m' : ' km'); },
      csv: function () { return csvJoin('from,to,t_s,epoch_utc,range_m,line_of_sight', function (L) { rangeSeries().forEach(function (q) { for (var k = 0; k < q.d.t.length; k++) L.push(V.sats[V.selected].s.name + ',' + q.name + ',' + q.d.t[k] + ',' + utc(q.d.t[k]) + ',' + (q.d.h[k] * q.d.uf).toFixed(3) + ',' + (q.d.mask[k] ? 'yes' : 'no')); }); }); } }
  };

  ltCv.addEventListener('click', function (e) {
    var r = ltCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    ltHits.forEach(function (h) { if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) select(h.i); });
  });
}
