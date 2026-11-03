// Preview-only stand-ins for the chrome.* APIs and the YouTube page bridge.
// Lets the real content scripts render with mock data in a normal web page.
(() => {
  const messages = window.__MESSAGES || {};
  // Backed by sessionStorage so tests can reload the page; every new tab starts empty.
  const STORE_KEY = '__subsweep_stub_storage';
  const memory = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}');
  const persist = () => sessionStorage.setItem(STORE_KEY, JSON.stringify(memory));
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  window.chrome = {
    i18n: {
      getMessage: (key) => (messages[key] && messages[key].message) || '',
      getUILanguage: () => (messages.localeCode && messages.localeCode.message) || 'en',
    },
    runtime: {
      id: 'subsweep-preview', // a live extension context (see SubSweep.util.contextAlive)
      getManifest: () => ({ version: window.__VERSION || '1.0.0' }),
      sendMessage: () => Promise.resolve({ open: false }),
      onMessage: { addListener() {} },
    },
    storage: {
      local: {
        async get(keys) {
          if (keys === null) return clone(memory);
          const out = {};
          for (const key of [].concat(keys)) {
            if (key in memory) out[key] = clone(memory[key]);
            else if (key.startsWith('acct:') && window.__MOCK_ACCOUNT) out[key] = clone(window.__MOCK_ACCOUNT);
            else if (key.startsWith('settings') && window.__MOCK_SETTINGS) out[key] = clone(window.__MOCK_SETTINGS);
          }
          return out;
        },
        async set(items) {
          Object.assign(memory, clone(items));
          persist();
        },
        async remove(keys) {
          for (const key of [].concat(keys)) delete memory[key];
          persist();
        },
      },
    },
  };

  // Fake page bridge: answers config requests and pretends every action succeeds.
  // Tests can set window.__INNERTUBE(endpoint, body) to return fake YouTube JSON
  // (return { __status: 400 } to simulate an HTTP error).
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || data.type !== 'subsweep:req') return;
    let result = null;
    if (data.op === 'config') result = { ready: true, loggedIn: window.__LOGGED_IN !== false, accountId: 'preview', pageId: '' };
    else if (data.op === 'innertube') {
      const json = window.__INNERTUBE ? await window.__INNERTUBE(data.payload.endpoint, data.payload.body) : {};
      result = json && json.__status ? { ok: false, status: json.__status, json: { error: { message: 'simulated' } } } : { ok: true, status: 200, json };
    }
    setTimeout(() => window.postMessage({ type: 'subsweep:res', id: data.id, result, error: null }, location.origin), 20);
  });
})();
