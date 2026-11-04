/*
 * TEST ONLY — never part of a release package (added by tools/smoke-test-firefox.mjs).
 * Firefox's automation can't evaluate code inside an extension's content script, so the
 * smoke test talks to SubSweep through this hook: the page posts { op, args } and gets the
 * result back. Only the fixed operations below exist.
 */
(() => {
  'use strict';

  if (globalThis.__subsweepTestHook) return;
  globalThis.__subsweepTestHook = true;

  const ext = globalThis.browser;
  const NS = () => globalThis.SubSweep; // re-read: an injected copy replaces the namespace
  const VIDEOS_TAB = 'EgZ2aWRlb3PyBgQKAjoA';

  const ops = {
    click: (which) => ext.runtime.sendMessage({ type: 'subsweep-test:click', which }),
    permissions: () => ext.runtime.sendMessage({ type: 'subsweep-test:permissions' }),
    loaded: () => Boolean(NS() && NS().Panel),
    isOpen: () => NS().Panel.isOpen(),
    open: () => NS().Panel.open(),
    config: () => NS().YT.config(),
    lastUpload: (channelId) => NS().YT.fetchLastUpload(channelId),
    videosTabAge: (channelId) =>
      NS()
        .YT.request('browse', { browseId: channelId, params: VIDEOS_TAB }, { hl: 'en' })
        .then((json) => NS().parse.newestRelativeAge(json)),
    appState: () => ({ ready: NS().App.state.ready, loggedIn: NS().App.state.loggedIn }),
  };

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.type !== 'subsweep-test:req' || !ops[data.op]) return;
    let reply;
    try {
      reply = { value: await ops[data.op](...(data.args || [])) };
    } catch (error) {
      const message = String((error && error.message) || error);
      reply = { error: error && error.stack ? `${message}\n${error.stack}` : message };
    }
    window.postMessage(JSON.parse(JSON.stringify({ type: 'subsweep-test:res', id: data.id, ...reply })), '*');
  });
})();
