// Syntax-checks every extension script and validates every JSON file.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let failed = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  try {
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    else if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
    else continue;
    console.log(`ok    ${rel}`);
  } catch (error) {
    failed++;
    console.error(`FAIL  ${rel}\n${String(error.stderr || error.message)}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed.`);
  process.exit(1);
}
console.log('\nAll files OK.');
