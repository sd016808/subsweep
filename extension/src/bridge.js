/*
 * Copyright (c) 2026 sd016808 <sd016808@gmail.com>. All rights reserved.
 *
 * SubSweep — page bridge (runs in the page's MAIN world on www.youtube.com).
 *
 * YouTube's own web app talks to its "youtubei" endpoints with the signed-in
 * session of the page. This small bridge lets SubSweep's content script make the
 * same requests YouTube's page makes when you open your subscriptions or history
 * page, or press "Unsubscribe". It only allows a fixed list of endpoints, never
 * stores anything, and never sends data anywhere except www.youtube.com.
 */
(() => {
  'use strict';

  if (window.__subsweepBridgeInstalled) return;
  Object.defineProperty(window, '__subsweepBridgeInstalled', { value: true });

  const REQUEST = 'subsweep:req';
  const RESPONSE = 'subsweep:res';
  const ALLOWED_ENDPOINTS = new Set(['browse', 'subscription/subscribe', 'subscription/unsubscribe']);

  function cfg(key) {
    try {
      const yt = window.ytcfg;
      if (!yt) return undefined;
      if (typeof yt.get === 'function') {
        const value = yt.get(key);
        if (value !== undefined) return value;
      }
      return yt.data_ ? yt.data_[key] : undefined;
    } catch {
      return undefined;
    }
  }

  function readCookie(name) {
    for (const part of document.cookie.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() === name) {
        try {
          return decodeURIComponent(part.slice(eq + 1).trim());
        } catch {
          return part.slice(eq + 1).trim();
        }
      }
    }
    return null;
  }

  async function sha1Hex(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Same request signature YouTube's web client attaches to signed-in requests. */
  async function authorizationHeader() {
    const origin = location.origin;
    const now = Math.floor(Date.now() / 1000);
    const schemes = [
      ['SAPISIDHASH', readCookie('SAPISID') || readCookie('__Secure-3PAPISID')],
      ['SAPISID1PHASH', readCookie('__Secure-1PAPISID')],
      ['SAPISID3PHASH', readCookie('__Secure-3PAPISID')],
    ];
    const parts = [];
    for (const [scheme, sid] of schemes) {
      if (sid) parts.push(`${scheme} ${now}_${await sha1Hex(`${now} ${sid} ${origin}`)}`);
    }
    return parts.join(' ');
  }

  function buildContext(options) {
    const base = cfg('INNERTUBE_CONTEXT');
    const context = base
      ? JSON.parse(JSON.stringify(base))
      : { client: { clientName: 'WEB', clientVersion: cfg('INNERTUBE_CLIENT_VERSION') || '2.20250101.00.00' } };
    context.client = context.client || {};
    if (options && typeof options.hl === 'string') context.client.hl = options.hl;
    return context;
  }

  async function innertube(endpoint, body, options) {
    if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new Error(`Endpoint not allowed: ${endpoint}`);
    const context = buildContext(options);
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
      'X-Youtube-Client-Name': String(cfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? 1),
      'X-Youtube-Client-Version': String(cfg('INNERTUBE_CLIENT_VERSION') || context.client.clientVersion || ''),
    };
    const auth = await authorizationHeader();
    if (auth) headers.Authorization = auth;
    const pageId = cfg('DELEGATED_SESSION_ID');
    if (pageId) headers['X-Goog-PageId'] = String(pageId);
    if (context.client.visitorData) headers['X-Goog-Visitor-Id'] = context.client.visitorData;

    const key = cfg('INNERTUBE_API_KEY');
    const url = `/youtubei/v1/${endpoint}?prettyPrint=false${key ? `&key=${encodeURIComponent(key)}` : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(Object.assign({}, body, { context })),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  }

  function config() {
    return {
      ready: Boolean(window.ytcfg),
      loggedIn: Boolean(cfg('LOGGED_IN')),
      accountId: String(cfg('DATASYNC_ID') || ''),
      pageId: String(cfg('DELEGATED_SESSION_ID') || ''),
    };
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.type !== REQUEST || typeof data.id !== 'string') return;

    let result = null;
    let error = null;
    try {
      if (data.op === 'config') {
        result = config();
      } else if (data.op === 'innertube' && data.payload) {
        result = await innertube(String(data.payload.endpoint), data.payload.body || {}, data.payload.options || {});
      } else {
        throw new Error(`Unknown operation: ${data.op}`);
      }
    } catch (err) {
      error = String((err && err.message) || err);
    }
    window.postMessage({ type: RESPONSE, id: data.id, result, error }, location.origin);
  });
})();
