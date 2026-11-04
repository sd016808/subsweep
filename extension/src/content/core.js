/*
 * SubSweep — shared helpers: errors, timing, i18n, formatting and a tiny DOM builder.
 * All content-script files attach to the `SubSweep` namespace in load order.
 */
(() => {
  'use strict';

  // core.js always loads first and starts a fresh namespace, so a copy injected after an
  // update never reuses objects from an older copy that may still be in this page.
  const NS = (globalThis.SubSweep = {});
  const DAY = 24 * 60 * 60 * 1000;

  class SweepError extends Error {
    /** @param {'session'|'network'|'rate'|'format'|'generic'} code */
    constructor(code, detail) {
      super(detail ? `${code}: ${detail}` : code);
      this.name = 'SweepError';
      this.code = code;
      this.detail = detail || '';
    }
  }

  function abortError() {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
  }

  const isAbort = (error) => Boolean(error) && error.name === 'AbortError';

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  const jitter = (min, max) => min + Math.random() * (max - min);

  const startOfDay = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const addDays = (ms, days) => {
    const d = new Date(ms);
    d.setDate(d.getDate() + days);
    return d.getTime();
  };

  const monthsAgo = (months, now = Date.now()) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d.getTime();
  };

  /**
   * Runs `worker` over `items` with at most `limit` in flight. If a worker throws,
   * no new items start and the error is rethrown once every running worker has
   * finished (so nothing keeps running in the background after we return).
   */
  async function pool(items, limit, worker, signal) {
    let next = 0;
    let failure = null;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length && !failure) {
        try {
          throwIfAborted(signal);
          const index = next++;
          await worker(items[index], index);
        } catch (error) {
          if (!failure) failure = error;
        }
      }
    });
    await Promise.all(runners);
    if (failure) throw failure;
  }

  /**
   * The extension API with promise-returning methods: `browser` in Firefox (and newer
   * Chrome), otherwise `chrome`.
   */
  function api() {
    return globalThis.browser ?? globalThis.chrome;
  }

  /** False once the extension was reloaded/updated and this copy of the script is orphaned. */
  function contextAlive() {
    try {
      const ext = api();
      return Boolean(ext && ext.runtime && ext.runtime.id);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- i18n

  const hasChromeI18n = () =>
    typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function';

  /** Translates `key`; `{0}`, `{1}`… are replaced with the extra arguments. */
  function t(key, ...args) {
    let message = '';
    try {
      message = hasChromeI18n() ? chrome.i18n.getMessage(key) : '';
    } catch {
      message = '';
    }
    if (!message) message = key;
    if (!args.length) return message;
    return message.replace(/\{(\d+)\}/g, (match, index) => (args[+index] !== undefined ? String(args[+index]) : match));
  }

  let cachedLocale = null;
  /** BCP 47 tag of the language the UI is actually shown in (matches the chosen _locales folder). */
  function locale() {
    if (cachedLocale) return cachedLocale;
    const fromMessages = t('localeCode');
    cachedLocale = fromMessages && fromMessages !== 'localeCode' ? fromMessages : 'en';
    return cachedLocale;
  }

  // Intl objects are relatively expensive to create; the list formats thousands of values.
  const formatters = new Map();
  function formatter(kind, options) {
    const key = `${kind}:${JSON.stringify(options || {})}`;
    if (!formatters.has(key)) formatters.set(key, new Intl[kind](locale(), options));
    return formatters.get(key);
  }

  function unit(value, unitName) {
    try {
      return formatter('NumberFormat', { style: 'unit', unit: unitName, unitDisplay: 'long' }).format(value);
    } catch {
      return `${value} ${unitName}${value === 1 ? '' : 's'}`;
    }
  }

  const fmt = {
    locale,
    num: (n) => formatter('NumberFormat').format(n),
    months: (n) => unit(n, 'month'),
    date: (ms) => formatter('DateTimeFormat', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ms)),
    /** "3 months ago", "yesterday"… With `precise`, recent times use hours/minutes. */
    relative(ms, options = {}) {
      const now = options.now || Date.now();
      // "today"/"yesterday" read naturally, but "last year" is ambiguous for something
      // 23 months old, so weeks/months/years always use numbers ("1 year ago").
      const auto = formatter('RelativeTimeFormat', { numeric: 'auto' });
      const always = formatter('RelativeTimeFormat', { numeric: 'always' });
      const diff = now - ms;
      if (options.precise && diff < DAY) {
        if (diff < 60 * 1000) return auto.format(0, 'second');
        if (diff < 60 * 60 * 1000) return always.format(-Math.floor(diff / 60000), 'minute');
        return always.format(-Math.floor(diff / 3600000), 'hour');
      }
      const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
      if (days < 1) return auto.format(0, 'day');
      if (days < 7) return auto.format(-days, 'day');
      if (days < 30) return always.format(-Math.floor(days / 7), 'week');
      if (days < 365) return always.format(-Math.max(1, Math.floor(days / 30.44)), 'month');
      return always.format(-Math.floor(days / 365.25), 'year');
    },
    /** Rough duration such as "about 3 minutes" (the "about" comes from the message). */
    duration(ms) {
      if (ms < 60 * 1000) return unit(Math.max(5, Math.round(ms / 5000) * 5), 'second');
      return unit(Math.max(1, Math.round(ms / 60000)), 'minute');
    },
  };

  // ---------------------------------------------------------------- DOM

  /**
   * Minimal element builder. Text is always inserted as text nodes (never parsed as
   * HTML), which keeps channel names safe and works with YouTube's Trusted Types CSP.
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        else if (key === 'style') Object.assign(el.style, value);
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'indeterminate') el[key] = value;
        else el.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false || child === true) continue;
      el.append(typeof child === 'object' && 'nodeType' in child ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  NS.util = {
    DAY,
    SweepError,
    abortError,
    isAbort,
    throwIfAborted,
    sleep,
    jitter,
    startOfDay,
    addDays,
    monthsAgo,
    pool,
    api,
    contextAlive,
    t,
    fmt,
    h,
  };
})();
