// Run report table and metadata under the setup panel.
import { $, el } from './dom.js';
import { colour, fields, fmtLen } from './util.js';

export function renderReport(plan, note) {
  var rows = 0, tb = $('report').tBodies[0], hr = $('report').tHead.rows[0], recs = plan.sats.map(function (s, i) { return fields(plan.meta.reports[i] || ''); });
  var has = function (k) { return recs.some(function (f) { return f[k] !== undefined; }); }, cols = ['Satellite', 'Rows', 'Energy drift'];
  if (has('jacobi_rel_drift')) cols.push('Jacobi drift'); if (has('period_s')) cols.push('Period', 'Perigee / apogee'); if (has('ltan_start')) cols.push('LTAN, drift'); if (has('burns')) cols.push('Burns'); cols.push('Status');
  hr.textContent = ''; cols.forEach(function (c) { hr.appendChild(el('th', c)); }); tb.textContent = '';
  var imp = {}; plan.meta.impacts.forEach(function (s) { var f = fields(s); imp[f.sat] = f; });
  plan.sats.forEach(function (s, i) {
    rows += s.t.length;
    var f = recs[i], tr = el('tr'), name = el('td'), dot = el('span', '', 'dot'), cell = function (txt, cls) { tr.appendChild(el('td', txt, cls || 'num')); }; dot.style.background = colour(i);
    name.appendChild(dot); name.appendChild(document.createTextNode(s.name)); tr.appendChild(name); cell(String(s.t.length));
    ['energy_rel_drift', 'jacobi_rel_drift'].forEach(function (k) { if (cols.indexOf(k[0] === 'e' ? 'Energy drift' : 'Jacobi drift') < 0) return; var v = f[k]; cell(v === undefined ? '' : (+v).toExponential(1), 'num ' + (v !== undefined && +v < 1e-8 ? 'ok' : 'warn')); });
    if (has('period_s')) { cell(f.period_s ? (f.period_s / 60).toFixed(1) + ' min' : 'open orbit'); cell(f.period_s ? fmtLen(+f.perigee_alt_m) + ' / ' + fmtLen(+f.apogee_alt_m) : ''); }
    if (has('ltan_start')) cell(f.ltan_start ? f.ltan_start.slice(0, 5) + ', ' + ((+f.ltan_drift_min_per_day >= 0 ? '+' : '') + (+f.ltan_drift_min_per_day).toFixed(2)) + ' min/day' : '');
    if (has('burns')) cell(f.burns ? f.burns + ', ' + (+f.dv_total_m_s).toFixed(2) + ' m/s' : '');
    var im = imp[s.name];
    cell(im ? (im.kind === 'reentry' ? 'Re-entry ' : 'Impact ') + im.epoch_utc.slice(0, 10) + ' ' + im.epoch_utc.slice(11, 19) + ' UTC, lat ' + (+im.lat_deg).toFixed(1) + ' lon ' + (+im.lon_deg).toFixed(1) : 'Completed', im ? 'warn' : ' ');
    tb.appendChild(tr);
  });
  $('report').hidden = false;
  $('summary').textContent = note + rows + ' rows, ' + plan.sats.length + ' satellite' + (plan.sats.length > 1 ? 's' : '') + '. Drift under 1e-8 is shown in green.' +
    (plan.drag || has('burns') ? ' Energy drift here is what is left after removing drag work and burns.' : '');
  var meta = $('meta'); meta.textContent = '';
  [['Inertial frame', plan.meta.inertial_frame], ['Body-fixed frame', plan.meta.body_fixed_frame], ['Force model', plan.meta.force_model || 'gravity']].concat(plan.meta.dataFiles.map(function (d) { var f = fields(d); return ['Data: ' + f.name, 'version ' + f.version + ', crc32 ' + f.crc32]; }))
    .forEach(function (p) { meta.appendChild(el('dt', p[0])); meta.appendChild(el('dd', p[1])); });
}
