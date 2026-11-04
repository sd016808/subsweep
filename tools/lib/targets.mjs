// Per-browser builds of the extension. extension/manifest.json is the Chrome (and Edge)
// manifest; the Firefox build gets a few manifest changes, the code is the same.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXT = path.join(ROOT, 'extension');
export const TARGETS = ['chrome', 'firefox'];

// Firefox add-on ID. Never change it after the first upload to addons.mozilla.org:
// Firefox uses it to recognise updates.
export const GECKO_ID = 'subsweep@sd016808.github.io';
// The built-in data-collection consent (data_collection_permissions) arrived in Firefox
// 140 on desktop and 142 on Android. AMO's validator warns when the minimum version is
// below 142, even for a desktop-only add-on. A gecko_android key can't fix that, because
// AMO lists any add-on that has one as available on Android, and SubSweep doesn't support
// Android (m.youtube.com).
export const FIREFOX_MIN_VERSION = '142.0';

export function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
}

export function manifestFor(target, manifest = readManifest()) {
  if (target === 'chrome') return manifest;
  if (target !== 'firefox') throw new Error(`Unknown target: ${target}`);
  const { minimum_chrome_version: _chromeOnly, background, ...rest } = manifest;
  return {
    ...rest,
    // Firefox runs the background script as an event page, not a service worker.
    background: { scripts: [background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        // SubSweep sends nothing to its developer or anyone else (see PRIVACY.md).
        data_collection_permissions: { required: ['none'] },
      },
    },
  };
}

/** Every file of the extension except the manifest: [{ name: 'src/…', file: absolute path }]. */
export function extensionFiles() {
  const walk = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  return walk(EXT)
    .sort()
    .map((file) => ({ name: path.relative(EXT, file).split(path.sep).join('/'), file }))
    .filter((entry) => entry.name !== 'manifest.json');
}

/** All entries of a target's package: [{ name, data }], manifest first. */
export function packageEntries(target, manifest = manifestFor(target)) {
  return [
    { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
    ...extensionFiles().map(({ name, file }) => ({ name, data: fs.readFileSync(file) })),
  ];
}

/** Writes an unpacked copy of a target (e.g. to load in about:debugging). */
export function writeUnpacked(target, outDir, manifest = manifestFor(target)) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const { name, data } of packageEntries(target, manifest)) {
    const file = path.join(outDir, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  return outDir;
}
