import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const LOCALES_DIR = path.join(ROOT, '_locales');
const locales = fs.readdirSync(LOCALES_DIR).filter((name) => fs.existsSync(path.join(LOCALES_DIR, name, 'messages.json')));
const read = (locale) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
const en = read('en');
const placeholders = (message) => [...message.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('every locale has exactly the same keys as English', () => {
  for (const locale of locales) {
    const messages = read(locale);
    const missing = Object.keys(en).filter((key) => !(key in messages));
    const extra = Object.keys(messages).filter((key) => !(key in en));
    assert.deepEqual({ locale, missing, extra }, { locale, missing: [], extra: [] });
  }
});

test('translations keep the same {n} placeholders and avoid "$"', () => {
  for (const locale of locales) {
    const messages = read(locale);
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value.message, 'string', `${locale}.${key} has no message`);
      assert.ok(value.message.trim(), `${locale}.${key} is empty`);
      assert.ok(!value.message.includes('$'), `${locale}.${key} contains "$" (reserved by chrome.i18n)`);
      assert.equal(placeholders(value.message), placeholders(en[key].message), `${locale}.${key} placeholders differ`);
    }
  }
});

test('store limits: name ≤ 75, short name ≤ 12, description ≤ 132 characters', () => {
  for (const locale of locales) {
    const messages = read(locale);
    assert.ok([...messages.extName.message].length <= 75, `${locale} extName too long`);
    assert.ok([...messages.extShortName.message].length <= 12, `${locale} extShortName too long`);
    assert.ok([...messages.extDescription.message].length <= 132, `${locale} extDescription too long`);
  }
});

test('every t("key") used in the code exists in English', () => {
  const used = new Set();
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const match of code.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(match[1]);
    // Keys referenced indirectly (e.g. MODE_DEFS / SCAN_STEPS tables, ternaries).
    for (const match of code.matchAll(/'((?:mode|step|notice|unsub|err)[A-Z][A-Za-z0-9]*)'/g)) used.add(match[1]);
  }
  const missing = [...used].filter((key) => !(key in en));
  assert.deepEqual(missing, []);
});

test('every English key is actually used somewhere', () => {
  const code = sourceFiles(path.join(ROOT, 'src'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const manifest = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const unused = Object.keys(en).filter((key) => !code.includes(`'${key}'`) && !manifest.includes(`__MSG_${key}__`));
  assert.deepEqual(unused, []);
});

test('manifest is valid and every referenced file exists', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const files = [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((cs) => cs.js),
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), `missing ${file}`);
});
