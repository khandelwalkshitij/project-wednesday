// Trial menu and Reset button. The configs themselves are in presets-data.js.
import { PRESETS, resetConfig } from './presets-data.js';
import { $, el } from './dom.js';
import { renderForm } from './form.js';
import { runSim, showErrors } from './run.js';

export var defaultOpt;

export function setPreset(i) {
  $('config').value = JSON.stringify(PRESETS[i][1](), null, 2);
  renderForm();
}

export function init() {
  defaultOpt = el('option', 'New Trial');
  defaultOpt.value = '';
  $('preset').appendChild(defaultOpt);
  PRESETS.forEach(function (p, i) { var o = el('option', p[0]); o.value = i; $('preset').appendChild(o); });

  $('preset').addEventListener('change', function () {
    if (this.value !== '') {
      setPreset(+this.value);
      runSim();
    }
  });

  $('newCfg').addEventListener('click', function () {
    $('preset').value = '';
    $('config').value = JSON.stringify(resetConfig(), null, 2);
    showErrors(null);
    renderForm();
  });
}
