#!/usr/bin/env node
/*
 * Smoke test of the Firefox build against the real www.youtube.com (signed out), in
 * headless Firefox — the same checks as tools/smoke-test.mjs does in Chrome:
 *   - the Firefox manifest is accepted (installed as a temporary add-on);
 *   - toolbar button: switches to an open YouTube tab and opens the panel there (no new
 *     tab); toggles on a YouTube tab; opens the YouTube home page when no YouTube tab exists;
 *   - the content scripts and the MAIN-world bridge are talking;
 *   - a public channel's feed and Videos tab are read and parsed;
 *   - the launcher button and the panel.
 *
 * Firefox's automation can't reach into an extension, so this installs a test copy with two
 * small hooks (tests/smoke-hooks/) that the release packages never contain.
 *
 * Usage:  node tools/smoke-test-firefox.mjs [--out=<dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/firefox.mjs';
import { startServer } from './lib/serve.mjs';
import { ROOT, manifestFor, writeUnpacked } from './lib/targets.mjs';

const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? path.resolve(outArg.slice(6)) : path.join(ROOT, 'dist', 'smoke-firefox');
const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'; // Google for Developers (public channel)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- test copy with hooks

const HOOKS = path.join(ROOT, 'tests', 'smoke-hooks');
const manifest = manifestFor('firefox');
manifest.background.scripts.push('test/background-hook.js');
manifest.host_permissions.push('http://127.0.0.1/*');
manifest.content_scripts.find((cs) => cs.world !== 'MAIN').js.push('test/content-hook.js');
manifest.content_scripts.push({ matches: ['http://127.0.0.1/*'], js: ['test/content-hook.js'], run_at: 'document_idle' });
const extensionDir = writeUnpacked('firefox', path.join(ROOT, 'dist', 'firefox-smoke'), manifest);
fs.mkdirSync(path.join(extensionDir, 'test'), { recursive: true });
for (const file of ['content-hook.js', 'background-hook.js']) fs.copyFileSync(path.join(HOOKS, file), path.join(extensionDir, 'test', file));

// Page side of the hook: window.__ss(ms, op, ...args) → result from SubSweep's content script.
const CLIENT = `window.__ss = window.__ss || ((ms, op, ...args) => new Promise((resolve, reject) => {
  const id = Math.random().toString(36).slice(2);
  const timer = setTimeout(() => { removeEventListener('message', onMessage); reject(new Error('no answer to ' + op)); }, ms);
  function onMessage(event) {
    const data = event.data;
    if (!data || data.type !== 'subsweep-test:res' || data.id !== id) return;
    removeEventListener('message', onMessage);
    clearTimeout(timer);
    data.error ? reject(new Error(data.error)) : resolve(data.value);
  }
  addEventListener('message', onMessage);
  postMessage({ type: 'subsweep-test:req', id, op, args }, '*');
}));`;
const call = (page, ms, op, args) => page.evaluate(`${CLIENT}; window.__ss(${ms}, ${JSON.stringify(op)}, ...${JSON.stringify(args)})`);
const hook = (page, op, ...args) => call(page, 20000, op, args);
/** For polling: gives up quickly (e.g. while the page is still loading). */
const quickHook = (page, op, ...args) => call(page, 2000, op, args);

async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // not there yet
    }
    if (Date.now() > end) return null;
    await sleep(250);
  }
}

// ---------------------------------------------------------------- checks

const server = await startServer(ROOT);
const otherUrl = server.page('/__other.html', '<!doctype html><title>Other tab</title><h1>Not YouTube</h1>');
const firefox = await launch();

try {
  // A YouTube tab that was already open before SubSweep was installed.
  const youtube = await firefox.newPage({ width: 1280, height: 800 });
  await youtube.goto('https://www.youtube.com/');
  await sleep(2500);
  await youtube.evaluate('window.__openedBeforeInstall = true');

  check('Extension installs in Firefox (manifest accepted)', Boolean(await firefox.loadExtension(extensionDir)), firefox.extensionId);
  const other = await firefox.newPage({ width: 1280, height: 800 });
  await other.goto(otherUrl);
  await other.activate();
  check('Access to youtube.com granted', (await waitFor(() => quickHook(other, 'permissions'))) === true);

  const fromOther = await hook(other, 'click', 'other');
  check('Toolbar on a non-YouTube tab switches to the open YouTube tab (no new tab)', fromOther.result === 'existing' && fromOther.tabsAfter === fromOther.tabsBefore, JSON.stringify(fromOther));
  await sleep(1500);
  check('That tab was not reloaded', await youtube.evaluate('window.__openedBeforeInstall === true'));
  check('Panel opened there', Boolean(await waitFor(() => quickHook(youtube, 'isOpen'), 5000)));

  const onYouTube = await hook(youtube, 'click', 'youtube');
  check('Toolbar on the YouTube tab toggles the panel in place', onYouTube.result === 'current' && !(await hook(youtube, 'isOpen')), JSON.stringify(onYouTube));

  const config = await hook(youtube, 'config');
  check('Page bridge answers (MAIN world)', Boolean(config && config.ready), JSON.stringify(config));

  const feed = await hook(youtube, 'lastUpload', CHANNEL);
  const feedAge = feed && feed.t ? Math.round((Date.now() - feed.t) / 86400000) : null;
  check('Latest upload via fetchLastUpload', Boolean(feed && feed.t), `${JSON.stringify(feed)} (${feedAge} days ago)`);

  const pageAge = await hook(youtube, 'videosTabAge', CHANNEL);
  check('Channel Videos tab via youtubei (fallback path)', pageAge != null, pageAge != null ? `${Math.round(pageAge / 86400000)} days ago` : 'no "… ago" label found');

  await youtube.evaluate('history.pushState({}, "", "/feed/channels"); document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }))');
  await sleep(500);
  const launcher = await youtube.evaluate('Boolean(document.querySelector("[data-subsweep=launcher]")) && document.querySelector("[data-subsweep=launcher]").style.display !== "none"');
  check('Launcher button appears after navigating to /feed/channels', launcher);
  await youtube.screenshot(path.join(OUT, 'youtube-launcher.png'));

  await hook(youtube, 'open');
  await sleep(1200);
  const state = await hook(youtube, 'appState');
  check('Panel opens and initialises', state.ready, JSON.stringify(state));
  await youtube.screenshot(path.join(OUT, 'youtube-panel.png'));

  const ownErrors = youtube.errors.filter((e) => /subsweep/i.test(e));
  check('No SubSweep errors in the page console', ownErrors.length === 0, ownErrors.join(' | '));

  // No YouTube tab at all: the button opens the YouTube home page with the panel.
  await youtube.close();
  await sleep(800);
  await other.activate();
  const fresh = await hook(other, 'click', 'other');
  check('With no YouTube tab, the toolbar opens a new tab', fresh.result === 'new' && fresh.tabsAfter === fresh.tabsBefore + 1, JSON.stringify(fresh));
  const opened = await waitFor(async () => (await firefox.pages()).find((p) => p.url.startsWith('https://www.youtube.com')), 15000);
  check('…on the YouTube home page (not the heavy subscriptions page)', Boolean(opened) && new URL(opened.url).pathname === '/', opened && opened.url);
  if (opened) {
    const page = await firefox.attach(opened.targetId);
    check('…and the panel opens there by itself', Boolean(await waitFor(() => quickHook(page, 'isOpen'), 20000)));
    await page.screenshot(path.join(OUT, 'youtube-home-panel.png'));
  }
} catch (error) {
  check('Smoke test ran to completion', false, error.message);
} finally {
  await firefox.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${path.relative(ROOT, OUT)}`);
process.exit(failed ? 1 : 0);
