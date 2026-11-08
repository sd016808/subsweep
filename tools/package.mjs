#!/usr/bin/env node
/*
 * Builds the store packages:
 *   dist/subsweep-chrome-<version>.zip   → Chrome Web Store (also Microsoft Edge Add-ons)
 *   dist/subsweep-firefox-<version>.zip  → Firefox Add-ons (addons.mozilla.org)
 * Runs the syntax check and the tests first (the browser tests in Chrome, and in Firefox
 * too when it is installed).
 *
 * Usage:  node tools/package.mjs [--skip-tests]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { hasFirefox } from './lib/firefox.mjs';
import { createZip } from './lib/zip.mjs';
import { EXT, ROOT, TARGETS, packageEntries, readManifest } from './lib/targets.mjs';

const DIST = path.join(ROOT, 'dist');
const BROWSER_TESTS = ['--test', '--test-concurrency=1', ...fs.readdirSync(path.join(ROOT, 'tests', 'browser')).filter((f) => f.endsWith('.test.mjs')).map((f) => `tests/browser/${f}`)];

function run(label, args, env = {}) {
  console.log(`\n› ${label}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed — not packaging.`);
    process.exit(result.status || 1);
  }
}

if (!process.argv.includes('--skip-tests')) {
  run('Syntax check', ['tools/check-syntax.mjs']);
  run('Tests', ['--test', 'tests/parse.test.mjs', 'tests/filters.test.mjs', 'tests/format.test.mjs', 'tests/i18n.test.mjs', 'tests/targets.test.mjs']);
  run('Browser tests (headless Chrome)', BROWSER_TESTS, { BROWSER: 'chrome' });
  if (hasFirefox()) run('Browser tests (headless Firefox)', BROWSER_TESTS, { BROWSER: 'firefox' });
  else console.log('\n(Firefox not installed: browser tests ran in Chrome only.)');
}

for (const size of [16, 32, 48, 128]) {
  if (!fs.existsSync(path.join(EXT, 'icons', `icon${size}.png`))) {
    console.error(`Missing icons/icon${size}.png — run "npm run assets" first.`);
    process.exit(1);
  }
}

const { version } = readManifest();
fs.mkdirSync(DIST, { recursive: true });
console.log('');
for (const target of TARGETS) {
  const entries = packageEntries(target);
  const zip = createZip(entries);
  const out = path.join(DIST, `subsweep-${target}-${version}.zip`);
  fs.writeFileSync(out, zip);
  console.log(`✓ ${path.relative(ROOT, out)}  (${entries.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);
}
console.log('\n  Chrome Web Store:  upload dist/subsweep-chrome-*.zip   (store/PUBLISHING.md)');
console.log('  Firefox Add-ons:   upload dist/subsweep-firefox-*.zip  (store/PUBLISHING-firefox.md)');
