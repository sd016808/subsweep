/*
 * Copyright (c) 2026 sd016808 <sd016808@gmail.com>. All rights reserved.
 *
 * SubSweep — turns stored data into list rows and applies filters (pure functions, unit-tested).
 */
(() => {
  'use strict';

  const NS = (globalThis.SubSweep = globalThis.SubSweep || {});

  const monthsAgo = (months, now) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d.getTime();
  };

  /** Watch stats from YouTube history and an optional Takeout import, merged per channel. */
  function mergedWatch(data) {
    const out = {};
    const add = (source) => {
      if (!source) return;
      for (const [id, stat] of Object.entries(source)) {
        if (!Array.isArray(stat)) continue;
        const current = out[id];
        if (!current) out[id] = [stat[0], stat[1]];
        else {
          current[0] = Math.max(current[0], stat[0]);
          current[1] = Math.max(current[1], stat[1]);
        }
      }
    };
    add(data.watch);
    add(data.takeout && data.takeout.watch);
    return out;
  }

  /** Numeric comparison of version strings such as "1.0.3" (missing parts count as 0). */
  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map(Number);
    const pb = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }

  // Since this version, Shorts (and live streams) are counted. A watch history read by an
  // older version misses the Shorts in it; only a full re-read adds them.
  const SHORTS_SINCE = '1.0.3';

  /**
   * Whether to tell the user about the update: their watch history was last read in full by
   * a version older than SHORTS_SINCE (`data.watchVersion`), and they haven't dismissed the
   * notice (`data.noticeSeen`).
   */
  function updateNotice(data) {
    if (!data.history || !data.lastScanAt) return false;
    if (data.noticeSeen === SHORTS_SINCE) return false;
    return compareVersions(data.watchVersion || '0', SHORTS_SINCE) < 0;
  }

  /** What we know about the user's watch history coverage. */
  function historyInfo(data) {
    const history = data.history;
    const takeout = data.takeout;
    const fromYouTube = Boolean(history && history.syncedAt);
    let from = Infinity;
    let reachedEnd = false;
    if (fromYouTube) {
      from = Math.min(from, history.coverageFrom);
      reachedEnd = Boolean(history.reachedEnd);
    }
    if (takeout) {
      from = Math.min(from, takeout.oldest);
      reachedEnd = true; // a Takeout export contains the whole history
    }
    return {
      ready: fromYouTube || Boolean(takeout),
      from: Number.isFinite(from) ? from : null,
      reachedEnd,
      empty: fromYouTube && !history.entries && !takeout,
    };
  }

  /**
   * One row per subscribed channel.
   * `inactive` / `unwatched` are true, false, or null when we don't know yet.
   */
  function buildRows(data, settings, now = Date.now()) {
    const watch = mergedWatch(data);
    const history = historyInfo(data);
    const inactiveCut = monthsAgo(settings.inactiveMonths, now);
    const unwatchedCut = monthsAgo(settings.unwatchedMonths, now);
    const rows = [];
    data.subsOrder.forEach((id, index) => {
      const ch = data.subs[id];
      if (!ch) return;
      const upload = data.uploads[id];
      const stat = watch[id];
      const lastUpload = upload && upload.t != null ? upload.t : null;
      const noVideos = Boolean(upload && upload.none);
      let inactive = null;
      if (noVideos) inactive = Boolean(settings.includeNoVideos);
      else if (lastUpload != null) inactive = lastUpload < inactiveCut;
      const lastWatched = stat ? stat[0] : null;
      let unwatched = null;
      if (history.ready) unwatched = lastWatched == null ? Boolean(settings.includeNeverWatched) : lastWatched < unwatchedCut;
      rows.push({
        id,
        ch,
        index,
        lastUpload,
        noVideos,
        uploadChecked: Boolean(upload),
        lastWatched,
        watchCount: stat ? stat[1] : 0,
        inactive,
        unwatched,
        kept: Boolean(data.kept[id]),
      });
    });
    return rows;
  }

  const MODES = ['suggested', 'inactive', 'unwatched', 'both', 'all', 'kept'];
  const TESTS = {
    suggested: (r) => !r.kept && (r.inactive === true || r.unwatched === true),
    inactive: (r) => !r.kept && r.inactive === true,
    unwatched: (r) => !r.kept && r.unwatched === true,
    both: (r) => !r.kept && r.inactive === true && r.unwatched === true,
    all: () => true,
    kept: (r) => r.kept,
  };

  function countModes(rows) {
    const counts = {};
    for (const mode of MODES) counts[mode] = 0;
    for (const row of rows) for (const mode of MODES) if (TESTS[mode](row)) counts[mode]++;
    return counts;
  }

  const normalize = (s) => String(s || '').normalize('NFKC').toLowerCase().trim();

  function filterRows(rows, mode, query) {
    const test = TESTS[mode] || TESTS.all;
    const q = normalize(query);
    return rows.filter((r) => test(r) && (!q || normalize(r.ch.title).includes(q) || normalize(r.ch.handle).includes(q)));
  }

  const SORTS = ['upload', 'watched', 'name'];

  function sortRows(rows, sort, locale) {
    const collator = new Intl.Collator(locale || undefined, { sensitivity: 'base', numeric: true });
    const byName = (a, b) => collator.compare(a.ch.title, b.ch.title);
    // Oldest first; "no videos" before everything, "unknown" after everything.
    const uploadKey = (r) => (r.noVideos ? -Infinity : r.lastUpload == null ? Infinity : r.lastUpload);
    const watchKey = (r) => (r.lastWatched != null ? r.lastWatched : r.unwatched === null ? Infinity : -Infinity);
    const diff = (x, y) => (x === y ? 0 : x < y ? -1 : 1);
    const compare = {
      upload: (a, b) => diff(uploadKey(a), uploadKey(b)) || byName(a, b),
      watched: (a, b) => diff(watchKey(a), watchKey(b)) || diff(uploadKey(a), uploadKey(b)) || byName(a, b),
      name: byName,
    }[sort] || byName;
    return rows.slice().sort(compare);
  }

  /** Spreadsheet-safe CSV (UTF-8 with BOM so Excel shows CJK names correctly). */
  function toCsv(rows) {
    const escape = (value) => {
      let s = value == null ? '' : String(value);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // avoid formula injection in spreadsheets
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
    const header = ['channel_id', 'title', 'handle', 'url', 'subscribers', 'last_upload', 'last_watched', 'watch_count', 'kept'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.ch.title,
          r.ch.handle,
          `https://www.youtube.com/channel/${r.id}`,
          r.ch.subscribers,
          r.noVideos ? 'none' : day(r.lastUpload),
          day(r.lastWatched),
          r.watchCount || 0,
          r.kept ? 'yes' : '',
        ]
          .map(escape)
          .join(','),
      );
    }
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  NS.filters = { MODES, SORTS, SHORTS_SINCE, compareVersions, updateNotice, mergedWatch, historyInfo, buildRows, countModes, filterRows, sortRows, toCsv };
})();
