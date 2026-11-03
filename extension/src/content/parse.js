/*
 * SubSweep — parsers for YouTube responses (pure functions, unit-tested).
 *
 * YouTube's internal JSON changes shape often, so instead of hard-coding long
 * paths these helpers search the tree for the few stable pieces we need
 * (channel IDs, continuation tokens, date headers…).
 */
(() => {
  'use strict';

  const NS = (globalThis.SubSweep = globalThis.SubSweep || {});
  const DAY = 24 * 60 * 60 * 1000;
  const CHANNEL_ID = /^UC[\w-]{22}$/;
  const VIDEO_ID = /^[\w-]{11}$/;

  class Match {
    constructor(value) {
      this.value = value;
    }
  }

  /**
   * Depth-first walk in document order. `visit(obj)` is called for every plain
   * object; returning `false` skips that object's children.
   */
  function walk(root, visit) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }
      if (visit(node) === false) continue;
      const values = Object.values(node);
      for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
    }
  }

  /** All values stored under `key` anywhere in the tree, in document order. */
  function collect(root, key) {
    const out = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (node instanceof Match) {
        out.push(node.value);
        continue;
      }
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }
      const entries = Object.entries(node);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, v] = entries[i];
        if (k === key && v && typeof v === 'object') stack.push(new Match(v));
        else stack.push(v);
      }
    }
    return out;
  }

  function forEachString(root, fn) {
    walk(root, (obj) => {
      for (const value of Object.values(obj)) if (typeof value === 'string') fn(value);
    });
  }

  /** Text of a YouTube text object ({simpleText}, {runs:[…]} or {content}). */
  function textOf(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => (run && run.text) || '').join('');
    if (typeof value.content === 'string') return value.content;
    return '';
  }

  /** First piece of text found anywhere under `root`. */
  function firstText(root) {
    let found = '';
    walk(root, (obj) => {
      if (found) return false;
      const text = textOf(obj);
      if (text) {
        found = text;
        return false;
      }
      return undefined;
    });
    return found.trim();
  }

  function findChannelId(root) {
    let id = null;
    walk(root, (obj) => {
      if (id) return false;
      const endpoint = obj.browseEndpoint;
      if (endpoint && typeof endpoint.browseId === 'string' && CHANNEL_ID.test(endpoint.browseId)) {
        id = endpoint.browseId;
        return false;
      }
      return undefined;
    });
    return id;
  }

  function findVideoId(root) {
    let id = null;
    walk(root, (obj) => {
      if (id) return false;
      if (typeof obj.videoId === 'string' && VIDEO_ID.test(obj.videoId)) id = obj.videoId;
      else if (typeof obj.contentId === 'string' && VIDEO_ID.test(obj.contentId)) id = obj.contentId;
      return id ? false : undefined;
    });
    return id;
  }

  function findToken(root) {
    let token = null;
    walk(root, (obj) => {
      if (token) return false;
      const command = obj.continuationCommand;
      if (command && typeof command.token === 'string') {
        token = command.token;
        return false;
      }
      return undefined;
    });
    return token;
  }

  /** Token for the next page ("load more"), or null when the list is complete. */
  function lastContinuation(json) {
    const items = collect(json, 'continuationItemRenderer');
    for (let i = items.length - 1; i >= 0; i--) {
      const token = findToken(items[i]);
      if (token) return token;
    }
    const legacy = collect(json, 'nextContinuationData');
    for (let i = legacy.length - 1; i >= 0; i--) {
      if (typeof legacy[i].continuation === 'string') return legacy[i].continuation;
    }
    return null;
  }

  function bestThumb(thumbnail) {
    const list = thumbnail && Array.isArray(thumbnail.thumbnails) ? thumbnail.thumbnails : [];
    if (!list.length) return '';
    const sorted = list.slice().sort((a, b) => (a.width || 0) - (b.width || 0));
    const pick = sorted.find((item) => (item.width || 0) >= 88) || sorted[sorted.length - 1];
    let url = (pick && pick.url) || '';
    if (url.startsWith('//')) url = `https:${url}`;
    return /^https:\/\//.test(url) ? url : '';
  }

  // ---------------------------------------------------------------- subscriptions

  /** Channels listed on the "All subscriptions" page (browseId FEchannels). */
  function parseChannels(json) {
    const out = [];
    const renderers = [...collect(json, 'channelRenderer'), ...collect(json, 'gridChannelRenderer')];
    for (const r of renderers) {
      const id = r.channelId;
      if (typeof id !== 'string' || !CHANNEL_ID.test(id)) continue;
      const baseUrl = (r.navigationEndpoint && r.navigationEndpoint.browseEndpoint && r.navigationEndpoint.browseEndpoint.canonicalBaseUrl) || '';
      // YouTube re-purposes these fields: one usually holds the @handle, the other the subscriber count.
      const texts = [textOf(r.subscriberCountText), textOf(r.videoCountText)].map((s) => s.trim());
      let handle = texts.find((s) => s.startsWith('@')) || '';
      if (!handle && baseUrl.startsWith('/@')) {
        try {
          handle = decodeURIComponent(baseUrl.slice(1));
        } catch {
          handle = baseUrl.slice(1);
        }
      }
      const subscribers = texts.find((s) => s && !s.startsWith('@') && /\d/.test(s)) || '';
      const unsubscribe = collect(r, 'unsubscribeEndpoint')[0];
      out.push({
        id,
        title: textOf(r.title).trim() || handle || id,
        handle,
        thumb: bestThumb(r.thumbnail),
        subscribers,
        unsubParams: unsubscribe && typeof unsubscribe.params === 'string' ? unsubscribe.params : '',
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- watch history

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function dayStart(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Parses an English date header from the history page ("Today", "Monday",
   * "Oct 12", "Oct 12, 2024"). Returns local midnight in ms, or null.
   */
  function parseHistoryDate(text, now = Date.now()) {
    const s = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return null;
    const today = dayStart(now);
    if (s === 'today') return today.getTime();
    if (s === 'yesterday') {
      today.setDate(today.getDate() - 1);
      return today.getTime();
    }
    const weekday = WEEKDAYS.indexOf(s);
    if (weekday !== -1) {
      let back = (today.getDay() - weekday + 7) % 7;
      if (back === 0) back = 7;
      today.setDate(today.getDate() - back);
      return today.getTime();
    }
    let month = -1;
    let day = 0;
    let year = null;
    let m = s.match(/^([a-z]{3,})\.? (\d{1,2})(?:,? (\d{4}))?$/);
    if (m) {
      month = MONTHS.indexOf(m[1].slice(0, 3));
      day = Number(m[2]);
      year = m[3] ? Number(m[3]) : null;
    } else {
      m = s.match(/^(\d{1,2}) ([a-z]{3,})\.?(?:,? (\d{4}))?$/);
      if (m) {
        day = Number(m[1]);
        month = MONTHS.indexOf(m[2].slice(0, 3));
        year = m[3] ? Number(m[3]) : null;
      }
    }
    if (month === -1 || day < 1 || day > 31) return null;
    const date = new Date(year == null ? today.getFullYear() : year, month, day);
    if (year == null && date.getTime() > today.getTime()) date.setFullYear(date.getFullYear() - 1);
    return date.getTime();
  }

  /**
   * Extracts watched items from one history page. `state` carries the current
   * date across pages: { now, date, recognized }.
   */
  function parseHistoryPage(json, state) {
    const entries = [];
    for (const section of collect(json, 'itemSectionRenderer')) {
      if (section.header) {
        const date = parseHistoryDate(firstText(section.header), state.now);
        if (date != null) {
          state.date = date;
          state.recognized = true;
        }
      }
      const items = Array.isArray(section.contents) ? section.contents : [];
      for (const item of items) {
        const channelId = findChannelId(item);
        if (!channelId) continue;
        entries.push({ channelId, date: state.date, videoId: findVideoId(item) });
      }
    }
    return entries;
  }

  /** Number of video items of any known kind (used to detect layout changes). */
  function countVideoItems(json) {
    return ['videoRenderer', 'lockupViewModel', 'reelItemRenderer', 'shortsLockupViewModel'].reduce((n, key) => n + collect(json, key).length, 0);
  }

  // ---------------------------------------------------------------- latest uploads

  /** Latest <entry><published> of a channel's Atom feed. */
  function parseFeed(xml) {
    const text = String(xml || '');
    const valid = /<feed[\s>]/.test(text);
    let latest = null;
    let count = 0;
    for (const match of text.matchAll(/<entry[\s>][\s\S]*?<\/entry>/g)) {
      count++;
      const published = match[0].match(/<published>([^<]+)<\/published>/);
      const time = published ? Date.parse(published[1]) : NaN;
      if (Number.isFinite(time) && (latest == null || time > latest)) latest = time;
    }
    return { valid, count, latest };
  }

  const UNIT_MS = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: DAY,
    week: 7 * DAY,
    month: 30.44 * DAY,
    year: 365.25 * DAY,
  };

  /** "3 weeks ago", "Streamed 2 days ago" → age in ms (English only). */
  function parseRelativeAge(text) {
    const m = String(text || '')
      .trim()
      .toLowerCase()
      .match(/^(?:streamed |premiered |updated )?(\d+) (second|minute|hour|day|week|month|year)s? ago$/);
    return m ? Number(m[1]) * UNIT_MS[m[2]] : null;
  }

  /** Smallest "… ago" age found anywhere in a channel page response. */
  function newestRelativeAge(json) {
    let best = null;
    forEachString(json, (value) => {
      if (value.length > 40) return;
      const age = parseRelativeAge(value);
      if (age != null && (best == null || age < best)) best = age;
    });
    return best;
  }

  // ---------------------------------------------------------------- Google Takeout

  /** Entries of Takeout's watch-history.json → [{ channelId, date }]. */
  function parseTakeoutHistory(json) {
    if (!Array.isArray(json)) return null;
    const out = [];
    for (const entry of json) {
      if (!entry || typeof entry !== 'object') continue;
      // Ads you were shown are listed with a "details" block; real watches are not.
      if (Array.isArray(entry.details) && entry.details.length) continue;
      const sub = Array.isArray(entry.subtitles) ? entry.subtitles[0] : null;
      const match = sub && typeof sub.url === 'string' ? sub.url.match(/\/channel\/(UC[\w-]{22})/) : null;
      const time = Date.parse(entry.time);
      if (!match || !Number.isFinite(time)) continue;
      out.push({ channelId: match[1], date: time });
    }
    return out;
  }

  NS.parse = {
    CHANNEL_ID,
    walk,
    collect,
    textOf,
    firstText,
    findChannelId,
    findVideoId,
    lastContinuation,
    bestThumb,
    parseChannels,
    parseHistoryDate,
    parseHistoryPage,
    countVideoItems,
    parseFeed,
    parseRelativeAge,
    newestRelativeAge,
    parseTakeoutHistory,
  };
})();
