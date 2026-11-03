// A fake YouTube backend for browser tests: 4 subscriptions and 6 pages of watch history.
// Every request is logged in window.__log. Hooks:
//   window.__stopAt = 'T4'   → pause the scan when the page for that token is requested
//   window.__rejectOnce = 'T4' → answer that token once with HTTP 400 (expired position)
(() => {
  const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
  const C = 'UCcccccccccccccccccccccc';
  const D = 'UCdddddddddddddddddddddd';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function header(daysAgo) {
    if (daysAgo === 0) return 'Today';
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  const continuation = (token) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
  const video = (channelId, n) => ({
    videoRenderer: {
      videoId: `vid${String(n).padStart(8, '0')}`,
      ownerText: { runs: [{ text: 'x', navigationEndpoint: { browseEndpoint: { browseId: channelId } } }] },
    },
  });
  let videoSeq = 0;
  function historyPage(daysAgo, channels, next) {
    const section = { itemSectionRenderer: { header: { itemSectionHeaderRenderer: { title: { simpleText: header(daysAgo) } } }, contents: channels.map((c) => video(c, ++videoSeq)) } };
    return { contents: { sectionListRenderer: { contents: next ? [section, continuation(next)] : [section] } } };
  }

  // FEhistory → T1 → T2 → T3 → T4 → T5 → end
  const HISTORY = {
    FEhistory: () => historyPage(0, [A, B], 'T1'),
    T1: () => historyPage(10, [A], 'T2'),
    T2: () => historyPage(40, [C], 'T3'),
    T3: () => historyPage(100, [B], 'T4'),
    T4: () => historyPage(200, [D], 'T5'),
    T5: () => historyPage(300, [A, D], null),
  };

  const channel = (id, title) => ({ channelRenderer: { channelId: id, title: { simpleText: title }, thumbnail: { thumbnails: [] } } });

  // Server-side subscription state. `batch` decides how a multi-channel unsubscribe is
  // handled: 'all' (every channel), 'first' (silently only the first), 'reject' (HTTP 400).
  window.__server = {
    subscribed: new Map([
      [A, 'Alpha'],
      [B, 'Beta'],
      [C, 'Gamma'],
      [D, 'Delta'],
    ]),
    batch: 'all',
  };

  window.__log = [];
  window.__INNERTUBE = async (endpoint, body) => {
    const server = window.__server;
    if (endpoint === 'subscription/unsubscribe') {
      const ids = body.channelIds || [];
      window.__log.push(`unsubscribe:${ids.length}`);
      if (ids.length > 1 && server.batch === 'reject') return { __status: 400 };
      for (const id of ids.length > 1 && server.batch === 'first' ? ids.slice(0, 1) : ids) server.subscribed.delete(id);
      return { actions: [] };
    }
    if (endpoint === 'subscription/subscribe') {
      window.__log.push('subscribe');
      for (const id of body.channelIds || []) server.subscribed.set(id, 'Channel');
      return {};
    }
    if (endpoint !== 'browse') {
      window.__log.push(endpoint);
      return {};
    }
    if (body.browseId === 'FEchannels') {
      window.__log.push('FEchannels');
      return { contents: [...server.subscribed].map(([id, title]) => channel(id, title)) };
    }
    if (body.browseId === 'FEhistory') {
      window.__log.push('history:FEhistory');
      return HISTORY.FEhistory();
    }
    if (body.continuation) {
      window.__log.push(`history:${body.continuation}`);
      if (window.__rejectOnce === body.continuation) {
        window.__rejectOnce = null;
        return { __status: 400 };
      }
      if (window.__stopAt === body.continuation) {
        window.__stopAt = null;
        window.SubSweep.App.stopScan();
      }
      return HISTORY[body.continuation]();
    }
    // Channel page (latest upload fallback)
    window.__log.push(`channel:${body.browseId}`);
    return { items: [{ publishedTimeText: { simpleText: '3 days ago' } }] };
  };
})();
