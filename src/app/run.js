// Runs a simulation, shows errors and warnings, loads and saves plan.csv and config files.
import { S } from './boot.js';
import { $, download, el, readFile } from './dom.js';
import { renderForm } from './form.js';
import { renderReport } from './report.js';
import { viewer } from './start.js';

export var lastCsv = null, running = false;

export function showErrors(list) { var ul = $('errors'); ul.textContent = ''; (list || []).forEach(function (m) { ul.appendChild(el('li', m)); }); ul.hidden = !list || !list.length; }

export function showWarnings(list) { var ul = $('warnings'); ul.textContent = ''; (list || []).forEach(function (m) { ul.appendChild(el('li', m)); }); ul.hidden = !list || !list.length; }

export function fail(e) { showErrors(e && e.errors ? e.errors : [String(e && e.message || e)]); }

export function runSim() {
  if (running) return;
  showErrors(null);
  showWarnings(null);
  var cfg, gen, t0 = performance.now();
  try { cfg = JSON.parse($('config').value); } catch (e) { return showErrors(['Config is not valid JSON: ' + e.message]); }
  try {
    var normCheck = S.normalizeConfig(cfg);
    if (normCheck.warnings && normCheck.warnings.length) showWarnings(normCheck.warnings);
  } catch (e) { return fail(e); }
  gen = S.simulate(cfg); running = true; $('run').disabled = true; $('progress').hidden = false; $('bar').style.width = '0';
  (function slice() {
    var r, s0 = performance.now();
    try { do { r = gen.next(); } while (!r.done && performance.now() - s0 < 40); }
    catch (e) { running = false; $('run').disabled = false; $('progress').hidden = true; return fail(e); }
    if (!r.done) { $('bar').style.width = (100 * r.value).toFixed(1) + '%'; return setTimeout(slice, 0); }
    running = false; $('run').disabled = false; $('progress').hidden = true;
    loadPlan(r.value.csv, 'Ran ' + r.value.steps + ' steps of ' + r.value.dt + ' s in ' + ((performance.now() - t0) / 1000).toFixed(2) + ' s. ');
  })();
}

export function loadPlan(csv, note) {
  var plan;
  try { plan = S.parsePlanCsv(csv); } catch (e) { return fail(e); }
  lastCsv = csv; $('saveCsv').disabled = false;
  renderReport(plan, note || 'Loaded plan.csv. ');
  viewer.setPlan(plan);
}

export function init() {
  $('run').addEventListener('click', runSim);

  $('saveCfg').addEventListener('click', function () { download('config.json', $('config').value, 'application/json'); });

  $('saveCsv').addEventListener('click', function () { if (lastCsv) download('plan.csv', lastCsv, 'text/csv'); });

  $('loadCfg').addEventListener('click', function () { $('fileCfg').click(); });

  $('loadCsv').addEventListener('click', function () { $('fileCsv').click(); });

  $('fileCfg').addEventListener('change', function () { readFile(this, function (t) { $('config').value = t; showErrors(null); renderForm(); }); });

  $('fileCsv').addEventListener('change', function () { readFile(this, function (t) { showErrors(null); loadPlan(t); if (lastCsv === t) $('config').value = JSON.stringify(S.parsePlanCsv(t).meta.config, null, 2); renderForm(); }); });
}
