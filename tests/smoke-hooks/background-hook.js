/*
 * TEST ONLY — never part of a release package (added by tools/smoke-test-firefox.mjs).
 * Simulates a click on the toolbar button (same as tools/smoke-test.mjs does in Chrome).
 */
'use strict';

browser.runtime.onMessage.addListener((message) => {
  if (!message) return undefined;
  if (message.type === 'subsweep-test:permissions') {
    return browser.permissions.contains({ origins: ['https://www.youtube.com/*'] });
  }
  if (message.type !== 'subsweep-test:click') return undefined;
  return (async () => {
    const tabs = await browser.tabs.query({});
    const isYouTube = (t) => Boolean(t.url) && t.url.startsWith('https://www.youtube.com/');
    const tab =
      message.which === 'youtube' ? tabs.find(isYouTube) : tabs.find((t) => !isYouTube(t) && t.active) || tabs.find((t) => !isYouTube(t));
    const result = await self.SubSweepBackground.handleClick(tab);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { result, tabsBefore: tabs.length, tabsAfter: (await browser.tabs.query({})).length };
  })();
});
