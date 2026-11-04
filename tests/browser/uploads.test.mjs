// Browser tests for the latest-upload step, against tests/browser/fake-youtube.js:
// when YouTube's channel feeds (RSS) are down, a scan stops asking for them after a few
// failures in a row and reads the channels' Videos tab directly; working feeds keep being
// used, even if a few channels' feeds are broken; the next scan tries the feeds again.
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

const CHANNELS = 40;

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>window.__MESSAGES = ${messages};</script>
<script src="/tools/preview/stub.js"></script>
${scripts.map((file) => `<script src="/extension/${file}"></script>`).join('\n')}
<script src="/tests/browser/fake-youtube.js"></script>
<script>
  // Exactly ${CHANNELS} subscriptions on the fake server (instead of its usual 4).
  window.__server.subscribed.clear();
  for (let i = 0; i < ${CHANNELS}; i++) window.__server.subscribed.set('UC' + String(i).padStart(22, 'y'), 'Channel ' + i);

  // Channel feeds: window.__feeds = 'down' (every feed 404) | 'up' | 'some-broken' (every 3rd 404).
  window.__feedRequests = 0;
  const realFetch = window.fetch;
  window.fetch = async (url, options) => {
    if (!String(url).includes('/feeds/videos.xml')) return realFetch(url, options);
    window.__feedRequests++;
    const index = Number(String(url).match(/y*(\\d+)$/)[1]);
    if (window.__feeds === 'down' || (window.__feeds === 'some-broken' && index % 3 === 0)) return new Response('Not Found', { status: 404 });
    const published = new Date(Date.now() - 5 * 86400000).toISOString();
    return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><entry><published>' + published + '</published></entry></feed>', { status: 200 });
  };
</script>
</body></html>`;

let browser;
let server;
let url;

before(async () => {
  server = await startServer(ROOT);
  url = server.page('/__test/uploads.html', HTML);
  browser = await launch();
});

after(async () => {
  await browser.close();
  await server.close();
});

async function run(script) {
  const page = await browser.newPage({ width: 1000, height: 700 });
  try {
    await page.goto(url);
    return await page.evaluate(`(async () => {
      const App = SubSweep.App, S = App.state;
      const sources = () => Object.values(S.data.uploads).reduce((n, u) => ({ ...n, [u.src]: (n[u.src] || 0) + 1 }), {});
      await App.init();
      ${script}
    })()`);
  } finally {
    await page.close();
  }
}

test('feeds down: the scan stops asking for them after a few failures and still finds every upload', async (t) => {
  const result = await run(`
    window.__feeds = 'down';
    await App.scan();
    return { feedRequests: window.__feedRequests, sources: sources(), channelPages: window.__log.filter((r) => r.startsWith('channel:')).length };
  `);
  t.diagnostic(`${result.feedRequests} feed requests for ${CHANNELS} channels (was ${CHANNELS} before)`);
  // 5 failures in a row switch the feeds off; requests already on their way (6 at a time) still finish.
  assert.ok(result.feedRequests <= 5 + 6, `${result.feedRequests} feed requests for ${CHANNELS} channels`);
  assert.deepEqual(result.sources, { page: CHANNELS }, 'every channel still gets its latest upload (from the Videos tab)');
  assert.equal(result.channelPages, CHANNELS);
});

test('feeds up: every channel is read from its feed (no extra Videos-tab requests)', async () => {
  const result = await run(`
    window.__feeds = 'up';
    await App.scan();
    return { feedRequests: window.__feedRequests, sources: sources(), channelPages: window.__log.filter((r) => r.startsWith('channel:')).length };
  `);
  assert.equal(result.feedRequests, CHANNELS);
  assert.deepEqual(result.sources, { feed: CHANNELS });
  assert.equal(result.channelPages, 0);
});

test('a few broken feeds among working ones do not switch the feeds off', async () => {
  const result = await run(`
    window.__feeds = 'some-broken';
    await App.scan();
    return { feedRequests: window.__feedRequests, sources: sources() };
  `);
  const broken = Math.ceil(CHANNELS / 3); // channels 0, 3, 6, …
  assert.equal(result.feedRequests, CHANNELS, 'the feed is still tried for every channel');
  assert.deepEqual(result.sources, { feed: CHANNELS - broken, page: broken });
});

test('the next scan tries the feeds again (e.g. once YouTube serves them again)', async () => {
  const result = await run(`
    window.__feeds = 'down';
    await App.scan();
    const firstRun = window.__feedRequests;
    window.__feeds = 'up';
    window.__feedRequests = 0;
    S.data.uploads = {}; // force the uploads to be checked again
    await App.scan();
    return { firstRun, secondRun: window.__feedRequests, sources: sources() };
  `);
  assert.ok(result.firstRun <= 11);
  assert.equal(result.secondRun, CHANNELS);
  assert.deepEqual(result.sources, { feed: CHANNELS });
});
