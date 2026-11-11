// Browser smoke test. Runs the same checks on the module build (index.html over a local server)
// and the standalone build (dist/project-wednesday.html opened from disk), then compares their output.
// Needs Playwright with Chromium: npm i -D playwright && npx playwright install chromium
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(root, 'tests/browser/out');
const localThree = path.join(root, 'node_modules/three/build/three.min.js');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + what + (d !== undefined ? '  [' + d + ']' : '')); };
const RE = 6378137, kep = (a, e, i, raan, argp, ta) => ({ type: 'keplerian', a_m: a, e, i_deg: i, raan_deg: raan, argp_deg: argp, ta_deg: ta });
const CFG = { parent: { shape: 'earth_default' }, start_epoch: '2026-11-10T06:30:00.000 UTC', duration: 'P3D', integrator: { type: 'rk4', time_step_s: 10 }, output_step_s: 60,
  force_model: { drag: true, srp: true },
  satellites: { count: 3, mass_kg: 100, cd: 2.2, cr: 1.5, area_m2: 1, names: ['Low 300', 'Boosted 300', 'High 550'], orbits: [kep(RE + 300e3, 0, 51.6, 10, 0, 0), kep(RE + 300e3, 0, 51.6, 10, 0, 90), kep(RE + 550e3, 0, 97.6, 80, 0, 0)] },
  maneuvers: [{ sat: 'Boosted 300', t_s: 86400, dv_m_s: [0, 2, 0] }, { sat: 'Boosted 300', t_s: 172800, dv_m_s: [0, 2, 0] }] };

async function suite(browser, url, tag) {
  console.log('\n=== ' + tag + ': ' + url);
  const page = await browser.newPage({ viewport: { width: 1360, height: 820 } }), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  if (fs.existsSync(localThree)) await page.route('**/three.min.js', r => r.fulfill({ path: localThree, contentType: 'application/javascript' }));
  await page.goto(url); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await page.reload();
  await page.waitForFunction(() => window.OrbitalSim && OrbitalSim.viewer.state().n > 0, null, { timeout: 60000 });
  check(tag + ': page loads and runs the default config', true);
  await page.screenshot({ path: OUT + '/' + tag + '-start.png' });

  const runCfg = async cfg => {
    await page.evaluate(c => { const t = document.getElementById('config'); t.value = JSON.stringify(c, null, 2); t.dispatchEvent(new Event('change')); OrbitalSim.run(); }, cfg);
    await page.waitForFunction(k => OrbitalSim.viewer.state().n === k && !document.getElementById('run').disabled, cfg.satellites.count, { timeout: 120000 }); await page.waitForTimeout(300);
  };
  await runCfg(CFG);
  const report = (await page.innerText('#report')).replace(/\s+/g, ' ');
  check(tag + ': 3-satellite drag + SRP + burns run completes', /Boosted 300.*2, 4\.00 m\/s/.test(report) && (report.match(/Completed/g) || []).length === 3, report.slice(0, 160));
  for (const v of ['map', 'ltan', 'alt', 'beta', 'ecl', 'range', 'docs', 'globe']) {
    await page.click('[role=tab][data-v=' + v + ']'); await page.waitForTimeout(250); await page.screenshot({ path: OUT + '/' + tag + '-' + v + '.png' });
  }
  check(tag + ': docs tab shows the documentation pages', /Config reference[\s\S]*Accuracy and limits[\s\S]*Glossary/.test(await page.evaluate(() => { document.querySelector('[role=tab][data-v=docs]').click(); return document.getElementById('docs').innerText; })));
  await page.click('[role=tab][data-v=globe]');
  const exports = [];
  for (const v of ['ltan', 'alt', 'beta', 'ecl', 'range']) {
    await page.click('[role=tab][data-v=' + v + ']'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveChart')]);
    const p = OUT + '/' + tag + '-' + dl.suggestedFilename(); await dl.saveAs(p); exports.push(fs.readFileSync(p, 'utf8').split('\n').length - 2);
  }
  check(tag + ': every chart exports a CSV with rows', exports.every(n => n > 0), exports.join(', '));
  await page.click('[role=tab][data-v=globe]');
  const csv = await page.evaluate(() => OrbitalSim.csv());
  check(tag + ': plan.csv names the SRP model and non-gravitational work', /solar radiation pressure/.test(csv) && /nongrav_work_j_per_kg/.test(csv));

  // form: Reset, SRP checkbox, step warning, fieldset legend
  await page.click('#newCfg'); await page.click('text=Solar radiation pressure (SRP)'); await page.waitForTimeout(200);
  const fm = JSON.parse(await page.inputValue('#config')).force_model;
  check(tag + ': SRP checkbox writes force_model.srp only', JSON.stringify(fm) === '{"srp":true}', JSON.stringify(fm));
  await page.evaluate(() => { const t = document.getElementById('config'), c = JSON.parse(t.value); c.integrator.time_step_s = 400; t.value = JSON.stringify(c); t.dispatchEvent(new Event('change')); });
  await page.click('#run'); await page.waitForFunction(() => !document.getElementById('run').disabled); await page.waitForTimeout(200);
  check(tag + ': coarse step shows a warning', /coarse/.test(await page.$eval('#warnings', e => e.hidden ? '' : e.innerText)));
  const lg = await page.$$eval('fieldset.fg legend', l => l.map(x => getComputedStyle(x).backgroundColor));
  check(tag + ': group-box legends have a solid background (no line through the text)', lg.length > 3 && lg.every(c => c !== 'rgba(0, 0, 0, 0)'), lg[0]);
  await page.hover('fieldset.fg legend .info-btn'); await page.waitForTimeout(150);
  check(tag + ': info button shows its tooltip', await page.$eval('#win98-infotip', e => !e.hidden && e.innerText.length > 20));

  // presets
  const nPre = await page.$$eval('#preset option', o => o.length);
  for (let i = 1; i < nPre; i++) { await page.selectOption('#preset', { index: i }); await page.waitForFunction(() => !document.getElementById('run').disabled, null, { timeout: 120000 }); }
  check(tag + ': every preset runs', (await page.$eval('#errors', e => e.hidden)), nPre - 1 + ' presets');

  // narrow screen
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/' + tag + '-mobile.png' });
  check(tag + ': no horizontal scroll at phone width', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  check(tag + ': no console errors', errs.length === 0, errs.join(' | '));
  await page.close();
  return csv.split('\n').filter(l => !/^# (generated|run_time)/.test(l)).join('\n');
}

const server = serve(0), port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const a = await suite(browser, 'http://localhost:' + port + '/index.html', 'modules');
  const dist = path.join(root, 'dist/project-wednesday.html');
  if (fs.existsSync(dist)) {
    const b = await suite(browser, 'file://' + dist, 'standalone');
    check('module and standalone builds produce the same plan.csv', a === b, a.length + ' vs ' + b.length + ' chars');
  } else console.log('dist/project-wednesday.html missing: run npm run build to test the standalone file');
} finally { await browser.close(); server.close(); }
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
