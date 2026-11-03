#!/usr/bin/env node
/*
 * Smoke test against the real www.youtube.com (signed out) in headless Chrome:
 *   - loads the unpacked extension (validates the manifest);
 *   - toolbar button: switches to an already-open YouTube tab and opens the panel there
 *     by injecting the scripts (no reload, no new tab); toggles on a YouTube tab; opens the
 *     YouTube home page only when no YouTube tab exists;
 *   - checks the content scripts and the MAIN-world bridge are talking;
 *   - fetches a public channel's feed and Videos tab and parses the latest upload;
 *   - checks the launcher button and the panel.
 *
 * Signed-in features (subscriptions, history, unsubscribe) need your own account:
 * test those manually (see README).
 *
 * Usage:  node tools/smoke-test.mjs [--out=<dir>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? path.resolve(outArg.slice(6)) : path.join(ROOT, 'dist', 'smoke');
const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'; // Google for Developers (public channel)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const chrome = await launch({ extensionDebugging: true });

/** Simulates a click on the toolbar button while `which` tab is active. */
const clickToolbar = (which) =>
  chrome.evaluateInServiceWorker(`(async () => {
    const tabs = await chrome.tabs.query({});
    const isYouTube = (t) => Boolean(t.url) && t.url.startsWith('https://www.youtube.com/');
    const tab = ${which === 'youtube' ? 'tabs.find(isYouTube)' : 'tabs.find((t) => !isYouTube(t) && t.active) || tabs.find((t) => !isYouTube(t))'};
    const result = await SubSweepBackground.handleClick(tab);
    await new Promise((r) => setTimeout(r, 300));
    return { result, tabsBefore: tabs.length, tabsAfter: (await chrome.tabs.query({})).length };
  })()`);

try {
  // A YouTube tab that was already open before SubSweep was installed.
  const youtube = await chrome.newPage({ width: 1280, height: 800 });
  await youtube.goto('https://www.youtube.com/'); // signed out, /feed/channels would redirect to sign-in
  await sleep(2500);
  await youtube.evaluate('window.__openedBeforeInstall = true');

  check('Extension loads (manifest accepted)', Boolean(await chrome.loadExtension(path.join(ROOT, 'extension'))), chrome.extensionId);

  // Toolbar button on another tab while that YouTube tab exists.
  const other = await chrome.newPage({ width: 1280, height: 800 });
  await other.activate();
  const fromOther = await clickToolbar('other');
  check('Toolbar on a non-YouTube tab switches to the open YouTube tab (no new tab)', fromOther.result === 'existing' && fromOther.tabsAfter === fromOther.tabsBefore, JSON.stringify(fromOther));
  await sleep(1500);
  const notReloaded = await youtube.evaluate('window.__openedBeforeInstall === true');
  check('That tab was not reloaded (scripts injected instead)', notReloaded);
  check('Panel opened there', await youtube.evaluateInExtension('SubSweep.Panel.isOpen()'));

  const onYouTube = await clickToolbar('youtube');
  check('Toolbar on the YouTube tab toggles the panel in place', onYouTube.result === 'current' && !(await youtube.evaluateInExtension('SubSweep.Panel.isOpen()')), JSON.stringify(onYouTube));

  // Content scripts, bridge and data access.
  const config = await youtube.evaluateInExtension('SubSweep.YT.config()');
  check('Page bridge answers (MAIN world)', Boolean(config && config.ready), JSON.stringify(config));

  const feed = await youtube.evaluateInExtension(`SubSweep.YT.fetchLastUpload(${JSON.stringify(CHANNEL)})`);
  const feedAge = feed && feed.t ? Math.round((Date.now() - feed.t) / 86400000) : null;
  check('Latest upload via fetchLastUpload', Boolean(feed && feed.t), `${JSON.stringify(feed)} (${feedAge} days ago)`);

  const pageAge = await youtube.evaluateInExtension(
    `SubSweep.YT.request('browse', { browseId: ${JSON.stringify(CHANNEL)}, params: 'EgZ2aWRlb3PyBgQKAjoA' }, { hl: 'en' }).then((json) => SubSweep.parse.newestRelativeAge(json))`,
  );
  check('Channel Videos tab via youtubei (fallback path)', pageAge != null, pageAge != null ? `${Math.round(pageAge / 86400000)} days ago` : 'no "… ago" label found');

  // Simulate YouTube's in-app navigation to the subscriptions page.
  await youtube.evaluate('history.pushState({}, "", "/feed/channels"); document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }))');
  await sleep(500);
  const launcher = await youtube.evaluate('Boolean(document.querySelector("[data-subsweep=launcher]")) && document.querySelector("[data-subsweep=launcher]").style.display !== "none"');
  check('Launcher button appears after navigating to /feed/channels', launcher);
  await youtube.screenshot(path.join(OUT, 'youtube-launcher.png'));

  await youtube.evaluateInExtension('SubSweep.Panel.open()');
  await sleep(1200);
  const state = await youtube.evaluateInExtension('({ ready: SubSweep.App.state.ready, loggedIn: SubSweep.App.state.loggedIn })');
  check('Panel opens and initialises', state.ready, JSON.stringify(state));
  await youtube.screenshot(path.join(OUT, 'youtube-panel.png'));

  const ownErrors = youtube.errors.filter((e) => /subsweep/i.test(e));
  check('No SubSweep errors in the page console', ownErrors.length === 0, ownErrors.join(' | '));

  // No YouTube tab at all: the button opens the YouTube home page with the panel.
  await youtube.close();
  await sleep(800); // let Chrome finish closing the tab
  await other.activate();
  const fresh = await clickToolbar('other');
  check('With no YouTube tab, the toolbar opens a new tab', fresh.result === 'new' && fresh.tabsAfter === fresh.tabsBefore + 1, JSON.stringify(fresh));
  await sleep(6000);
  const opened = (await chrome.pages()).find((p) => p.url.startsWith('https://www.youtube.com'));
  check('…on the YouTube home page (not the heavy subscriptions page)', Boolean(opened) && new URL(opened.url).pathname === '/', opened && opened.url);
  if (opened) {
    const page = await chrome.attach(opened.targetId);
    await sleep(500);
    check('…and the panel opens there by itself', await page.evaluateInExtension('SubSweep.Panel.isOpen()'));
  }
} catch (error) {
  check('Smoke test ran to completion', false, error.message);
} finally {
  await chrome.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${path.relative(ROOT, OUT)}`);
process.exit(failed ? 1 : 0);
