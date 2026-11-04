// Picks the browser driver for the browser tests: BROWSER=firefox uses headless Firefox,
// anything else (default) headless Chrome. Both drivers offer the same page API.
export const browserName = (process.env.BROWSER || 'chrome').toLowerCase() === 'firefox' ? 'firefox' : 'chrome';

export async function launch(options) {
  const driver = browserName === 'firefox' ? await import('./firefox.mjs') : await import('./chrome.mjs');
  return driver.launch(options);
}
