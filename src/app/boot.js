// Page start-up: loads the leap-second table from index.html and shows the version.
import { $ } from './dom.js';
import { SimCore } from '../core/index.js';

export var S, D2R = Math.PI / 180, R2D = 180 / Math.PI;

export var leapText;

export function init() {
  S = SimCore;

  leapText = $('leap-seconds').textContent.trim();

  S.setLeapSeconds(JSON.parse(leapText), leapText);

  $('version').textContent = 'v' + S.VERSION;
}
