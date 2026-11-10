// Builds dist/project-wednesday.html: one self-contained file (CSS and JS inlined) that also works when opened from disk.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = (await esbuild.build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', target: 'es2017', write: false, legalComments: 'none' })).outputFiles[0].text;

let out = page.replace(/(?:<link rel="stylesheet" href="([^"]+)">\n?)+/, block => {
  const css = [...block.matchAll(/href="([^"]+)"/g)].map(m => fs.readFileSync(path.join(root, m[1]), 'utf8')).join('\n');
  return '<style>\n' + css + '</style>\n';
});
const tag = '<script type="module" src="src/main.js"></script>';
if (!out.includes(tag)) throw new Error('entry script tag not found in index.html');
out = out.replace(tag, () => '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/project-wednesday.html'), out);
console.log('dist/project-wednesday.html', (out.length / 1024).toFixed(0) + ' KB');
