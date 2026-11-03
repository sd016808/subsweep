/*
 * SubSweep — application state and actions (scan, filters, unsubscribe, undo…).
 * The view (panel.js) subscribes with App.on() and re-renders the regions it is told about.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  const { t, fmt, sleep, jitter, pool, isAbort, abortError, contextAlive, startOfDay, monthsAgo, SweepError } = NS.util;
  const YT = NS.YT;
  const Store = NS.Store;
  const F = NS.filters;
  const P = NS.parse;

  // Pause between single-channel requests, per speed setting (ms).
  const SPEEDS = { fast: [300, 600], normal: [700, 1300], gentle: [2500, 4000] };
  const REQUEST_OVERHEAD_MS = 700;
  const BATCH_SIZE = 20; // channels per request in "fast" mode
  const BATCH_PAUSE = [400, 800];

  const S = {
    ready: false,
    loggedIn: true,
    accountKey: '',
    settings: Store.defaults(),
    data: Store.emptyAccount(),
    tab: 'channels',
    query: '',
    selected: new Set(),
    scan: null,
    unsub: null,
    modal: null,
    toasts: [],
  };

  // ---------------------------------------------------------------- change notification

  const listeners = new Set();
  let pendingRegions = new Set();
  let flushScheduled = false;
  let rowsCache = null;

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function flush() {
    flushScheduled = false;
    const regions = pendingRegions;
    pendingRegions = new Set();
    for (const listener of listeners) listener(regions);
  }

  /** Schedules a re-render of the given regions (batched per animation frame). */
  function emit(...regions) {
    for (const region of regions) pendingRegions.add(region);
    if (flushScheduled) return;
    flushScheduled = true;
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') requestAnimationFrame(flush);
    else setTimeout(flush, 50);
  }

  /** Data changed: drop cached rows, then re-render. */
  function changed(...regions) {
    rowsCache = null;
    emit(...regions);
  }

  function rows() {
    if (!rowsCache) rowsCache = F.buildRows(S.data, S.settings, Date.now());
    return rowsCache;
  }

  const historyInfo = () => F.historyInfo(S.data);

  // ---------------------------------------------------------------- persistence

  let saveTimer = null;

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 800);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!S.accountKey) return;
    try {
      await Store.saveAccount(S.accountKey, S.data);
    } catch (error) {
      onSaveFailed(error);
    }
  }

  // ---------------------------------------------------------------- outdated copy
  // When SubSweep is reloaded or updated, the copy already running in an open YouTube tab
  // loses its connection to the extension and can no longer save. It stops what it is
  // doing and asks for a page refresh (progress saved so far is kept).

  let orphaned = false;

  function handleOrphan() {
    if (orphaned) return;
    orphaned = true;
    if (S.scan) S.scan.controller.abort();
    if (S.unsub && !S.unsub.finished) S.unsub.controller.abort();
    S.modal = { type: 'outdated' };
    emit('modal', 'dock');
  }

  /** Call before doing anything; returns false (and shows the dialog) if outdated. */
  function ensureAlive() {
    if (contextAlive()) return true;
    handleOrphan();
    return false;
  }

  function onSaveFailed(error) {
    if (!contextAlive()) handleOrphan();
    else console.warn('[SubSweep] Could not save data', error);
  }

  // ---------------------------------------------------------------- toasts

  let toastSeq = 0;

  function toast(text, tone = 'info', ms = 4200) {
    const id = ++toastSeq;
    S.toasts = [...S.toasts.slice(-2), { id, text, tone }];
    emit('toasts');
    setTimeout(() => {
      S.toasts = S.toasts.filter((item) => item.id !== id);
      emit('toasts');
    }, ms);
  }

  function errorText(error) {
    const code = error && error.code;
    if (code === 'session') return t('errSession');
    if (code === 'network') return t('errNetwork');
    if (code === 'rate') return t('errRate');
    if (code === 'format') return t('errFormat');
    return t('errGeneric', (error && error.message) || String(error));
  }

  // ---------------------------------------------------------------- lifecycle

  async function loadSettings() {
    try {
      S.settings = await Store.loadSettings();
    } catch {
      S.settings = Store.defaults();
    }
    changed('launcher');
  }

  /** Called whenever the panel opens: refreshes account + stored data. */
  async function init() {
    if (!ensureAlive()) return;
    const busy = Boolean(S.scan || S.unsub);
    if (saveTimer) await saveNow(); // don't reload over changes that are still waiting to be saved
    await loadSettings();
    let cfg = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        cfg = await YT.config();
      } catch {
        cfg = null;
      }
      if (cfg && cfg.ready) break;
      await sleep(250);
    }
    S.loggedIn = Boolean(cfg && cfg.loggedIn);
    if (!busy) {
      const key = await Store.accountKey(cfg ? cfg.accountId || cfg.pageId : '');
      if (key !== S.accountKey) S.selected.clear();
      S.accountKey = key;
      S.data = await Store.loadAccount(key);
    }
    S.ready = true;
    changed('all');
  }

  function setTab(tab) {
    if (S.tab === tab) return;
    S.tab = tab;
    emit('tabs', 'body', 'dock');
  }

  async function setSetting(key, value) {
    const next = { ...S.settings, [key]: value };
    if (key === 'unwatchedMonths' && value > next.historyMonths) next.historyMonths = value;
    if (key === 'historyMonths' && value < next.unwatchedMonths) next.unwatchedMonths = value;
    S.settings = Store.sanitizeSettings(next);
    changed('chips', 'controls', 'list', 'settings', 'launcher');
    try {
      await Store.saveSettings(S.settings);
    } catch (error) {
      console.warn('[SubSweep] Could not save settings', error);
    }
  }

  function setMode(mode) {
    if (mode === 'inactive' && S.settings.sort !== 'upload') setSetting('sort', 'upload');
    if (mode === 'unwatched' && S.settings.sort !== 'watched') setSetting('sort', 'watched');
    setSetting('mode', mode);
  }

  function setQuery(query) {
    S.query = query;
    emit('list');
  }

  // ---------------------------------------------------------------- selection

  function toggleSelect(id, on) {
    if (on) S.selected.add(id);
    else S.selected.delete(id);
    emit('selection');
  }

  function selectMany(ids, on) {
    for (const id of ids) {
      if (on) S.selected.add(id);
      else S.selected.delete(id);
    }
    emit('selection');
  }

  function clearSelection() {
    S.selected.clear();
    emit('selection');
  }

  function toggleKeep(id) {
    if (S.data.kept[id]) delete S.data.kept[id];
    else {
      S.data.kept[id] = 1;
      S.selected.delete(id);
    }
    saveSoon();
    changed('list', 'chips', 'selection');
  }

  // ---------------------------------------------------------------- scanning

  function applySubscriptions(list) {
    if (!list.length && S.data.subsOrder.length > 5) {
      // An empty list after a successful request most likely means YouTube changed its format.
      throw new SweepError('format', 'empty subscription list');
    }
    const subs = {};
    const order = [];
    for (const channel of list) {
      subs[channel.id] = channel;
      order.push(channel.id);
    }
    S.data.subs = subs;
    S.data.subsOrder = order;
    S.data.subsSyncedAt = Date.now();
    for (const id of [...S.selected]) if (!subs[id]) S.selected.delete(id);
    for (const id of Object.keys(S.data.uploads)) if (!subs[id]) delete S.data.uploads[id];
  }

  // ---- Watch history -----------------------------------------------------------
  // The history is a chain of pages (each page names the next one), so it can only be
  // read one page at a time. To keep it quick and never repeat work:
  //  - it runs at the same time as the latest-upload checks (see scan());
  //  - progress is saved after every page (S.data.historyPartial, its own small storage
  //    key), so a paused or interrupted read continues where it stopped;
  //  - the position where a read reached the end of the range is kept (history.edge), so
  //    widening the range (e.g. 6 → 12 months) only reads the extra months;
  //  - later scans only read what was watched since the previous one.

  const HISTORY_RESUME_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
  const SUBS_RESUME_MAX_AGE = 6 * 60 * 60 * 1000;
  const UPLOAD_CONCURRENCY = 6;

  /** What an unfinished scan left behind for the next one to continue. */
  function resumeState() {
    const d = S.data;
    const p = d.historyPartial;
    const history = Boolean(p && p.token && p.months === S.settings.historyMonths && Date.now() - p.startedAt < HISTORY_RESUME_MAX_AGE);
    const subs = Boolean(d.subsSyncedAt && d.subsSyncedAt > (d.lastScanAt || 0) && Date.now() - d.subsSyncedAt < SUBS_RESUME_MAX_AGE);
    return { history, subs, any: history || subs };
  }

  async function checkpoint() {
    if (!S.accountKey || !S.data.historyPartial) return;
    try {
      await Store.savePartial(S.accountKey, S.data.historyPartial);
    } catch (error) {
      onSaveFailed(error);
    }
  }

  /** Adds `from` into `into`: latest date wins, counts add up. */
  function mergeStats(into, from) {
    for (const [id, [last, count]] of Object.entries(from)) {
      const stat = into[id] || (into[id] = [0, 0]);
      if (last > stat[0]) stat[0] = last;
      stat[1] += count;
    }
    return into;
  }

  function addEntry(watch, entry, counted) {
    const stat = watch[entry.channelId] || (watch[entry.channelId] = [0, 0]);
    if (entry.date > stat[0]) stat[0] = entry.date;
    if (counted) stat[1]++;
  }

  /**
   * A history read:
   *  full        — from the top down to the start of the range;
   *  incremental — from the top down to the previous read (only what's new);
   *  extend      — from where the previous read ended (history.edge) down to the start
   *                of a wider range, skipping anything already counted.
   */
  function newPartial(mode) {
    const previous = S.data.history;
    const months = S.settings.historyMonths;
    const startedAt = Date.now();
    const base = {
      mode,
      startedAt, // when reading from the top began; becomes history.syncedAt
      months,
      cutoff: startOfDay(monthsAgo(months, startedAt)),
      countAfter: null, // only count entries newer than this (null = count all)
      skipFrom: null, // ignore entries this recent (already counted)
      token: null, // where the next page starts (null = the top)
      date: startOfDay(startedAt), // date header in effect at that position
      recognized: false,
      oldest: startOfDay(startedAt),
      entries: 0,
      watch: {},
      edge: null,
      reachedEnd: false,
    };
    if (mode === 'incremental') {
      base.cutoff = startOfDay(previous.syncedAt);
      base.countAfter = base.cutoff; // the day of the previous read was already counted
    }
    if (mode === 'extend') {
      const edge = previous.edge || {};
      base.skipFrom = previous.coverageFrom;
      base.oldest = previous.coverageFrom;
      base.token = edge.token || null;
      if (edge.token) {
        base.date = edge.date;
        base.recognized = Boolean(edge.recognized);
      }
    }
    return base;
  }

  function reportHistory(partial) {
    if (!S.scan) return;
    const top = partial.skipFrom != null ? partial.skipFrom : partial.startedAt;
    const span = top - partial.cutoff;
    S.scan.historyOldest = partial.oldest;
    S.scan.historyCount = partial.entries;
    S.scan.historyPct = span > 0 ? Math.min(1, Math.max(0, (top - partial.oldest) / span)) : 1;
    emit('scan');
  }

  /** Reads history pages for `partial`, saving progress after each one. */
  async function readHistory(partial, signal) {
    reportHistory(partial);
    const result = await YT.fetchHistory({
      cutoff: partial.cutoff,
      signal,
      startToken: partial.token,
      state: partial.token ? { date: partial.date, recognized: partial.recognized } : null,
      onPage: async ({ entries, token, state }) => {
        for (const entry of entries) {
          if (partial.skipFrom != null && entry.date >= partial.skipFrom) continue;
          addEntry(partial.watch, entry, partial.countAfter == null || entry.date > partial.countAfter);
          partial.entries++;
          if (entry.date < partial.oldest) partial.oldest = entry.date;
        }
        partial.token = token;
        partial.date = state.date;
        partial.recognized = state.recognized;
        reportHistory(partial);
        await checkpoint();
      },
    });
    partial.reachedEnd = result.reachedEnd;
    partial.edge = result.edge;
  }

  function finishHistory(partial) {
    const previous = S.data.history;
    if (partial.mode !== 'full' && previous) {
      S.data.watch = mergeStats(S.data.watch, partial.watch);
      const next = { ...previous, syncedAt: Math.max(previous.syncedAt, partial.startedAt), entries: previous.entries + partial.entries };
      if (partial.mode === 'extend') {
        next.months = partial.months;
        next.reachedEnd = partial.reachedEnd;
        next.coverageFrom = partial.reachedEnd ? Math.min(previous.coverageFrom, partial.oldest) : partial.cutoff;
        next.edge = partial.edge;
      }
      S.data.history = next;
    } else {
      S.data.watch = partial.watch;
      S.data.history = {
        syncedAt: partial.startedAt,
        months: partial.months,
        coverageFrom: partial.reachedEnd ? partial.oldest : partial.cutoff,
        reachedEnd: partial.reachedEnd,
        entries: partial.entries,
        edge: partial.edge,
      };
    }
    S.data.historyPartial = null;
  }

  async function runPartial(partial, signal) {
    S.data.historyPartial = partial;
    await readHistory(partial, signal);
    finishHistory(partial);
  }

  const isExpired = (error) => Boolean(error) && (error.code === 'expired' || error.code === 'badRequest');

  async function scanHistory(full, signal) {
    // 1. Continue an interrupted read.
    const saved = !full && resumeState().history ? S.data.historyPartial : null;
    if (saved) {
      reportHistory(saved);
      // Catch up on whatever was watched since that read started at the top…
      const since = startOfDay(saved.startedAt);
      const caughtUpAt = Date.now();
      const fresh = {};
      await YT.fetchHistory({
        cutoff: since,
        signal,
        onPage: ({ entries }) => {
          for (const entry of entries) addEntry(fresh, entry, entry.date > since);
        },
      });
      mergeStats(saved.watch, fresh);
      saved.startedAt = caughtUpAt;
      // …then carry on from the saved position.
      try {
        await readHistory(saved, signal);
        finishHistory(saved);
        if (saved.mode !== 'incremental' || S.data.history.months >= S.settings.historyMonths) return;
      } catch (error) {
        if (!isExpired(error)) throw error;
        console.warn('[SubSweep] Saved history position expired; reading it again', error);
        S.data.historyPartial = null;
      }
    }

    // 2. Normal read.
    const previous = S.data.history;
    if (full || !previous || !previous.syncedAt) {
      await runPartial(newPartial('full'), signal);
      return;
    }
    await runPartial(newPartial('incremental'), signal);
    if (S.settings.historyMonths > S.data.history.months) {
      if (S.data.history.reachedEnd) {
        // The history doesn't go back further anyway.
        S.data.history = { ...S.data.history, months: S.settings.historyMonths };
        return;
      }
      try {
        await runPartial(newPartial('extend'), signal);
      } catch (error) {
        if (!isExpired(error)) throw error;
        console.warn('[SubSweep] Position of the previous read expired; reading the whole range', error);
        await runPartial(newPartial('full'), signal);
      }
    }
  }

  /** History part of a scan. Resolves to the error (or null); only a pause rejects. */
  async function historyStep(full, signal) {
    let failure = null;
    try {
      await scanHistory(full, signal);
      S.scan.steps.history = 'done';
    } catch (error) {
      if (isAbort(error)) throw error;
      console.warn('[SubSweep] Watch history failed', error);
      failure = error;
      S.scan.steps.history = 'error';
    }
    S.data.historyError = failure ? failure.code || 'generic' : null;
    S.scan.historyPct = 1;
    await saveNow();
    changed('list', 'chips', 'controls', 'scan');
    return failure;
  }

  /** Latest-upload part of a scan: checks channels in parallel, skipping recent results. */
  async function uploadsStep(signal, controller) {
    const now = Date.now();
    const maxAge = S.settings.uploadsCacheHours * 60 * 60 * 1000;
    const ids = S.data.subsOrder.filter((id) => {
      const upload = S.data.uploads[id];
      return !upload || (upload.t == null && !upload.none) || now - upload.checkedAt > maxAge;
    });
    // Channels checked recently (e.g. before a pause) count as done, so progress continues.
    S.scan.uploadsTotal = S.data.subsOrder.length;
    S.scan.uploadsDone = S.data.subsOrder.length - ids.length;
    emit('scan');
    let sinceRefresh = 0;
    await pool(
      ids,
      UPLOAD_CONCURRENCY,
      async (id) => {
        try {
          const upload = await YT.fetchLastUpload(id, { signal });
          S.data.uploads[id] = { ...upload, checkedAt: Date.now() };
        } catch (error) {
          if (isAbort(error)) throw error;
          if (error && error.code === 'session') {
            controller.abort(); // signed out: stop the history read too
            throw error;
          }
        }
        S.scan.uploadsDone++;
        if (++sinceRefresh >= 20) {
          sinceRefresh = 0;
          saveSoon();
          changed('list', 'chips');
        }
        emit('scan');
      },
      signal,
    );
    S.scan.steps.uploads = 'done';
    changed('list', 'chips', 'scan');
  }

  async function scan(options = {}) {
    if (S.scan || S.unsub || !S.loggedIn) return;
    if (!ensureAlive()) return;
    const controller = new AbortController();
    const { signal } = controller;
    if (options.recheckUploads) S.data.uploads = {};
    if (options.fullHistory) {
      S.data.history = null;
      S.data.watch = {};
      S.data.historyPartial = null;
    }
    const resume = resumeState();
    S.scan = {
      steps: { subs: resume.subs ? 'done' : 'active', history: 'pending', uploads: 'pending' },
      subs: resume.subs ? S.data.subsOrder.length : 0,
      historyOldest: null,
      historyCount: 0,
      historyPct: 0,
      uploadsDone: 0,
      uploadsTotal: 0,
      controller,
    };
    emit('scan', 'settings', 'dock');

    let historyError = null;
    try {
      if (!resume.subs) {
        const list = await YT.fetchSubscriptions({
          signal,
          onProgress: (count) => {
            S.scan.subs = count;
            emit('scan');
          },
        });
        applySubscriptions(list);
        await saveNow();
        changed('body', 'tabs');
        S.scan.steps.subs = 'done';
      }

      // Watch history and latest uploads don't depend on each other: run both at once.
      S.scan.steps.history = 'active';
      S.scan.steps.uploads = 'active';
      emit('scan');
      const [history, uploads] = await Promise.allSettled([historyStep(Boolean(options.fullHistory), signal), uploadsStep(signal, controller)]);
      if (uploads.status === 'rejected' && !isAbort(uploads.reason)) throw uploads.reason;
      if (history.status === 'rejected' && !isAbort(history.reason)) throw history.reason;
      if (history.status === 'rejected' || uploads.status === 'rejected') throw abortError();
      historyError = history.value;

      S.data.lastScanAt = Date.now();
      if (historyError) toast(t('scanDoneNoHistory'), 'warn', 6000);
      else toast(t('scanDone'), 'success');
    } catch (error) {
      if (orphaned) {
        // Handled by the "SubSweep was updated" dialog.
      } else if (isAbort(error)) toast(t('scanPaused'), 'info', 5000);
      else {
        console.warn('[SubSweep] Scan failed', error);
        toast(errorText(error), 'error', 7000);
      }
    } finally {
      controller.abort(); // make sure nothing keeps running after an error
      S.scan = null;
      await saveNow();
      changed('all');
    }
  }

  function stopScan() {
    if (S.scan) S.scan.controller.abort();
  }

  /** Switch to the channel list and start a scan (used by Settings actions). */
  function rescan(options) {
    setTab('channels');
    scan(options);
  }

  // ---------------------------------------------------------------- unsubscribing

  function singleCostMs(count, speed) {
    const [min, max] = SPEEDS[speed] || SPEEDS.normal;
    return count * ((min + max) / 2 + REQUEST_OVERHEAD_MS);
  }

  /** Batches plus one read of the whole subscription list to verify the result. */
  function batchCostMs(count) {
    const batches = Math.ceil(count / BATCH_SIZE);
    const verifyPages = Math.ceil(S.data.subsOrder.length / 100) + 1;
    return batches * ((BATCH_PAUSE[0] + BATCH_PAUSE[1]) / 2 + 900) + verifyPages * 700;
  }

  /** Batch only in "fast" mode, when YouTube hasn't refused it, and when it is actually quicker. */
  const useBatches = (count) =>
    S.settings.speed === 'fast' && S.data.batchSupport !== false && count > 1 && batchCostMs(count) < singleCostMs(count, 'fast');

  function estimateMs(count) {
    return useBatches(count) ? batchCostMs(count) : singleCostMs(count, S.settings.speed);
  }

  function askUnsubscribe() {
    const ids = [...S.selected].filter((id) => S.data.subs[id]);
    if (!ids.length || S.scan || S.unsub) return;
    S.modal = { type: 'confirm', ids };
    emit('modal');
  }

  function closeModal() {
    if (S.unsub && !S.unsub.finished && !orphaned) return;
    S.modal = null;
    S.unsub = null;
    emit('modal', 'dock');
  }

  // The channels still waiting in a batch are saved (S.data.unsubQueue) after every
  // channel, so a batch cut short by closing/reloading the tab — or Chrome unloading
  // it — can be continued the next time SubSweep opens.

  /** Channels left over from an interrupted batch that are still subscribed. */
  function pendingUnsub() {
    const queue = S.data.unsubQueue;
    if (!queue || S.unsub) return [];
    return queue.ids.filter((id) => S.data.subs[id]);
  }

  function continueUnsub() {
    const ids = pendingUnsub();
    if (!ids.length) {
      discardUnsub();
      return;
    }
    selectMany(ids, true);
    S.modal = { type: 'confirm', ids };
    emit('modal');
  }

  async function discardUnsub() {
    S.data.unsubQueue = null;
    await saveNow();
    changed('controls');
  }

  function dequeue(id) {
    if (S.data.unsubQueue) S.data.unsubQueue.ids = S.data.unsubQueue.ids.filter((x) => x !== id);
  }

  function markUnsubscribed(id, channel) {
    S.unsub.ok++;
    S.unsub.done++;
    S.data.removed.unshift({ id, title: channel.title, handle: channel.handle, thumb: channel.thumb, at: Date.now() });
    delete S.data.subs[id];
    S.selected.delete(id);
    dequeue(id);
  }

  /**
   * "Fast" mode: send BATCH_SIZE channels per request, then check the result against
   * YouTube's own subscription list. Returns the channels that still need to be done
   * one by one (not sent, or still subscribed). Batching that YouTube ignores or
   * rejects is remembered (S.data.batchSupport = false) so it isn't tried again.
   */
  async function unsubscribeInBatches(ids, signal) {
    const channels = new Map(ids.map((id) => [id, S.data.subs[id]]));
    const sent = [];
    S.unsub.phase = 'sending';
    S.unsub.sent = 0;
    emit('modal');
    for (let i = 0; i < ids.length && !signal.aborted; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      try {
        await YT.unsubscribeMany(chunk, { signal });
        sent.push(...chunk);
      } catch (error) {
        const rejected = Boolean(error && error.code === 'badRequest');
        // Unless YouTube explicitly refused it, the request may already have been
        // processed (e.g. Stop pressed while it was in flight): let verification decide.
        if (!rejected) sent.push(...chunk);
        if (isAbort(error)) break;
        if (error && error.code === 'session') {
          S.unsub.fatal = 'session';
          break;
        }
        if (rejected) S.data.batchSupport = false;
        break; // whatever is left goes one by one
      }
      S.unsub.sent = sent.length;
      emit('modal');
      if (i + BATCH_SIZE < ids.length) {
        try {
          await sleep(jitter(BATCH_PAUSE[0], BATCH_PAUSE[1]), signal);
        } catch {
          break;
        }
      }
    }
    if (!sent.length) return ids;

    // Verify with YouTube's subscription list (also after Stop: it only reads).
    S.unsub.phase = 'verifying';
    emit('modal');
    let stillSubscribed = null;
    try {
      const list = await YT.fetchSubscriptions();
      const expectedAtLeast = (S.data.subsOrder.length - sent.length) * 0.9;
      if (list.length >= expectedAtLeast) stillSubscribed = new Set(list.map((c) => c.id));
    } catch (error) {
      console.warn('[SubSweep] Could not verify batch unsubscribe', error);
    }
    if (!stillSubscribed) return ids; // can't tell what happened: redo one by one (harmless)

    const confirmed = sent.filter((id) => !stillSubscribed.has(id));
    for (const id of confirmed) markUnsubscribed(id, channels.get(id));
    S.data.subsOrder = S.data.subsOrder.filter((id) => S.data.subs[id]);
    const batches = Math.ceil(sent.length / BATCH_SIZE);
    if (confirmed.length === sent.length) S.data.batchSupport = true;
    else if (confirmed.length <= batches) S.data.batchSupport = false; // only the first of each batch counted
    await saveNow();
    changed('modal', 'list', 'chips', 'tabs', 'selection');

    const sentSet = new Set(sent);
    return [...sent.filter((id) => stillSubscribed.has(id)), ...ids.filter((id) => !sentSet.has(id))];
  }

  /** One request per channel; slows down by itself when YouTube pushes back. */
  async function unsubscribeOneByOne(ids, signal) {
    const [min, max] = SPEEDS[S.settings.speed] || SPEEDS.normal;
    let slowdown = 1;
    let failuresInARow = 0;
    S.unsub.phase = 'single';
    for (const id of ids) {
      if (signal.aborted) break;
      const channel = S.data.subs[id];
      if (!channel) {
        dequeue(id);
        S.unsub.done++;
        continue;
      }
      S.unsub.current = channel;
      emit('modal');
      try {
        await YT.unsubscribe(id, channel.unsubParams, { signal });
        failuresInARow = 0;
        S.data.subsOrder = S.data.subsOrder.filter((x) => x !== id);
        markUnsubscribed(id, channel);
      } catch (error) {
        if (isAbort(error)) break;
        failuresInARow++;
        slowdown = Math.min(slowdown * (error && error.code === 'rate' ? 3 : 2), 8);
        S.unsub.fail++;
        S.unsub.failures.push({ id, title: channel.title, thumb: channel.thumb });
        if (error && error.code === 'session') {
          S.unsub.fatal = 'session';
          S.unsub.done++;
          break;
        }
        if (failuresInARow >= 3) {
          S.unsub.fatal = 'tooMany';
          S.unsub.done++;
          break;
        }
        dequeue(id);
        S.unsub.done++;
      }
      await saveNow(); // the tab may be closed at any moment: keep the queue current
      changed('modal', 'list', 'chips', 'tabs', 'selection');
      if (S.unsub.done < S.unsub.total) {
        try {
          await sleep(jitter(min, max) * slowdown, signal);
        } catch {
          break;
        }
      }
    }
    S.unsub.current = null;
  }

  async function runUnsubscribe(ids) {
    if (S.unsub || S.scan) return;
    if (!ensureAlive()) return;
    const controller = new AbortController();
    const { signal } = controller;
    S.unsub = { total: ids.length, done: 0, ok: 0, fail: 0, sent: 0, phase: null, current: null, failures: [], finished: false, stopped: false, fatal: null, controller };
    S.modal = { type: 'unsub' };
    S.data.unsubQueue = { ids: ids.slice(), startedAt: Date.now() };
    await saveNow();
    emit('modal', 'dock', 'controls');

    let remaining = ids.filter((id) => S.data.subs[id]);
    for (const id of ids) {
      if (!S.data.subs[id]) {
        dequeue(id);
        S.unsub.done++;
      }
    }
    if (useBatches(remaining.length)) remaining = await unsubscribeInBatches(remaining, signal);
    if (!signal.aborted && !S.unsub.fatal) await unsubscribeOneByOne(remaining, signal);

    S.unsub.stopped = signal.aborted;
    S.unsub.finished = true;
    S.unsub.current = null;
    // Keep the rest only when YouTube cut the batch short; a finished or user-stopped batch is done.
    if (!S.unsub.fatal) S.data.unsubQueue = null;
    await saveNow();
    changed('modal', 'list', 'chips', 'tabs', 'selection', 'dock', 'controls');
  }

  function stopUnsubscribe() {
    if (S.unsub && !S.unsub.finished) S.unsub.controller.abort();
  }

  async function resubscribe(id) {
    const entry = S.data.removed.find((item) => item.id === id && !item.resubscribedAt);
    if (!entry || entry.pending) return;
    entry.pending = true;
    emit('removed');
    try {
      await YT.subscribe(id);
      entry.resubscribedAt = Date.now();
      if (!S.data.subs[id]) {
        S.data.subs[id] = { id, title: entry.title, handle: entry.handle || '', thumb: entry.thumb || '', subscribers: '', unsubParams: '' };
        S.data.subsOrder.unshift(id);
      }
      toast(t('resubscribedToast', entry.title), 'success');
    } catch (error) {
      toast(errorText(error), 'error', 6000);
    } finally {
      delete entry.pending;
      await saveNow();
      changed('removed', 'tabs', 'list', 'chips');
    }
  }

  async function clearRemoved() {
    S.data.removed = [];
    await saveNow();
    changed('removed', 'tabs');
  }

  // ---------------------------------------------------------------- data tools

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.documentElement.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function exportCsv() {
    const list = F.sortRows(rows(), 'name', fmt.locale());
    if (!list.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    download(`subsweep-subscriptions-${stamp}.csv`, F.toCsv(list), 'text/csv;charset=utf-8');
    toast(t('exportDone', fmt.num(list.length)), 'success');
  }

  async function importTakeout(file) {
    if (!file) return;
    let entries = null;
    try {
      entries = P.parseTakeoutHistory(JSON.parse(await file.text()));
    } catch {
      entries = null;
    }
    if (!entries || !entries.length) {
      toast(t('importFailed'), 'error', 6000);
      return;
    }
    const watch = {};
    let oldest = Infinity;
    for (const entry of entries) {
      const stat = watch[entry.channelId] || (watch[entry.channelId] = [0, 0]);
      if (entry.date > stat[0]) stat[0] = entry.date;
      stat[1]++;
      if (entry.date < oldest) oldest = entry.date;
    }
    S.data.takeout = { importedAt: Date.now(), oldest, entries: entries.length, watch };
    await saveNow();
    changed('list', 'chips', 'controls', 'settings');
    toast(t('importDone', fmt.num(entries.length)), 'success');
  }

  async function removeTakeout() {
    S.data.takeout = null;
    await saveNow();
    changed('list', 'chips', 'controls', 'settings');
  }

  function askClearAll() {
    if (S.scan || S.unsub) return;
    S.modal = { type: 'clear' };
    emit('modal');
  }

  async function clearAll() {
    await Store.clearAll();
    S.settings = Store.defaults();
    S.data = Store.emptyAccount();
    S.selected.clear();
    S.modal = null;
    S.tab = 'channels';
    changed('all', 'launcher');
    toast(t('dataCleared'), 'success');
  }

  NS.App = {
    state: S,
    on,
    emit,
    rows,
    historyInfo,
    resumeState,
    ensureAlive,
    estimateMs,
    init,
    loadSettings,
    setTab,
    setSetting,
    setMode,
    setQuery,
    toggleSelect,
    selectMany,
    clearSelection,
    toggleKeep,
    scan,
    stopScan,
    rescan,
    askUnsubscribe,
    runUnsubscribe,
    pendingUnsub,
    continueUnsub,
    discardUnsub,
    stopUnsubscribe,
    closeModal,
    resubscribe,
    clearRemoved,
    exportCsv,
    importTakeout,
    removeTakeout,
    askClearAll,
    clearAll,
  };
})();
