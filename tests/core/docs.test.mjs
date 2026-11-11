// Documentation checks: every JSON example in README.md and docs/*.md is a complete config that runs; the in-app
// documentation and field list are generated from docs/*.md and up to date; every link resolves; and every config field
// the validator accepts is documented in docs/config-reference.md.
import fs from 'fs';
import path from 'path';
import { S, here } from './setup.mjs';
import { build } from '../../tools/build-docs.mjs';
import { DOC_HTML } from '../../src/viewer/docs-content.js';

let fails = 0; const check = (id, what, ok, d) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + what + (d !== undefined ? '  [' + d + ']' : '')); };
const root = path.resolve(here, '../..'), docsDir = path.join(root, 'docs');
const files = ['README.md'].concat(fs.readdirSync(docsDir).filter(f => f.endsWith('.md')).map(f => 'docs/' + f));

// 1. every ```json block is a complete config that validates and runs
let n = 0;
for (const f of files) {
  const md = fs.readFileSync(path.join(root, f), 'utf8'), blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]);
  blocks.forEach((b, k) => {
    n++; let msg = '', ok = false;
    try {
      const cfg = JSON.parse(b), r = S.run(cfg), names = new Set(r.csv.split('\n').filter(l => l && l[0] !== '#').slice(1).map(l => l.split(',')[0]));
      ok = r.rows > 1 && names.size === S.normalizeConfig(cfg).sats.length; msg = r.rows + ' rows, ' + names.size + ' satellite(s)';
    } catch (e) { msg = e.message.split('\n')[0]; }
    check('DOCS', f + ' example ' + (k + 1) + ' is a complete config that runs', ok, msg);
  });
}
check('DOCS', 'the docs contain JSON examples', n >= 10, n + ' examples');

// 2. generated files are up to date with the Markdown
{ const { js, index } = build();
  check('DOCS', 'src/viewer/docs-content.js is generated from docs/*.md (run npm run docs)', js === fs.readFileSync(path.join(root, 'src/viewer/docs-content.js'), 'utf8'));
  check('DOCS', 'the field list in index.html is generated from docs/config-reference.md (run npm run docs)', index === fs.readFileSync(path.join(root, 'index.html'), 'utf8')); }

// 3. links: in-app anchors exist; repository links point at files that exist
{ const html = DOC_HTML + fs.readFileSync(path.join(root, 'index.html'), 'utf8'), ids = new Set([...DOC_HTML.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  const missing = [...html.matchAll(/href="#([^"]+)" data-doc/g)].map(m => m[1]).filter(h => !ids.has(h));
  check('DOCS', 'every in-app documentation link has a target', !missing.length, missing.join(', ') || 'all resolve');
  const broken = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(root, f), 'utf8');
    for (const [, href] of md.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) if (!/^https?:/.test(href) && !fs.existsSync(path.join(root, path.dirname(f), href))) broken.push(f + ': ' + href);
  }
  check('DOCS', 'every relative link in the Markdown points at a file that exists', !broken.length, broken.join(', ') || 'all exist'); }

// 4. every field the validator accepts is documented
{ const src = fs.readFileSync(path.join(root, 'src/core/config.js'), 'utf8'), ref = fs.readFileSync(path.join(docsDir, 'config-reference.md'), 'utf8');
  const fields = new Set(); for (const [, list] of src.matchAll(/keys\([^,]+,\s*\[([^\]]+)\]/g)) for (const [, k] of list.matchAll(/'([\w]+)'/g)) fields.add(k);
  const undocumented = [...fields].filter(k => !ref.includes('`' + k + '`') && !ref.includes('"' + k + '"'));
  check('DOCS', 'every config field the validator accepts appears in docs/config-reference.md', !undocumented.length && fields.size > 40, undocumented.join(', ') || fields.size + ' fields'); }

// 5. requirement sheets: every row parses to the header's width and has a status
{ const parse = t => { const rows = [], re = /("([^"]|"")*"|[^,\n]*)(,|\n|$)/g; let row = [], m; while ((m = re.exec(t)) && m[0] !== '') { row.push(m[1]); if (m[3] !== ',') { rows.push(row); row = []; } } return rows.filter(r => r.length > 1); };
  for (const f of ['requirements-baseline.csv', 'requirements-additional.csv']) {
    const rows = parse(fs.readFileSync(path.join(docsDir, f), 'utf8')), w = rows[0].length, si = rows[0].indexOf('Status');
    const bad = rows.slice(1).filter(r => r.length !== w || !r[si] || !r[si].trim()).map(r => r[0]);
    check('DOCS', 'docs/' + f + ': every requirement has a status and the right number of columns', si >= 0 && !bad.length, bad.join(', ') || (rows.length - 1) + ' rows');
  } }

if (fails) { console.log('\n' + fails + ' check(s) failed'); process.exit(1); }
console.log('\nall passed');
