// Preview-only: puts the panel into a given state for a screenshot.
// window.__run() resolves when the page is ready to capture.
(() => {
  const NS = window.SubSweep;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function suggestedIds(count) {
    const rows = NS.filters.sortRows(NS.filters.filterRows(NS.App.rows(), 'suggested', ''), 'upload', 'en');
    return rows.slice(0, count).map((r) => r.id);
  }

  const SCENARIOS = {
    async list() {
      NS.App.selectMany(suggestedIds(4), true);
    },
    async confirm() {
      NS.App.selectMany(suggestedIds(7), true);
      await wait(200);
      NS.App.askUnsubscribe();
    },
    async dark() {
      NS.App.setMode('unwatched');
      await wait(150);
      const rows = NS.filters.sortRows(NS.filters.filterRows(NS.App.rows(), 'unwatched', ''), 'watched', 'en');
      NS.App.selectMany(rows.slice(0, 3).map((r) => r.id), true);
    },
    async removed() {
      NS.App.setTab('removed');
    },
    async settings() {
      NS.App.setTab('settings');
    },
    async onboarding() {},
    async paused() {},
    async scanning() {
      const S = NS.App.state;
      S.scan = { step: 'uploads', subs: 36, historyOldest: Date.now() - 300 * 86400000, historyCount: 2900, uploadsDone: 23, uploadsTotal: 36, controller: new AbortController() };
      NS.App.emit('scan', 'dock');
    },
    async progress() {
      const S = NS.App.state;
      const ids = suggestedIds(12);
      S.unsub = { total: ids.length, done: 5, ok: 5, fail: 0, current: S.data.subs[ids[5]], failures: [], finished: false, stopped: false, fatal: null, controller: new AbortController() };
      S.modal = { type: 'unsub' };
      NS.App.emit('modal', 'dock');
    },
  };

  window.__run = async () => {
    const scenario = window.__SCENARIO || 'list';
    if (window.__DARK) document.documentElement.setAttribute('dark', '');
    window.__MOCK_SETTINGS = { mode: 'suggested', sort: 'upload' };
    window.__MOCK_ACCOUNT = scenario === 'onboarding' ? null : window.__MOCK_FULL_ACCOUNT;
    if (scenario === 'paused') {
      // A scan that was paused half-way through the watch history.
      const now = Date.now();
      const account = window.__MOCK_FULL_ACCOUNT;
      account.subsSyncedAt = now - 20 * 60000;
      account.lastScanAt = now - 3 * 86400000;
      account.historyPartial = { mode: 'full', token: 'preview', months: 12, startedAt: now - 20 * 60000, cutoff: now - 365 * 86400000, date: now - 130 * 86400000, recognized: true, oldest: now - 130 * 86400000, entries: 1240, watch: {} };
    }
    await NS.Panel.open();
    await wait(120);
    await SCENARIOS[scenario]();
    await wait(900); // let transitions and images settle
    return true;
  };
})();
