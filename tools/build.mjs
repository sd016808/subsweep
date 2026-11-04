#!/usr/bin/env node
/*
 * Writes unpacked builds to dist/<browser>/ for loading during development:
 *   Chrome / Edge: chrome://extensions → Developer mode → Load unpacked → dist/chrome
 *                  (or simply the extension/ folder itself)
 *   Firefox:       about:debugging → This Firefox → Load Temporary Add-on… → dist/firefox/manifest.json
 *
 * Usage:  node tools/build.mjs [chrome|firefox …]   (default: both)
 */
import path from 'node:path';
import { ROOT, TARGETS, writeUnpacked } from './lib/targets.mjs';

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
for (const target of wanted.length ? wanted : TARGETS) {
  if (!TARGETS.includes(target)) {
    console.error(`Unknown browser "${target}". Use: ${TARGETS.join(', ')}`);
    process.exit(1);
  }
  const dir = writeUnpacked(target, path.join(ROOT, 'dist', target));
  console.log(`✓ ${path.relative(ROOT, dir)}`);
}
