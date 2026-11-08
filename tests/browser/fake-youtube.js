// A fake YouTube backend for browser tests: 4 subscriptions and 6 pages of watch history
// (page T2 also has a Shorts shelf). Every request is logged in window.__log. Hooks:
//   window.__stopAt = 'T4'     → pause the scan when the page for that token is requested
//   window.__rejectOnce = 'T4' → answer that token once with HTTP 400 (expired position)
//   window.__hangAt = 'T4'     → never answer that page (sets window.__hung)
//   window.__latency = 150     → delay every answer (ms)
//   window.__todayExtra = [id]  → more channels watched "Today" (videos watched after a scan)
//   window.__channelPage = { videos: '3 days ago', live: null, shortsDays: null }
//                              → what a channel's Videos / Live / Shorts tabs show (feed fallback)
//   window.__oembed = { <videoId>: author_url | null } → who posted a Short (null = HTTP 400)
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
  // Shorts: the history page lists them in a shelf, without their channel (see window.__oembed).
  const short = (videoId) => ({ shortsLockupViewModel: { entityId: `shorts-shelf-item-${videoId}`, onTap: { innertubeCommand: { reelWatchEndpoint: { videoId } } } } });
  const shortsShelf = (videoIds) => ({ reelShelfRenderer: { title: { simpleText: 'Shorts' }, items: videoIds.map(short) } });
  let videoSeq = 0;
  function historyPage(daysAgo, channels, next, extra = []) {
    const section = {
      itemSectionRenderer: { header: { itemSectionHeaderRenderer: { title: { simpleText: header(daysAgo) } } }, contents: [...channels.map((c) => video(c, ++videoSeq)), ...extra] },
    };
    return { contents: { sectionListRenderer: { contents: next ? [section, continuation(next)] : [section] } } };
  }

  // FEhistory → T1 → T2 → T3 → T4 → T5 → end
  const HISTORY = {
    FEhistory: () => historyPage(0, [A, B, ...(window.__todayExtra || [])], 'T1'),
    T1: () => historyPage(10, [A], 'T2'),
    // Shorts by Delta (found through its @handle), by a channel we don't subscribe to, and a removed one.
    T2: () => historyPage(40, [C], 'T3', [shortsShelf(['shrt0000001', 'shrt0000002', 'shrt0000003'])]),
    T3: () => historyPage(100, [B], 'T4'),
    T4: () => historyPage(200, [D], 'T5'),
    T5: () => historyPage(300, [A, D], null),
  };

  const channel = (id, title) => ({
    channelRenderer: { channelId: id, title: { simpleText: title }, subscriberCountText: { simpleText: `@${title.toLowerCase()}` }, thumbnail: { thumbnails: [] } },
  });

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

  // Public oEmbed data: who posted a video (window.__oembed: video id → author_url, null = HTTP 400).
  window.__oembed = { shrt0000001: 'https://www.youtube.com/@Delta', shrt0000002: 'https://www.youtube.com/@nobody', shrt0000003: null };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const match = String(url).match(/\/oembed\?url=([^&]+)/);
    if (!match) return realFetch(url, options);
    const videoId = (decodeURIComponent(match[1]).match(/[?&]v=([\w-]{11})/) || [])[1];
    window.__log.push(`oembed:${videoId}`);
    if (window.__latency) await new Promise((resolve) => setTimeout(resolve, window.__latency));
    const author = window.__oembed[videoId];
    if (!author) return new Response('Bad Request', { status: 400 });
    return new Response(JSON.stringify({ author_name: 'x', author_url: author }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  // A channel's own page, read when its feed is unavailable: what each tab shows.
  window.__channelPage = { videos: '3 days ago', live: null, shortsDays: null };
  const TABS = { EgZ2aWRlb3PyBgQKAjoA: 'videos', 'EgdzdHJlYW1z8gYECgJ6AA%3D%3D': 'live', 'EgZzaG9ydHPyBgUKA5oBAA%3D%3D': 'shorts' };

  window.__INNERTUBE = async (endpoint, body) => {
    const server = window.__server;
    if (window.__latency) await new Promise((resolve) => setTimeout(resolve, window.__latency));
    if (endpoint === 'player') {
      window.__log.push(`player:${body.videoId}`);
      const days = window.__channelPage.shortsDays;
      return days == null ? {} : { microformat: { playerMicroformatRenderer: { publishDate: new Date(Date.now() - days * 86400000).toISOString() } } };
    }
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
      if (window.__hangAt === body.continuation) {
        window.__hung = true;
        return new Promise(() => {}); // never answers (the test reloads the page meanwhile)
      }
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
    // Channel page (latest upload fallback): one request per tab
    const tab = TABS[body.params] || 'home';
    window.__log.push(`channel:${body.browseId}:${tab}`);
    const page = window.__channelPage;
    if (tab === 'shorts') return page.shortsDays == null ? {} : { contents: [short('shrt0000009')] };
    const text = tab === 'videos' ? page.videos : tab === 'live' ? page.live : null;
    return text ? { items: [{ publishedTimeText: { simpleText: text } }] } : {};
  };
})();
