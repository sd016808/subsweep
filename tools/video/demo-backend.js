// Promo video only (tools/video/make-video.mjs): a fake YouTube built from the preview's
// mock channels (tools/preview/mock.js), so the real SubSweep scan, unsubscribe and
// resubscribe can be recorded without a real account. Load it after the content scripts.
(() => {
  const DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS_PER_PAGE = 5;
  const { CHANNELS, avatar, id: idOf, subscriberText } = window.__MOCK;
  // Slow enough for the scan to be seen on screen; window.__DEMO_SPEED > 1 makes it faster.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms / (window.__DEMO_SPEED || 1)));

  const channels = CHANNELS.map(([title, handle, subscribers, uploadDays, watchDays, count], index) => ({
    index,
    id: idOf(index),
    title,
    handle: `@${handle}`,
    subscribers: subscriberText(subscribers),
    uploadDays,
    watchDays,
    count,
    thumb: avatar(title, index),
  }));
  const byId = new Map(channels.map((c) => [c.id, c]));
  const subscribed = new Set(channels.map((c) => c.id));

  // SubSweep keeps https thumbnails only; give the channels their generated avatars back.
  const parse = window.SubSweep.parse;
  const parseChannels = parse.parseChannels;
  parse.parseChannels = (json) => parseChannels(json).map((c) => (byId.has(c.id) ? { ...c, thumb: byId.get(c.id).thumb } : c));

  const channelRenderer = (c) => ({
    channelRenderer: {
      channelId: c.id,
      title: { simpleText: c.title },
      subscriberCountText: { simpleText: c.handle },
      videoCountText: { simpleText: c.subscribers },
      thumbnail: { thumbnails: [] },
    },
  });

  // ---------------------------------------------------------------- watch history

  function header(daysAgo) {
    if (daysAgo === 0) return 'Today';
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  // A few views per channel, the newest on its "last watched" day.
  const byDay = new Map();
  for (const c of channels) {
    if (c.watchDays == null) continue;
    for (let k = 0; k < Math.min(c.count, 4); k++) {
      const day = c.watchDays + k * 13;
      if (day > 420) break;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(c.id);
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  let videoSeq = 0;
  const video = (channelId) => ({
    videoRenderer: {
      videoId: `demo${String(++videoSeq).padStart(7, '0')}`,
      ownerText: { runs: [{ text: byId.get(channelId).title, navigationEndpoint: { browseEndpoint: { browseId: channelId } } }] },
    },
  });
  function historyPage(page) {
    const pageDays = days.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);
    const sections = pageDays.map((day) => ({
      itemSectionRenderer: {
        header: { itemSectionHeaderRenderer: { title: { simpleText: header(day) } } },
        contents: byDay.get(day).map(video),
      },
    }));
    const more = (page + 1) * DAYS_PER_PAGE < days.length;
    if (more) sections.push({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: `H${page + 1}` } } } });
    return { contents: { sectionListRenderer: { contents: sections } } };
  }

  // ---------------------------------------------------------------- latest uploads (channel feeds)

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const match = String(url).match(/\/feeds\/videos\.xml\?channel_id=([\w-]+)/);
    if (!match) return realFetch(url, options);
    const channel = byId.get(decodeURIComponent(match[1]));
    await wait(520 + ((channel ? channel.index : 0) % 5) * 110);
    if (!channel) return new Response('Not Found', { status: 404 });
    const entry =
      channel.uploadDays == null ? '' : `<entry><published>${new Date(Date.now() - channel.uploadDays * DAY - 3600000).toISOString()}</published></entry>`;
    return new Response(`<feed xmlns="http://www.w3.org/2005/Atom">${entry}</feed>`, { status: 200 });
  };

  // ---------------------------------------------------------------- youtubei endpoints

  window.__INNERTUBE = async (endpoint, body) => {
    if (endpoint === 'subscription/unsubscribe') {
      await wait(600);
      for (const id of body.channelIds || []) subscribed.delete(id);
      return { actions: [] };
    }
    if (endpoint === 'subscription/subscribe') {
      await wait(500);
      for (const id of body.channelIds || []) subscribed.add(id);
      return {};
    }
    if (endpoint !== 'browse') return {};
    if (body.browseId === 'FEchannels') {
      await wait(1200);
      return { contents: [...subscribed].map((id) => channelRenderer(byId.get(id))) };
    }
    if (body.browseId === 'FEhistory') {
      await wait(500);
      return historyPage(0);
    }
    if (body.continuation && /^H\d+$/.test(body.continuation)) {
      await wait(300);
      return historyPage(Number(body.continuation.slice(1)));
    }
    // A channel's own page: only asked for when its feed has no videos.
    await wait(250);
    return {};
  };
})();
