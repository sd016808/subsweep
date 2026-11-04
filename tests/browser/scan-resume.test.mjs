// Browser test (headless Chrome): a paused scan continues where it stopped.
// Runs the real content scripts against tests/browser/fake-youtube.js.
// Run with: npm run test:browser
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../tools/lib/browser.mjs';
import { startServer } from '../../tools/lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts.find((cs) => cs.world !== 'MAIN').js;
const messages = fs.readFileSync(path.join(ROOT, 'extension', '_locales', 'en', 'messages.json'), 'utf8');

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>window.__MESSAGES = ${messages};</script>
<script src="/tools/preview/stub.js"></script>
${scripts.map((file) => `<script src="/extension/${file}"></script>`).join('\n')}
<script src="/tests/browser/fake-youtube.js"></script>
</body></html>`;

let chrome;
let server;
let url;

before(async () => {
  server = await startServer(ROOT);
  url = server.page('/__test/scan.html', HTML);
  chrome = await launch();
});

after(async () => {
  await chrome.close();
  await server.close();
});

async function run(script) {
  const page = await chrome.newPage({ width: 1280, height: 800 });
  try {
    await page.goto(url);
    return await page.evaluate(`(async () => {
      const App = SubSweep.App;
      const S = App.state;
      const historyRequests = () => window.__log.filter((r) => r.startsWith('history:')).map((r) => r.slice(8));
      await App.init();
      ${script}
    })()`);
  } finally {
    await page.close();
  }
}

const SUMMARY = `({ watch: S.data.watch, entries: S.data.history && S.data.history.entries, reachedEnd: S.data.history && S.data.history.reachedEnd,
  partial: S.data.historyPartial, finished: S.data.lastScanAt > 0, uploads: Object.keys(S.data.uploads).length })`;

let uninterrupted;

test('an uninterrupted scan reads all 6 history pages', async () => {
  uninterrupted = await run(`
    await App.scan();
    return { ...${SUMMARY}, history: historyRequests() };
  `);
  assert.deepEqual(uninterrupted.history, ['FEhistory', 'T1', 'T2', 'T3', 'T4', 'T5']);
  assert.equal(uninterrupted.entries, 8);
  assert.equal(uninterrupted.reachedEnd, true);
  assert.equal(uninterrupted.finished, true);
  assert.equal(uninterrupted.partial, null);
  assert.equal(uninterrupted.uploads, 4);
  // A: today + 10 days + 300 days ago, B: today + 100 days ago, C: 40 days, D: 200 + 300 days
  const counts = Object.fromEntries(Object.entries(uninterrupted.watch).map(([id, [, n]]) => [id.slice(2, 3), n]));
  assert.deepEqual(counts, { a: 3, b: 2, c: 1, d: 2 });
});

test('a paused scan continues from the saved page instead of starting over', async () => {
  const result = await run(`
    window.__stopAt = 'T4';
    await App.scan();
    const paused = { token: S.data.historyPartial && S.data.historyPartial.token, resumable: App.resumeState(), finished: S.data.lastScanAt > 0 };
    window.__log.length = 0;
    await App.scan();
    return { paused, requests: window.__log.slice(), history: historyRequests(), ...${SUMMARY} };
  `);
  assert.equal(result.paused.token, 'T4', 'position saved after page 4');
  assert.deepEqual(result.paused.resumable, { history: true, subs: true, any: true });
  assert.equal(result.paused.finished, false);

  // Second run: a quick look at the top for new entries, then pages 5 and 6 only.
  assert.deepEqual(result.history, ['FEhistory', 'T1', 'T4', 'T5']);
  assert.ok(!result.requests.includes('FEchannels'), 'subscription list is reused, not fetched again');

  assert.equal(result.finished, true);
  assert.equal(result.partial, null);
  assert.equal(result.entries, uninterrupted.entries);
  assert.equal(result.reachedEnd, true);
  assert.deepEqual(result.watch, uninterrupted.watch, 'same result as a scan that was never paused');
});

test('if YouTube rejects the saved position, the history is read again from the start', async () => {
  const result = await run(`
    window.__stopAt = 'T4';
    await App.scan();
    window.__log.length = 0;
    window.__rejectOnce = 'T4';
    await App.scan();
    return { history: historyRequests(), error: S.data.historyError, ...${SUMMARY} };
  `);
  // catch-up (FEhistory, T1) → T4 rejected → full re-read
  assert.deepEqual(result.history, ['FEhistory', 'T1', 'T4', 'FEhistory', 'T1', 'T2', 'T3', 'T4', 'T5']);
  assert.equal(result.error, null);
  assert.equal(result.finished, true);
  assert.deepEqual(result.watch, uninterrupted.watch);
});

test('pausing during the latest-upload step keeps the channels already checked', async () => {
  const result = await run(`
    // Hold the 4th channel request and pause while the other three finish.
    let channelPages = 0;
    const original = window.__INNERTUBE;
    window.__INNERTUBE = async (endpoint, body) => {
      if (body && body.browseId && body.browseId.startsWith('UC') && ++channelPages === 4) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        App.stopScan();
      }
      return original(endpoint, body);
    };
    await App.scan();
    const checkedBeforeResume = Object.keys(S.data.uploads).length;
    window.__INNERTUBE = original;
    window.__log.length = 0;
    await App.scan();
    return { checkedBeforeResume, channelRequests: window.__log.filter((r) => r.startsWith('channel:')).length, history: historyRequests(), ...${SUMMARY} };
  `);
  assert.equal(result.checkedBeforeResume, 3, 'channels checked before the pause were saved');
  assert.equal(result.channelRequests, 1, 'only the unchecked channel is fetched again');
  assert.equal(result.uploads, 4);
  assert.equal(result.finished, true);
  // History runs alongside the uploads, so the pause may have caught it mid-way: it continues.
  assert.deepEqual(result.watch, uninterrupted.watch, 'watch history still ends up complete');
});

test('widening the range (3 → 12 months) only reads the extra months', async () => {
  const result = await run(`
    await App.setSetting('historyMonths', 3);
    await App.scan();
    const first = { history: historyRequests(), months: S.data.history.months, edge: S.data.history.edge && S.data.history.edge.token };
    window.__log.length = 0;
    await App.setSetting('historyMonths', 12);
    await App.scan();
    return { first, history: historyRequests(), ...${SUMMARY}, months: S.data.history.months };
  `);
  // 3 months: today, 10 and 40 days ago, then the 100-days-ago page crosses the cutoff.
  assert.deepEqual(result.first.history, ['FEhistory', 'T1', 'T2', 'T3']);
  assert.equal(result.first.edge, 'T3', 'remembers where the read stopped');
  // 12 months: new entries at the top (FEhistory, T1), then straight on from T3 — T2 is not read again.
  assert.deepEqual(result.history, ['FEhistory', 'T1', 'T3', 'T4', 'T5']);
  assert.equal(result.months, 12);
  assert.equal(result.reachedEnd, true);
  assert.deepEqual(result.watch, uninterrupted.watch, 'same result as reading 12 months in one go (no double counting)');
});

test('a scan cut short by a page reload continues from the last page it read', async () => {
  const page = await chrome.newPage({ width: 1280, height: 800 });
  try {
    await page.goto(url);
    await page.evaluate(`(async () => {
      await SubSweep.App.init();
      window.__hangAt = 'T4';
      SubSweep.App.scan();
      while (!window.__hung) await new Promise((r) => setTimeout(r, 50));
    })()`);
    await page.goto(url); // reload while the page for T4 is still loading
    const result = await page.evaluate(`(async () => {
      const App = SubSweep.App, S = App.state;
      const historyRequests = () => window.__log.filter((r) => r.startsWith('history:')).map((r) => r.slice(8));
      await App.init();
      const resumable = App.resumeState();
      await App.scan();
      return { resumable, history: historyRequests(), requests: window.__log.slice(), ...${SUMMARY} };
    })()`);
    assert.deepEqual(result.resumable, { history: true, subs: true, any: true });
    assert.deepEqual(result.history, ['FEhistory', 'T1', 'T4', 'T5'], 'continues at T4 instead of starting over');
    assert.ok(!result.requests.includes('FEchannels'));
    assert.deepEqual(result.watch, uninterrupted.watch);
    assert.equal(result.finished, true);
  } finally {
    await page.close();
  }
});

test('watch history and latest uploads are read at the same time', async () => {
  const result = await run(`
    window.__latency = 150; // every answer takes 150 ms
    await App.scan();
    return { log: window.__log.slice(), ...${SUMMARY} };
  `);
  const firstChannel = result.log.findIndex((r) => r.startsWith('channel:'));
  const lastChannel = result.log.map((r) => r.startsWith('channel:')).lastIndexOf(true);
  const lastHistory = result.log.map((r) => r.startsWith('history:')).lastIndexOf(true);
  assert.ok(firstChannel !== -1 && firstChannel < lastHistory, 'upload checks start while the history is still being read');
  assert.ok(lastChannel < lastHistory, 'and finish before it, instead of waiting for it');
  assert.deepEqual(result.watch, uninterrupted.watch);
  assert.equal(result.uploads, 4);
});
