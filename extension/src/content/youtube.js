/*
 * Copyright (c) 2026 sd016808 <sd016808@gmail.com>. All rights reserved.
 *
 * SubSweep — talks to YouTube through the page bridge (see src/bridge.js) and the
 * public channel feeds. Every request goes to www.youtube.com only.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  const { sleep, SweepError, throwIfAborted, isAbort, startOfDay } = NS.util;
  const P = NS.parse;

  const REQUEST = 'subsweep:req';
  const RESPONSE = 'subsweep:res';
  // Tabs of a channel page (the `params` of a browse request). Videos, live streams and
  // Shorts each have their own tab; a channel without such a tab answers with another one.
  const VIDEOS_TAB = 'EgZ2aWRlb3PyBgQKAjoA';
  const LIVE_TAB = 'EgdzdHJlYW1z8gYECgJ6AA%3D%3D';
  const SHORTS_TAB = 'EgZzaG9ydHPyBgUKA5oBAA%3D%3D';
  const MAX_PAGES = 2000;
  // Lists are page chains (each page names the next), so they can't be fetched in
  // parallel; keep a short, polite pause between pages.
  const PAGE_PAUSE_MS = 100;

  let sequence = 0;
  const pending = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== RESPONSE || !pending.has(data.id)) return;
    const entry = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(new SweepError('network', String(data.error)));
    // Work on our own copy: in Firefox the posted data belongs to the page (slower to read,
    // some operations on it are blocked, and the page could change it afterwards).
    else entry.resolve(typeof structuredClone === 'function' ? structuredClone(data.result) : data.result);
  });

  function bridge(op, payload, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = `ss-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new SweepError('network', 'bridge timeout'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ type: REQUEST, id, op, payload }, location.origin);
    });
  }

  /** One youtubei request with retries for rate limits and transient errors. */
  async function call(endpoint, body, { hl, signal, retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      let response;
      try {
        response = await bridge('innertube', { endpoint, body, options: hl ? { hl } : {} });
      } catch (error) {
        if (attempt < retries) {
          await sleep(1500 * (attempt + 1), signal);
          continue;
        }
        throw error;
      }
      throwIfAborted(signal);
      const { ok, status, json } = response;
      if (ok && json && !json.error) return json;
      if (status === 401) throw new SweepError('session', String(status));
      const transient = status === 429 || status === 0 || status >= 500;
      if (transient && attempt < retries) {
        await sleep(status === 429 ? 8000 * (attempt + 1) : 2000 * (attempt + 1), signal);
        continue;
      }
      if (status === 429) throw new SweepError('rate', '429');
      if (status === 403) throw new SweepError('session', '403');
      const message = json && json.error && json.error.message;
      if (status === 400) throw new SweepError('badRequest', message || 'HTTP 400');
      throw new SweepError('generic', message || `HTTP ${status}`);
    }
  }

  async function config() {
    return bridge('config', null, 5000);
  }

  /** Every subscribed channel (paged through the "All subscriptions" list). */
  async function fetchSubscriptions({ signal, onProgress } = {}) {
    const seen = new Map();
    let json = await call('browse', { browseId: 'FEchannels' }, { signal });
    for (let page = 0; json && page < MAX_PAGES; page++) {
      for (const channel of P.parseChannels(json)) if (!seen.has(channel.id)) seen.set(channel.id, channel);
      if (onProgress) onProgress(seen.size);
      const token = P.lastContinuation(json);
      if (!token) break;
      await sleep(PAGE_PAUSE_MS, signal);
      json = await call('browse', { continuation: token }, { signal });
    }
    return [...seen.values()];
  }

  /**
   * Reads watch history newest-first until an entry is older than `cutoff`.
   * Dates come from the page's day headers, so we request English headers.
   *
   * `onPage({ entries, token, state })` runs after every page; `token` is where the
   * next page starts. Pass that `token` back as `startToken` (with `state`) to
   * continue an interrupted read later instead of starting over.
   * → { reachedEnd, edge }. When the cutoff was reached, `edge` is the position of the
   * page that crossed it ({ token, date, recognized }); reading from there later
   * extends the range without starting over.
   */
  async function fetchHistory({ cutoff, signal, startToken = null, state = null, onPage } = {}) {
    const parse = {
      now: Date.now(),
      date: state ? state.date : startOfDay(Date.now()),
      recognized: state ? Boolean(state.recognized) : false,
    };
    let pageToken = startToken;
    let json = startToken
      ? await call('browse', { continuation: startToken }, { hl: 'en', signal })
      : await call('browse', { browseId: 'FEhistory' }, { hl: 'en', signal });
    for (let page = 0; json && page < MAX_PAGES; page++) {
      const before = { token: pageToken, date: parse.date, recognized: parse.recognized };
      const entries = P.parseHistoryPage(json, parse);
      const next = P.lastContinuation(json);
      if (page === 0 && !entries.length) {
        // A saved position that leads nowhere has expired.
        if (startToken && !next) throw new SweepError('expired', 'history continuation');
        // Videos are there but not where we expect them: the page layout changed.
        if (!startToken && P.countVideoItems(json) > 0) throw new SweepError('format', 'history layout');
      }
      // Videos without any readable date header: refuse to guess.
      if (entries.length && !parse.recognized) throw new SweepError('format', 'history date headers');

      const kept = [];
      let crossed = false;
      for (const entry of entries) {
        if (entry.date < cutoff) {
          crossed = true;
          break;
        }
        kept.push(entry);
      }
      const token = crossed ? null : next;
      if (onPage) await onPage({ entries: kept, token, state: { date: parse.date, recognized: parse.recognized } });
      if (crossed) return { reachedEnd: false, edge: before };
      if (!token) return { reachedEnd: true, edge: null };
      await sleep(PAGE_PAUSE_MS, signal);
      pageToken = token;
      json = await call('browse', { continuation: token }, { hl: 'en', signal });
    }
    return { reachedEnd: false, edge: null };
  }

  // YouTube's channel feeds (RSS) are sometimes unavailable for everyone (every request
  // answers 404). After this many failures in a row, the rest of a scan stops asking for them.
  const FEED_GIVE_UP_AFTER = 5;

  /**
   * Remembers, for one scan, whether the channel feeds work. Any feed that works resets
   * the count, so a single broken channel doesn't switch them off; each scan starts with a
   * new tracker, so feeds are tried again as soon as YouTube serves them again.
   */
  function feedTracker() {
    let failuresInARow = 0;
    return {
      get usable() {
        return failuresInARow < FEED_GIVE_UP_AFTER;
      },
      worked() {
        failuresInARow = 0;
      },
      failed() {
        failuresInARow++;
      },
    };
  }

  /**
   * When a channel last published something: a video, a live stream or a Short. Uses the
   * channel's public feed (which lists all three) and falls back to the channel page: the
   * Videos and Live tabs show dates; the Shorts tab shows none, so the newest Short's date
   * is read from the player. Pass the scan's `feeds` tracker to skip the feed once it is
   * known not to work.
   * → { t: ms|null, none: boolean, src: 'feed'|'page'|'error' }
   */
  async function fetchLastUpload(channelId, { signal, feeds = null } = {}) {
    let feedSaysEmpty = false;
    if (!feeds || feeds.usable) {
      try {
        const response = await fetch(`${location.origin}/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
          credentials: 'omit',
          signal,
        });
        const feed = response.ok ? P.parseFeed(await response.text()) : { valid: false };
        if (feeds) feeds[feed.valid ? 'worked' : 'failed']();
        if (feed.valid && feed.latest != null) return { t: feed.latest, none: false, src: 'feed' };
        feedSaysEmpty = feed.valid && feed.count === 0;
      } catch (error) {
        if (isAbort(error)) throw error;
        if (feeds) feeds.failed();
      }
    }

    // Channel page: one request per tab, the newest date wins. A request that fails is
    // skipped: a single broken channel (terminated, region-locked…) must not stop the scan.
    const now = Date.now();
    let newest = null;
    let answers = 0;
    const consider = (t) => {
      if (t != null && (newest == null || t > newest)) newest = t;
    };
    const ask = async (endpoint, body) => {
      try {
        const json = await call(endpoint, body, { hl: 'en', signal, retries: 1 });
        answers++;
        return json;
      } catch (error) {
        if (isAbort(error)) throw error;
        return null;
      }
    };
    for (const params of [VIDEOS_TAB, LIVE_TAB]) {
      const age = P.newestRelativeAge(await ask('browse', { browseId: channelId, params }));
      if (age != null) consider(now - age);
    }
    const shortId = P.firstShortId(await ask('browse', { browseId: channelId, params: SHORTS_TAB }));
    if (shortId) consider(P.parsePublishDate(await ask('player', { videoId: shortId })));
    if (newest == null) {
      const age = P.newestRelativeAge(await ask('browse', { browseId: channelId }));
      if (age != null) consider(now - age);
    }
    if (newest != null) return { t: newest, none: false, src: 'page' };
    if (!answers) return { t: null, none: false, src: 'error' };
    // Only call a channel empty when both sources agree; otherwise leave it unknown.
    return { t: null, none: feedSaysEmpty, src: 'page' };
  }

  /**
   * Channel behind a video, from YouTube's public oEmbed data (the session is not sent).
   * Used for Shorts in the watch history, which come without their channel.
   * → { channelId: 'UC…'|null, handle: '@…'|'' }, or null (removed/private video, error)
   */
  async function fetchVideoOwner(videoId, { signal } = {}) {
    try {
      const target = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const response = await fetch(`${location.origin}/oembed?url=${encodeURIComponent(target)}&format=json`, { credentials: 'omit', signal });
      if (!response.ok) return null;
      const json = await response.json();
      return P.parseOwnerUrl(json && json.author_url);
    } catch (error) {
      if (isAbort(error)) throw error;
      return null;
    }
  }

  async function unsubscribe(channelId, params, { signal } = {}) {
    const body = { channelIds: [channelId] };
    if (params) body.params = params;
    const json = await call('subscription/unsubscribe', body, { signal, retries: 2 });
    const states = P.collect(json, 'updateSubscribeButtonAction');
    if (states.some((s) => s.subscribed === true)) throw new SweepError('generic', 'still subscribed');
    return true;
  }

  /** Several channels in one request (the endpoint takes a list of channel IDs). */
  async function unsubscribeMany(channelIds, { signal } = {}) {
    await call('subscription/unsubscribe', { channelIds }, { signal, retries: 1 });
    return true;
  }

  async function subscribe(channelId, { signal } = {}) {
    await call('subscription/subscribe', { channelIds: [channelId] }, { signal, retries: 2 });
    return true;
  }

  // `request` is exposed for diagnostics (tools/smoke-test.mjs).
  NS.YT = { config, request: call, fetchSubscriptions, fetchHistory, feedTracker, fetchLastUpload, fetchVideoOwner, unsubscribe, unsubscribeMany, subscribe };
})();
