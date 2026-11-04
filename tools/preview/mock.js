// Preview-only mock data: fictional channels used for screenshots.
(() => {
  const DAY = 86400000;
  const now = Date.now();
  const locale = window.__LOCALE_TAG || 'en';

  // [title, handle, subscribers, last upload (days ago, or null = no videos), last watched (days ago, or null = never), watch count]
  const CHANNELS = [
    ['Retro Repair Shop', 'retrorepair', 284000, 512, 430, 3],
    ['台北散步日記', 'taipeiwalks', 52000, 401, null, 0],
    ['Pixel Garden', 'pixelgarden', 1210000, 388, 12, 41],
    ['Midnight Synth Club', 'midnightsynth', 96000, 296, 260, 2],
    ['Tiny Home Builds', 'tinyhomebuilds', 731000, null, 380, 1],
    ['Daily Astronomy', 'dailyastro', 2400000, 3, 2, 64],
    ['山系露營趣', 'mountaincamp', 38000, 240, null, 0],
    ['Code with Mira', 'codewithmira', 452000, 5, 1, 120],
    ['Urban Sketch Club', 'urbansketch', 88000, 9, 300, 4],
    ['Lo-fi Study Room', 'lofistudy', 3100000, 1, 0, 210],
    ['旅行的貓', 'travelcat', 167000, 14, null, 0],
    ['Garage Robotics', 'garagebots', 61000, 205, 190, 6],
    ['Plant Parent Diaries', 'plantparent', 129000, 30, 25, 9],
    ['Speedrun Archive', 'speedrunarchive', 540000, 2, 420, 1],
    ['毎日の和食', 'washokudaily', 213000, 7, 6, 18],
    ['Board Game Nights', 'boardgamenights', 74000, 610, 580, 2],
    ['Ocean Frames', 'oceanframes', 305000, 21, 230, 3],
    ['Indie Dev Diary', 'indiedevdiary', 47000, 190, 4, 22],
    ['Vintage Camera Talk', 'vintagecam', 58000, 260, null, 0],
    ['한강 러닝 클럽', 'hanriverrun', 26000, 12, 11, 7],
    ['Minimal Desk Setups', 'minimaldesk', 612000, 6, 320, 2],
    ['Weekend Woodshop', 'weekendwood', 193000, 45, 40, 13],
    ['The Budget Traveler', 'budgettraveler', 880000, 720, 700, 5],
    ['Mountain Bike Lines', 'mtblines', 142000, 4, 3, 30],
    ['Jazz Piano Daily', 'jazzpianodaily', 236000, 1, 200, 8],
    ['Pocket Science', 'pocketscience', 1730000, 330, 9, 15],
    ['Night Market Eats', 'nightmarketeats', 99000, 10, null, 0],
    ['Home Barista', 'homebarista', 410000, 8, 5, 27],
    ['Cloud Atlas Drone', 'cloudatlas', 33000, 455, null, 0],
    ['Chess Endgames', 'chessendgames', 950000, 2, 1, 95],
    ['手作皮件工作室', 'leathercraft', 45000, 210, 35, 6],
    ['Anime Sakuga Notes', 'sakuganotes', 118000, 16, 15, 11],
    ['Quiet Forest ASMR', 'quietforest', 260000, 500, 470, 1],
    ['History in 5', 'historyin5', 1340000, 3, 190, 14],
    ['Synth DIY Kits', 'synthdiy', 12000, null, null, 0],
    ['Morning Yoga Flow', 'morningyoga', 2050000, 1, 0, 140],
  ];

  const SUBSCRIBER_TEXT = {
    en: (n) => `${n} subscribers`,
    'zh-TW': (n) => `${n} 位訂閱者`,
    'zh-CN': (n) => `${n} 位订阅者`,
    ja: (n) => `チャンネル登録者数 ${n}人`,
    ko: (n) => `구독자 ${n}명`,
  };
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const subscriberText = (n) => (SUBSCRIBER_TEXT[locale] || SUBSCRIBER_TEXT.en)(compact.format(n));

  const SHAPES = [
    '<circle cx="64" cy="64" r="30" fill="rgba(255,255,255,.22)"/>',
    '<path d="M24 98 64 30l40 68z" fill="rgba(255,255,255,.2)"/>',
    '<rect x="30" y="30" width="68" height="68" rx="18" fill="rgba(255,255,255,.2)" transform="rotate(12 64 64)"/>',
    '<path d="M0 90c30-20 60 20 128-10v38H0z" fill="rgba(255,255,255,.22)"/>',
  ];

  function avatar(title, index) {
    const hue = (index * 47 + 200) % 360;
    const letter = Array.from(title)[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 75% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 70% 45%)"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/>${SHAPES[index % SHAPES.length]}<text x="64" y="64" dy=".36em" text-anchor="middle" font-family="Segoe UI, Microsoft JhengHei, Yu Gothic UI, Malgun Gothic, sans-serif" font-weight="700" font-size="56" fill="#fff">${letter}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const id = (index) => `UC${String(index).padStart(4, '0')}mockmockmockmockmo`.slice(0, 24);

  const subs = {};
  const subsOrder = [];
  const uploads = {};
  const watch = {};
  CHANNELS.forEach(([title, handle, subscribers, uploadDays, watchDays, count], index) => {
    const channelId = id(index);
    subs[channelId] = { id: channelId, title, handle: `@${handle}`, thumb: avatar(title, index), subscribers: subscriberText(subscribers), unsubParams: '' };
    subsOrder.push(channelId);
    uploads[channelId] = uploadDays == null ? { t: null, none: true, checkedAt: now, src: 'feed' } : { t: now - uploadDays * DAY - 3600000, none: false, checkedAt: now, src: 'feed' };
    if (watchDays != null) watch[channelId] = [now - watchDays * DAY - 7200000, count];
  });

  const removedTitles = [
    ['Gadget Unboxing Daily', 2 * 3600000, false],
    ['烘焙小日子', 1.2 * DAY, false],
    ['Lazy Sunday Vlogs', 3 * DAY, true],
    ['Weekly Tech Recap', 9 * DAY, false],
    ['ゆるキャン料理部', 16 * DAY, false],
  ];
  const removed = removedTitles.map(([title, ageMs, resubscribed], index) => ({
    id: id(100 + index),
    title,
    handle: '',
    thumb: avatar(title, 40 + index),
    at: now - ageMs,
    ...(resubscribed ? { resubscribedAt: now - ageMs + 600000 } : {}),
  }));

  // The raw channel list, for tools/video/demo-backend.js (a scan the promo video records).
  window.__MOCK = { CHANNELS, avatar, id, subscriberText };

  window.__MOCK_FULL_ACCOUNT = {
    v: 1,
    subs,
    subsOrder,
    subsSyncedAt: now - 2 * 3600000,
    lastScanAt: now - 2 * 3600000,
    uploads,
    watch,
    history: { syncedAt: now - 2 * 3600000, months: 12, coverageFrom: now - 366 * DAY, reachedEnd: false, entries: 3480 },
    historyError: null,
    takeout: null,
    kept: {},
    removed,
  };
})();
