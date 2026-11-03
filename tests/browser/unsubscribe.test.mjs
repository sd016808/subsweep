// Browser tests (headless Chrome) for bulk unsubscribe, against tests/browser/fake-youtube.js:
//  - "fast" mode sends channels in batches and verifies the result with the subscription
//    list; batches YouTube ignores or rejects fall back to one-by-one;
//  - it keeps going when the YouTube tab is in the background;
//  - a batch cut short by a page reload can be continued.
// Run with: npm run test:browser
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../tools/lib/chrome.mjs';
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
<script>
  // Record every channel sent for unsubscribing; optional hook per request.
  window.__unsubscribed = [];
  const original = window.__INNERTUBE;
  window.__INNERTUBE = async (endpoint, body) => {
    if (endpoint === 'subscription/unsubscribe') {
      window.__unsubscribed.push(...body.channelIds);
      if (window.__onUnsubscribe) window.__onUnsubscribe(body);
    }
    return original(endpoint, body);
  };
  // Gives the account \`count\` channels (locally and on the fake server) and picks a speed.
  window.__setup = async (count = 6, speed = 'normal') => {
    const App = SubSweep.App, S = App.state;
    await App.init();
    await App.setSetting('speed', speed);
    if (!S.data.subsOrder.length) {
      for (let i = 0; i < count; i++) {
        const id = 'UC' + String(i).padStart(22, 'z');
        S.data.subs[id] = { id, title: 'Channel ' + i, handle: '', thumb: '', subscribers: '', unsubParams: '' };
        S.data.subsOrder.push(id);
        window.__server.subscribed.set(id, 'Channel ' + i);
      }
    }
    return S.data.subsOrder.slice();
  };
  window.__requests = () => window.__log.filter((r) => r.startsWith('unsubscribe:') || r === 'FEchannels');
</script>
</body></html>`;

const GRACE_SECONDS = 5;
let chrome;
let server;
let url;

before(async () => {
  server = await startServer(ROOT);
  url = server.page('/__test/unsubscribe.html', HTML);
  // Shorten "hidden for 5 minutes" so Chrome's strongest timer throttling can apply during the test.
  chrome = await launch({ flags: [`--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/${GRACE_SECONDS}`] });
});

after(async () => {
  await chrome.close();
  await server.close();
});

async function inPage(script) {
  const page = await chrome.newPage({ width: 1000, height: 700 });
  try {
    await page.goto(url);
    return await page.evaluate(`(async () => { const App = SubSweep.App, S = App.state; ${script} })()`);
  } finally {
    await page.close();
  }
}

const RESULT = `({ requests: window.__requests(), ok: S.unsub.ok, fail: S.unsub.fail, done: S.unsub.done, stopped: S.unsub.stopped,
  left: S.data.subsOrder.length, removed: S.data.removed.length, batchSupport: S.data.batchSupport, queue: S.data.unsubQueue,
  stillOnServer: [...window.__server.subscribed.keys()].filter((id) => id.startsWith('UCz')).length })`;

// ---------------------------------------------------------------- fast mode (batches)

test('fast mode: 45 channels go out in 3 requests and are verified once', async () => {
  const r = await inPage(`
    const ids = await window.__setup(45, 'fast');
    await App.runUnsubscribe(ids);
    return ${RESULT};
  `);
  assert.deepEqual(r.requests, ['unsubscribe:20', 'unsubscribe:20', 'unsubscribe:5', 'FEchannels']);
  assert.equal(r.ok, 45);
  assert.equal(r.left, 0);
  assert.equal(r.removed, 45);
  assert.equal(r.stillOnServer, 0);
  assert.equal(r.batchSupport, true, 'remembered: batches work');
  assert.equal(r.queue, null);
});

test('fast mode: if YouTube silently handles only one channel per request, the rest are redone one by one', async () => {
  const r = await inPage(`
    window.__server.batch = 'first';
    const ids = await window.__setup(8, 'fast');
    await App.runUnsubscribe(ids);
    const first = ${RESULT};
    // A later batch skips the batch attempt altogether.
    window.__log.length = 0;
    for (let i = 0; i < 3; i++) { const id = 'UC' + String(100 + i).padStart(22, 'z'); S.data.subs[id] = { id, title: 'Later ' + i, handle: '', thumb: '' }; S.data.subsOrder.push(id); window.__server.subscribed.set(id, 'Later'); }
    App.closeModal();
    await App.runUnsubscribe(S.data.subsOrder.slice());
    return { first, second: window.__requests() };
  `);
  assert.deepEqual(r.first.requests, ['unsubscribe:8', 'FEchannels', ...Array(7).fill('unsubscribe:1')]);
  assert.equal(r.first.ok, 8, 'every channel ends up unsubscribed');
  assert.equal(r.first.stillOnServer, 0);
  assert.equal(r.first.batchSupport, false, 'remembered: batches are not honoured');
  assert.deepEqual(r.second, ['unsubscribe:1', 'unsubscribe:1', 'unsubscribe:1']);
});

test('fast mode: if YouTube rejects a batch, it falls back to one by one', async () => {
  const r = await inPage(`
    window.__server.batch = 'reject';
    const ids = await window.__setup(8, 'fast');
    await App.runUnsubscribe(ids);
    return ${RESULT};
  `);
  assert.deepEqual(r.requests, ['unsubscribe:8', ...Array(8).fill('unsubscribe:1')]);
  assert.equal(r.ok, 8);
  assert.equal(r.fail, 0, 'the rejected batch is not counted as a failure');
  assert.equal(r.stillOnServer, 0);
  assert.equal(r.batchSupport, false);
});

test('fast mode: Stop during a batch still records what YouTube already did', async () => {
  const r = await inPage(`
    const ids = await window.__setup(45, 'fast');
    window.__onUnsubscribe = () => { window.__onUnsubscribe = null; App.stopUnsubscribe(); };
    await App.runUnsubscribe(ids);
    return ${RESULT};
  `);
  assert.deepEqual(r.requests, ['unsubscribe:20', 'FEchannels'], 'stops sending, but checks the result');
  assert.equal(r.stopped, true);
  assert.equal(r.ok, 20, 'the 20 channels YouTube processed are recorded as unsubscribed');
  assert.equal(r.left, 25);
  assert.equal(r.stillOnServer, 25);
  assert.equal(r.queue, null, 'a deliberate stop leaves no "continue" prompt');
});

// ---------------------------------------------------------------- background tab / interruptions

test('one-by-one unsubscribe keeps going while the tab is in the background', async (t) => {
  const page = await chrome.newPage({ width: 1000, height: 700 });
  const other = await chrome.newPage({ width: 1000, height: 700 });
  try {
    await page.goto(url);
    await page.evaluate("window.__setup(6, 'normal')");
    // Control: an ordinary chained 1-second timer, the kind Chrome throttles hardest in hidden tabs.
    await page.evaluate('window.__ticks = []; (function tick() { window.__ticks.push(performance.now()); setTimeout(tick, 1000); })(); true');
    await other.activate(); // our tab goes to the background
    await new Promise((resolve) => setTimeout(resolve, (GRACE_SECONDS + 2) * 1000));
    const result = await page.evaluate(`(async () => {
      const visibility = document.visibilityState;
      const started = performance.now();
      const run = SubSweep.App.runUnsubscribe(SubSweep.App.state.data.subsOrder.slice());
      const outcome = await Promise.race([run.then(() => 'finished'), new Promise((r) => setTimeout(() => r('timed out'), 60000))]);
      const ticks = window.__ticks.filter((t) => t >= started).length;
      return { visibility, outcome, seconds: (performance.now() - started) / 1000, ticks, ok: SubSweep.App.state.unsub.ok };
    })()`);
    assert.equal(result.visibility, 'hidden', 'the tab really is in the background');
    // How hard Chrome throttles a headless background tab varies between runs, so the
    // control timer is reported for information only.
    t.diagnostic(`control timer ticked ${result.ticks}× in ${result.seconds.toFixed(1)} s (1×/s when not throttled)`);
    assert.equal(result.outcome, 'finished');
    assert.equal(result.ok, 6);
    // ~1.7 s per channel in the foreground; heavy throttling would mean ~60 s per channel.
    assert.ok(result.seconds < 6 * 6, `finished in ${result.seconds.toFixed(1)} s`);
  } finally {
    await other.close();
    await page.close();
  }
});

test('a batch cut short by a page reload can be continued', async () => {
  const page = await chrome.newPage({ width: 1000, height: 700 });
  try {
    await page.goto(url);
    const ids = await page.evaluate("window.__setup(6, 'normal')");
    // Start the batch, then reload the page after two channels are done.
    await page.evaluate(`(async () => {
      SubSweep.App.runUnsubscribe(SubSweep.App.state.data.subsOrder.slice());
      while (window.__unsubscribed.length < 2) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300)); // let the progress be saved
    })()`);
    await page.goto(url); // reload: the running batch is gone

    const resumed = await page.evaluate(`(async () => {
      await window.__setup(6, 'normal');
      const App = SubSweep.App, S = App.state;
      const pending = App.pendingUnsub();
      App.continueUnsub();                 // shows the confirm dialog for the rest
      const modal = S.modal && S.modal.type;
      await App.runUnsubscribe(S.modal.ids);
      return { pending, modal, left: S.data.subsOrder.length, removed: S.data.removed.map((r) => r.id), queue: S.data.unsubQueue, sentAfterReload: window.__unsubscribed.length };
    })()`);

    assert.equal(resumed.pending.length, 4, 'four channels were still waiting');
    assert.equal(resumed.modal, 'confirm', 'the user confirms before it continues');
    assert.equal(resumed.sentAfterReload, 4, 'only the remaining channels are sent');
    assert.equal(resumed.left, 0);
    assert.deepEqual([...resumed.removed].sort(), [...ids].sort(), 'all six channels end up unsubscribed');
    assert.equal(resumed.queue, null);
  } finally {
    await page.close();
  }
});

test('stopping on purpose does not leave a "continue" prompt behind', async () => {
  const r = await inPage(`
    await window.__setup(6, 'normal');
    const run = App.runUnsubscribe(S.data.subsOrder.slice());
    while (window.__unsubscribed.length < 1) await new Promise((r) => setTimeout(r, 50));
    App.stopUnsubscribe();
    await run;
    return { stopped: S.unsub.stopped, pending: App.pendingUnsub().length };
  `);
  assert.equal(r.stopped, true);
  assert.equal(r.pending, 0);
});
