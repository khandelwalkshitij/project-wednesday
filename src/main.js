// Entry point. Each app module's init() runs once, in this order (the order the single-file page ran in).
import { init as boot } from './app/boot.js';
import { init as presets } from './app/presets.js';
import { init as run } from './app/run.js';
import { init as form } from './app/form.js';
import { init as index } from './viewer/index.js';
import { init as infotip } from './app/infotip.js';
import { init as start } from './app/start.js';

// Clicking the title in the title bar reloads the page.
var title = document.querySelector('.title-bar h1');
if (title) { title.title = 'Reload the page'; title.addEventListener('click', function () { location.reload(); }); }

boot();
presets();
run();
form();
index();
infotip();
start();
