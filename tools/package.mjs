#!/usr/bin/env node
/*
 * Builds dist/subsweep-<version>.zip — the file you upload to the Chrome Web Store
 * (and Microsoft Edge Add-ons). Runs the syntax check and the tests first.
 *
 * Usage:  node tools/package.mjs [--skip-tests]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

function run(label, args) {
  console.log(`\n› ${label}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed — not packaging.`);
    process.exit(result.status || 1);
  }
}

if (!process.argv.includes('--skip-tests')) {
  run('Syntax check', ['tools/check-syntax.mjs']);
  run('Tests', ['--test', 'tests/parse.test.mjs', 'tests/filters.test.mjs', 'tests/i18n.test.mjs']);
  run('Browser tests (headless Chrome)', ['--test', '--test-concurrency=1', 'tests/browser/scan-resume.test.mjs', 'tests/browser/unsubscribe.test.mjs']);
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
for (const size of [16, 32, 48, 128]) {
  if (!fs.existsSync(path.join(EXT, 'icons', `icon${size}.png`))) {
    console.error(`Missing icons/icon${size}.png — run "npm run assets" first.`);
    process.exit(1);
  }
}

function collect(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? collect(full) : [full];
    });
}

const files = collect(EXT).sort();
const entries = files.map((file) => ({ name: path.relative(EXT, file).split(path.sep).join('/'), data: fs.readFileSync(file) }));
const zip = createZip(entries);

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, `subsweep-${manifest.version}.zip`);
fs.writeFileSync(out, zip);

console.log(`\n✓ ${path.relative(ROOT, out)}  (${entries.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);
console.log('  Upload this file in the Chrome Web Store Developer Dashboard → Package → Upload new package.');
