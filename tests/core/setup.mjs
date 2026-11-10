// Loads the physics core and the leap-second table from index.html, the same table the page uses.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SimCore } from '../../src/core/index.js';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = name => JSON.parse(fs.readFileSync(path.join(here, '../fixtures', name), 'utf8'));
const html = fs.readFileSync(path.join(here, '../../index.html'), 'utf8');
export const leapText = /<script type="application\/json" id="leap-seconds">([\s\S]*?)<\/script>/.exec(html)[1];
SimCore.setLeapSeconds(JSON.parse(leapText), leapText);
export const S = SimCore;
