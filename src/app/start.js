// Creates the viewer, exposes window.OrbitalSim and runs the first simulation.
import { S } from './boot.js';
import { $ } from './dom.js';
import { lastCsv, runSim, showErrors } from './run.js';
import { makeViewer } from '../viewer/index.js';

export var viewer;

export function start() { $('newCfg').click(); runSim(); }

export function init() {
  viewer = makeViewer();

  window.OrbitalSim = { core: S, viewer: viewer, run: runSim, csv: function () { return lastCsv; } };

  if (window.ORBITAL_SIM_LEAP_SECONDS_URL) {
    fetch(window.ORBITAL_SIM_LEAP_SECONDS_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { S.setLeapSeconds(JSON.parse(t), t); }).catch(function (e) { showErrors(['Leap-second file could not be loaded (' + e.message + '). Using the built-in table.']); }).then(start);
  } else start();
}
