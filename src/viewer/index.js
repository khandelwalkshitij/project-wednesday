// Viewer entry: builds the viewer from its parts in a fixed order.
import { $, el } from '../app/dom.js';
import { init as cameraInit } from './camera.js';
import { init as chartsInit } from './charts.js';
import { init as docsInit } from './docs.js';
import { init as loopInit } from './loop.js';
import { init as mapInit } from './map.js';
import { init as playbackInit } from './playback.js';
import { api, init as sceneInit } from './scene.js';

export var SPEEDS = [1, 10, 60, 300, 1000, 3000, 10000];

// Builds the viewer: runs each part in the order the original single function did.
export function makeViewer() {
  sceneInit();
  docsInit();
  mapInit();
  cameraInit();
  playbackInit();
  chartsInit();
  loopInit();
  return api;
}

export function init() {
  SPEEDS.forEach(function (s) { var o = el('option', s + '×'); o.value = s; $('speed').appendChild(o); });
}
