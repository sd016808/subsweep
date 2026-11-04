#!/usr/bin/env node
/*
 * Runs the browser tests (tests/browser/) in headless Chrome, Firefox or both.
 * Usage:  node tools/test-browser.mjs [chrome|firefox|all]   (default: chrome)
 *         npm run test:browser -- firefox
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/targets.mjs';

const choice = process.argv[2] || 'chrome';
const browsers = choice === 'all' ? ['chrome', 'firefox'] : [choice];
if (!browsers.every((b) => b === 'chrome' || b === 'firefox')) {
  console.error('Usage: node tools/test-browser.mjs [chrome|firefox|all]');
  process.exit(1);
}

const dir = path.join(ROOT, 'tests', 'browser');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests', 'browser', f));
let failed = false;
for (const browser of browsers) {
  console.log(`\n› Browser tests in headless ${browser[0].toUpperCase()}${browser.slice(1)}`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, BROWSER: browser } });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
