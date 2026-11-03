/*
 * SubSweep — content script entry point.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  if (!NS || NS.started) return;
  NS.started = true;

  // If SubSweep was updated while this tab was open, an older copy may still be running
  // here. Ask it to step aside (it removes its panel and stops reacting), then take over.
  document.dispatchEvent(new CustomEvent('subsweep:takeover'));
  document.querySelectorAll('[data-subsweep]').forEach((el) => el.remove());
  document.addEventListener('subsweep:takeover', () => NS.Panel.retire(), { once: true });

  NS.Panel.boot();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || NS.retired) return false;
    if (message.type === 'subsweep:toggle') NS.Panel.toggle();
    else if (message.type === 'subsweep:open') NS.Panel.open();
    else return false;
    sendResponse({ ok: true });
    return false;
  });

  // Ask the background whether this tab was opened from the toolbar button.
  chrome.runtime
    .sendMessage({ type: 'subsweep:ready' })
    .then((response) => {
      if (response && response.open) NS.Panel.open();
    })
    .catch(() => {});

  // YouTube is a single-page app: refresh the launcher button after in-app navigation.
  const onNavigate = () => {
    if (!NS.retired) NS.Panel.onNavigate();
  };
  document.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('popstate', onNavigate);
})();
