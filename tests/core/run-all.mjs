// Runs every *.test.mjs in this folder in its own process and fails if any of them fail.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { here } from './setup.mjs';

let bad = 0;
for (const f of fs.readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort()) {
  console.log('\n=== ' + f);
  const r = spawnSync(process.execPath, [path.join(here, f)], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? '\n' + bad + ' test file(s) failed' : '\nall test files passed');
process.exit(bad ? 1 : 0);
