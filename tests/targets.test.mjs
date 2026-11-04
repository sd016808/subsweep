// The per-browser builds (tools/lib/targets.mjs): Chrome gets the manifest as it is,
// Firefox a converted one; neither package contains test-only files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EXT, GECKO_ID, manifestFor, packageEntries, readManifest } from '../tools/lib/targets.mjs';

test('the Chrome package uses extension/manifest.json unchanged', () => {
  assert.deepEqual(manifestFor('chrome'), readManifest());
});

test('the Firefox manifest uses a background script, a fixed add-on ID and declares no data collection', () => {
  const chrome = readManifest();
  const firefox = manifestFor('firefox');
  assert.deepEqual(firefox.background, { scripts: [chrome.background.service_worker] });
  assert.ok(fs.existsSync(path.join(EXT, firefox.background.scripts[0])));
  assert.equal(firefox.minimum_chrome_version, undefined);
  const gecko = firefox.browser_specific_settings.gecko;
  assert.equal(gecko.id, GECKO_ID, 'never change the add-on ID after publishing');
  assert.match(gecko.strict_min_version, /^\d+\.0$/);
  assert.ok(Number.parseInt(gecko.strict_min_version, 10) >= 128, 'world: "MAIN" content scripts need Firefox 128+');
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
  // Below 142, AMO's validator warns that Firefox for Android doesn't know data_collection_permissions.
  assert.ok(Number.parseInt(gecko.strict_min_version, 10) >= 142, 'data_collection_permissions needs Firefox (Android) 142+');
  assert.equal(firefox.browser_specific_settings.gecko_android, undefined, 'AMO lists any add-on with gecko_android as available on Android');
  // Everything else is the same as in Chrome.
  for (const key of ['name', 'version', 'permissions', 'host_permissions', 'content_scripts', 'action', 'icons', 'default_locale']) {
    assert.deepEqual(firefox[key], chrome[key], key);
  }
});

test('packages contain the manifest and extension files only', () => {
  for (const target of ['chrome', 'firefox']) {
    const names = packageEntries(target).map((entry) => entry.name);
    assert.equal(names[0], 'manifest.json');
    assert.equal(names.filter((name) => name === 'manifest.json').length, 1);
    assert.ok(names.every((name) => !name.startsWith('test/') && !name.includes('hook')), `${target}: no test hooks`);
    for (const file of readManifest().content_scripts.flatMap((cs) => cs.js)) assert.ok(names.includes(file), `${target}: ${file}`);
  }
});
