/*
 * SubSweep — background script (a service worker in Chrome, an event page in Firefox).
 *
 * Toolbar button:
 *   1. On a YouTube tab → open/close the panel right there.
 *   2. Elsewhere, but a YouTube tab is already open → switch to it and open the panel.
 *   3. No YouTube tab at all → open the YouTube home page and show the panel once it loads.
 * A YouTube tab that was open before SubSweep was installed or updated gets SubSweep's
 * packaged scripts injected, so it doesn't have to reload. Nothing here touches user data.
 */
'use strict';

// Promise-returning extension API: `browser` in Firefox (and newer Chrome), else `chrome`.
const ext = globalThis.browser ?? globalThis.chrome;

const YOUTUBE_ACCESS = { origins: ['https://www.youtube.com/*'] };
const YOUTUBE_TAB = /^https:\/\/www\.youtube\.com\//;
const YOUTUBE_HOME = 'https://www.youtube.com/';
const PENDING_KEY = 'pendingOpenTabs';

async function getPending() {
  const stored = await ext.storage.session.get(PENDING_KEY);
  return Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] : [];
}

async function setPending(list) {
  await ext.storage.session.set({ [PENDING_KEY]: list });
}

async function markPending(tabId) {
  const list = await getPending();
  if (!list.includes(tabId)) list.push(tabId);
  await setPending(list);
}

/** Returns true (once) if the panel should open automatically in this tab. */
async function consumePending(tabId) {
  const list = await getPending();
  const index = list.indexOf(tabId);
  if (index === -1) return false;
  list.splice(index, 1);
  await setPending(list);
  return true;
}

const INJECT_TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/** Injects SubSweep's own packaged content scripts into an already-open YouTube tab. */
async function inject(tabId) {
  const scripts = ext.runtime.getManifest().content_scripts;
  const main = scripts.find((cs) => cs.world === 'MAIN');
  const isolated = scripts.find((cs) => cs.world !== 'MAIN');
  // The page has finished loading long ago, so there is no need to wait for "idle".
  if (main) await ext.scripting.executeScript({ target: { tabId }, files: main.js, world: 'MAIN', injectImmediately: true });
  await ext.scripting.executeScript({ target: { tabId }, files: isolated.js, injectImmediately: true });
}

/** Shows the panel in a YouTube tab; returns false if that wasn't possible. */
async function showPanel(tabId, type) {
  try {
    await ext.tabs.sendMessage(tabId, { type });
    return true;
  } catch {
    // No SubSweep in this tab yet (opened before install/update).
  }
  try {
    // Never let the toolbar button hang: injection into a tab that isn't visible yet can wait.
    await withTimeout(inject(tabId), INJECT_TIMEOUT_MS);
    await ext.tabs.sendMessage(tabId, { type: 'subsweep:open' });
    return true;
  } catch {
    // Injection not possible or too slow: reload as a last resort.
  }
  try {
    await markPending(tabId);
    await ext.tabs.reload(tabId);
    return true;
  } catch {
    return false;
  }
}

/** The best already-open YouTube tab: same window first, not playing sound, most recently used. */
async function findYouTubeTab(current) {
  const tabs = await ext.tabs.query({ url: 'https://www.youtube.com/*' });
  if (!tabs.length) return null;
  const score = (tab) => (current && tab.windowId === current.windowId ? 2 : 0) + (tab.audible ? 0 : 1);
  tabs.sort((a, b) => score(b) - score(a) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function handleClick(tab) {
  if (tab && tab.id != null && tab.url && YOUTUBE_TAB.test(tab.url)) {
    if (await showPanel(tab.id, 'subsweep:toggle')) return 'current';
  }
  const existing = await findYouTubeTab(tab);
  if (existing) {
    await ext.tabs.update(existing.id, { active: true });
    if (ext.windows) await ext.windows.update(existing.windowId, { focused: true }); // no windows on Android
    if (await showPanel(existing.id, 'subsweep:open')) return 'existing';
  }
  const created = await ext.tabs.create({ url: YOUTUBE_HOME });
  if (created && created.id != null) await markPending(created.id);
  return 'new';
}

ext.action.onClicked.addListener((tab) => {
  // Access to youtube.com can be withdrawn by the user (Firefox: Add-ons → Permissions;
  // Chrome: Site access). Asking again needs the click itself, so this must happen before
  // anything is awaited. When access is already granted it answers at once, without a prompt.
  ext.permissions
    .request(YOUTUBE_ACCESS)
    .catch(() => true) // couldn't ask: just try
    .then((granted) => (granted ? handleClick(tab) : null))
    .catch((error) => console.warn('[SubSweep]', error));
});

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'subsweep:ready' || !sender.tab || sender.tab.id == null) return false;
  consumePending(sender.tab.id)
    .then((open) => sendResponse({ open }))
    .catch(() => sendResponse({ open: false }));
  return true; // keep the channel open for the async response
});

ext.tabs.onRemoved.addListener((tabId) => {
  consumePending(tabId).catch(() => {});
});

// Exposed for the automated smoke test (tools/smoke-test.mjs).
self.SubSweepBackground = { handleClick };
