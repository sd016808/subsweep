/*
 * SubSweep — local storage (chrome.storage.local). Nothing is synced or uploaded.
 * Data is kept per YouTube account under a hashed key.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  const SETTINGS_KEY = 'settings:v1';
  const ACCOUNT_PREFIX = 'acct:';
  const PARTIAL_PREFIX = 'partial:';
  const MAX_REMOVED_LOG = 1000;

  const DEFAULTS = Object.freeze({
    mode: 'suggested',
    sort: 'upload',
    inactiveMonths: 6,
    unwatchedMonths: 6,
    historyMonths: 12,
    includeNoVideos: true,
    includeNeverWatched: true,
    speed: 'fast',
    showLauncher: true,
    uploadsCacheHours: 24,
  });

  const CHOICES = {
    mode: ['suggested', 'inactive', 'unwatched', 'both', 'all', 'kept'],
    sort: ['upload', 'watched', 'name'],
    speed: ['fast', 'normal', 'gentle'],
  };

  const emptyAccount = () => ({
    v: 1,
    subs: {},
    subsOrder: [],
    subsSyncedAt: 0,
    lastScanAt: 0,
    uploads: {},
    watch: {},
    history: null,
    historyPartial: null, // checkpoint of an unfinished watch-history read (see app.js)
    historyError: null,
    unsubQueue: null, // channels still waiting in an interrupted bulk unsubscribe
    batchSupport: null, // does YouTube honour several channels per unsubscribe request? (learned)
    takeout: null,
    kept: {},
    removed: [],
  });

  const area = () => chrome.storage.local;

  function sanitizeSettings(raw) {
    const settings = { ...DEFAULTS };
    if (raw && typeof raw === 'object') {
      for (const key of Object.keys(DEFAULTS)) {
        const value = raw[key];
        if (typeof value !== typeof DEFAULTS[key]) continue;
        if (CHOICES[key] && !CHOICES[key].includes(value)) continue;
        if (typeof value === 'number' && !(value > 0 && value <= 120)) continue;
        settings[key] = value;
      }
    }
    if (settings.unwatchedMonths > settings.historyMonths) settings.historyMonths = settings.unwatchedMonths;
    return settings;
  }

  async function loadSettings() {
    const stored = await area().get(SETTINGS_KEY);
    return sanitizeSettings(stored[SETTINGS_KEY]);
  }

  async function saveSettings(settings) {
    await area().set({ [SETTINGS_KEY]: settings });
  }

  /** Short, non-reversible key for the signed-in account. */
  async function accountKey(rawId) {
    const input = `subsweep:${rawId || 'default'}`;
    if (globalThis.crypto && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 0;
    for (let i = 0; i < input.length; i++) hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
    return `h${(hash >>> 0).toString(16)}`;
  }

  async function loadAccount(key) {
    const storageKey = ACCOUNT_PREFIX + key;
    const partialKey = PARTIAL_PREFIX + key;
    const stored = await area().get([storageKey, partialKey]);
    const data = Object.assign(emptyAccount(), stored[storageKey] || {});
    if (!Array.isArray(data.subsOrder)) data.subsOrder = [];
    if (!Array.isArray(data.removed)) data.removed = [];
    data.historyPartial = stored[partialKey] || data.historyPartial || null;
    return data;
  }

  /** Saves everything; the history checkpoint lives under its own (small) key. */
  async function saveAccount(key, data) {
    if (data.removed.length > MAX_REMOVED_LOG) data.removed.length = MAX_REMOVED_LOG;
    const { historyPartial, ...rest } = data;
    await area().set({ [ACCOUNT_PREFIX + key]: { ...rest, historyPartial: null } });
    if (historyPartial) await area().set({ [PARTIAL_PREFIX + key]: historyPartial });
    else await area().remove(PARTIAL_PREFIX + key);
  }

  /** Cheap checkpoint during a scan: writes only the history-read progress. */
  async function savePartial(key, partial) {
    await area().set({ [PARTIAL_PREFIX + key]: partial });
  }

  async function clearAll() {
    const everything = await area().get(null);
    const keys = Object.keys(everything).filter((k) => k.startsWith(ACCOUNT_PREFIX) || k.startsWith(PARTIAL_PREFIX) || k === SETTINGS_KEY);
    if (keys.length) await area().remove(keys);
  }

  NS.Store = {
    DEFAULTS,
    defaults: () => ({ ...DEFAULTS }),
    emptyAccount,
    sanitizeSettings,
    loadSettings,
    saveSettings,
    accountKey,
    loadAccount,
    saveAccount,
    savePartial,
    clearAll,
  };
})();
