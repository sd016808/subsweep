import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('./helpers.cjs');
const { parse: P } = load('parse.js');

const CH_A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const CH_B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const CH_C = 'UCcccccccccccccccccccccc';

// Shape modelled on the "All subscriptions" (FEchannels) response.
function channelRenderer(id, title, extra = {}) {
  return {
    channelRenderer: {
      channelId: id,
      title: { simpleText: title },
      navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: `/@${title.toLowerCase()}` } },
      thumbnail: {
        thumbnails: [
          { url: `//yt3.ggpht.com/${id}=s88`, width: 88, height: 88 },
          { url: `//yt3.ggpht.com/${id}=s176`, width: 176, height: 176 },
        ],
      },
      subscriberCountText: { simpleText: `@${title.toLowerCase()}` },
      videoCountText: { simpleText: '1.2M subscribers' },
      subscribeButton: {
        subscribeButtonRenderer: {
          subscribed: true,
          onUnsubscribeEndpoints: [
            {
              signalServiceEndpoint: {
                actions: [
                  {
                    openPopupAction: {
                      popup: {
                        confirmDialogRenderer: {
                          confirmButton: {
                            buttonRenderer: { serviceEndpoint: { unsubscribeEndpoint: { channelIds: [id], params: 'CgIIAhgA' } } },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      ...extra,
    },
  };
}

const continuation = (token) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } },
});

test('parseChannels reads id, title, handle, subscribers, thumbnail and unsubscribe params', () => {
  const json = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            shelfRenderer: {
                              content: { expandedShelfContentsRenderer: { items: [channelRenderer(CH_A, 'Alpha'), channelRenderer(CH_B, 'Beta')] } },
                            },
                          },
                        ],
                      },
                    },
                    continuation('NEXT_PAGE'),
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
  const channels = P.parseChannels(json);
  assert.equal(channels.length, 2);
  assert.deepEqual(channels[0], {
    id: CH_A,
    title: 'Alpha',
    handle: '@alpha',
    thumb: `https://yt3.ggpht.com/${CH_A}=s88`,
    subscribers: '1.2M subscribers',
    unsubParams: 'CgIIAhgA',
  });
  assert.equal(P.lastContinuation(json), 'NEXT_PAGE');
});

test('parseChannels ignores renderers without a valid channel id', () => {
  const json = { items: [{ channelRenderer: { channelId: 'not-a-channel', title: { simpleText: 'x' } } }] };
  assert.deepEqual(P.parseChannels(json), []);
});

test('lastContinuation returns null when there is no next page', () => {
  assert.equal(P.lastContinuation({ contents: [channelRenderer(CH_A, 'Alpha')] }), null);
});

test('lastContinuation reads continuation responses (appendContinuationItemsAction)', () => {
  const json = {
    onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [channelRenderer(CH_C, 'Gamma'), continuation('PAGE_3')] } }],
  };
  assert.equal(P.lastContinuation(json), 'PAGE_3');
  assert.equal(P.parseChannels(json)[0].id, CH_C);
});

test('parseHistoryDate understands the English day headers', () => {
  const now = new Date(2026, 10, 4, 15, 30).getTime(); // Wed 4 Nov 2026
  const day = (y, m, d) => new Date(y, m, d).getTime();
  assert.equal(P.parseHistoryDate('Today', now), day(2026, 10, 4));
  assert.equal(P.parseHistoryDate('Yesterday', now), day(2026, 10, 3));
  assert.equal(P.parseHistoryDate('Monday', now), day(2026, 10, 2));
  assert.equal(P.parseHistoryDate('Wednesday', now), day(2026, 9, 28)); // same weekday = a week ago
  assert.equal(P.parseHistoryDate('Oct 12', now), day(2026, 9, 12));
  assert.equal(P.parseHistoryDate('Dec 30', now), day(2025, 11, 30)); // future date → previous year
  assert.equal(P.parseHistoryDate('Mar 3, 2024', now), day(2024, 2, 3));
  assert.equal(P.parseHistoryDate('September 9, 2023', now), day(2023, 8, 9));
  assert.equal(P.parseHistoryDate('12 Oct 2024', now), day(2024, 9, 12));
  assert.equal(P.parseHistoryDate('今天', now), null);
  assert.equal(P.parseHistoryDate('', now), null);
});

test('parseHistoryPage assigns each video the date of its section, across pages', () => {
  const now = new Date(2026, 10, 4, 12).getTime();
  const video = (id, channelId) => ({
    videoRenderer: {
      videoId: id,
      ownerText: { runs: [{ text: 'Owner', navigationEndpoint: { browseEndpoint: { browseId: channelId } } }] },
    },
  });
  // New-style item: channel id lives deep inside a lockupViewModel.
  const lockup = (id, channelId) => ({
    lockupViewModel: {
      contentId: id,
      metadata: {
        lockupMetadataViewModel: {
          image: { decoratedAvatarViewModel: { rendererContext: { commandContext: { onTap: { innertubeCommand: { browseEndpoint: { browseId: channelId } } } } } } },
        },
      },
    },
  });
  const section = (header, items) => ({
    itemSectionRenderer: {
      header: header ? { itemSectionHeaderRenderer: { title: { runs: [{ text: header }] } } } : undefined,
      contents: items,
    },
  });

  const state = { now, date: now, recognized: false };
  const page1 = { contents: { sectionListRenderer: { contents: [section('Today', [video('aaaaaaaaaaa', CH_A)]), section('Oct 12', [lockup('bbbbbbbbbbb', CH_B)])] } } };
  const page2 = { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [section(null, [video('ccccccccccc', CH_C)])] } }] };

  const first = P.parseHistoryPage(page1, state);
  const second = P.parseHistoryPage(page2, state);
  assert.equal(state.recognized, true);
  assert.deepEqual(first, [
    { channelId: CH_A, date: new Date(2026, 10, 4).getTime(), videoId: 'aaaaaaaaaaa' },
    { channelId: CH_B, date: new Date(2026, 9, 12).getTime(), videoId: 'bbbbbbbbbbb' },
  ]);
  // A section without header continues the previous day.
  assert.deepEqual(second, [{ channelId: CH_C, date: new Date(2026, 9, 12).getTime(), videoId: 'ccccccccccc' }]);
});

test('countVideoItems spots videos outside the expected history layout', () => {
  // e.g. a redesigned history page that no longer uses itemSectionRenderer
  const redesigned = { richGridRenderer: { contents: [{ richItemRenderer: { content: { lockupViewModel: { contentId: 'aaaaaaaaaaa' } } } }] } };
  const state = { now: Date.now(), date: Date.now(), recognized: false };
  assert.deepEqual(P.parseHistoryPage(redesigned, state), []);
  assert.equal(P.countVideoItems(redesigned), 1);
  assert.equal(P.countVideoItems({ contents: [] }), 0);
});

test('parseFeed returns the newest entry date and ignores the feed-level date', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <published>2010-01-01T00:00:00+00:00</published>
  <entry><id>yt:video:1</id><published>2026-03-01T10:00:00+00:00</published></entry>
  <entry><id>yt:video:2</id><published>2026-05-20T10:00:00+00:00</published></entry>
</feed>`;
  assert.deepEqual(P.parseFeed(xml), { valid: true, count: 2, latest: Date.parse('2026-05-20T10:00:00+00:00') });
  assert.deepEqual(P.parseFeed('<feed><title>x</title></feed>'), { valid: true, count: 0, latest: null });
  assert.equal(P.parseFeed('<html>error</html>').valid, false);
});

test('parseRelativeAge and newestRelativeAge read "… ago" labels', () => {
  const DAY = 86400000;
  assert.equal(P.parseRelativeAge('3 days ago'), 3 * DAY);
  assert.equal(P.parseRelativeAge('1 year ago'), 365.25 * DAY);
  assert.equal(P.parseRelativeAge('Streamed 2 weeks ago'), 14 * DAY);
  assert.equal(P.parseRelativeAge('I quit 3 days ago and here is why'), null);
  const json = {
    items: [
      { publishedTimeText: { simpleText: '5 months ago' } },
      { metadata: { content: '2 weeks ago' } },
      { title: { simpleText: 'My video from 1 day ago' } },
    ],
  };
  assert.equal(P.newestRelativeAge(json), 14 * DAY);
  assert.equal(P.newestRelativeAge({ nothing: true }), null);
});

test('parseTakeoutHistory keeps real watches and skips ads and malformed rows', () => {
  const json = [
    {
      header: 'YouTube',
      title: 'Watched Something',
      titleUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      subtitles: [{ name: 'Alpha', url: `https://www.youtube.com/channel/${CH_A}` }],
      time: '2026-02-01T08:00:00.000Z',
    },
    {
      header: 'YouTube',
      title: 'Watched An ad',
      subtitles: [{ name: 'Advertiser', url: `https://www.youtube.com/channel/${CH_B}` }],
      details: [{ name: 'From Google Ads' }],
      time: '2026-02-02T08:00:00.000Z',
    },
    { header: 'YouTube', title: 'Watched a removed video', time: '2026-02-03T08:00:00.000Z' },
    'garbage',
  ];
  assert.deepEqual(P.parseTakeoutHistory(json), [{ channelId: CH_A, date: Date.parse('2026-02-01T08:00:00.000Z') }]);
  assert.equal(P.parseTakeoutHistory({ not: 'an array' }), null);
});

test('parseHistoryPage counts live streams like any other video', () => {
  const now = new Date(2026, 10, 4, 12).getTime();
  const state = { now, date: now, recognized: false };
  const page = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            itemSectionRenderer: {
              header: { itemSectionHeaderRenderer: { title: { simpleText: 'Today' } } },
              contents: [
                // A finished live stream (classic renderer) …
                {
                  videoRenderer: {
                    videoId: 'aaaaaaaaaaa',
                    publishedTimeText: { simpleText: 'Streamed 2 days ago' },
                    badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW', label: 'LIVE' } }],
                    ownerText: { runs: [{ text: 'Owner', navigationEndpoint: { browseEndpoint: { browseId: CH_A } } }] },
                  },
                },
                // … and one in the new lockup layout.
                {
                  lockupViewModel: {
                    contentId: 'bbbbbbbbbbb',
                    metadata: {
                      lockupMetadataViewModel: {
                        image: { decoratedAvatarViewModel: { rendererContext: { commandContext: { onTap: { innertubeCommand: { browseEndpoint: { browseId: CH_B } } } } } } },
                        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '74M views' } }, { text: { content: 'Streamed 3 months ago' } }] }] } },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
  const today = new Date(2026, 10, 4).getTime();
  assert.deepEqual(P.parseHistoryPage(page, state), [
    { channelId: CH_A, date: today, videoId: 'aaaaaaaaaaa' },
    { channelId: CH_B, date: today, videoId: 'bbbbbbbbbbb' },
  ]);
});

test('parseHistoryPage lists every Short of a shelf, with the video id when the channel is missing', () => {
  const now = new Date(2026, 10, 4, 12).getTime();
  const state = { now, date: now, recognized: false };
  // Shape modelled on the history page: a "Shorts" shelf with several items, none naming its channel.
  const short = (videoId) => ({
    shortsLockupViewModel: {
      entityId: `shorts-shelf-item-${videoId}`,
      accessibilityText: 'Title, 1M views - play Short',
      onTap: { innertubeCommand: { reelWatchEndpoint: { videoId, overlay: { reelPlayerOverlayRenderer: { style: 'REEL_PLAYER_OVERLAY_STYLE_SHORTS' } } } } },
      overlayMetadata: { primaryText: { content: 'Title' }, secondaryText: { content: '1M views' } },
    },
  });
  // Older item kind; this one does name its channel (player overlay header).
  const reel = (videoId, channelId) => ({
    reelItemRenderer: {
      videoId,
      navigationEndpoint: {
        reelWatchEndpoint: {
          videoId,
          overlay: { reelPlayerOverlayRenderer: { reelPlayerHeaderSupportedRenderers: { reelPlayerHeaderRenderer: { channelNavigationEndpoint: { browseEndpoint: { browseId: channelId } } } } } },
        },
      },
    },
  });
  const video = {
    videoRenderer: { videoId: 'ccccccccccc', ownerText: { runs: [{ text: 'Owner', navigationEndpoint: { browseEndpoint: { browseId: CH_C } } }] } },
  };
  const page = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            itemSectionRenderer: {
              header: { itemSectionHeaderRenderer: { title: { simpleText: 'Oct 12' } } },
              contents: [video, { reelShelfRenderer: { title: { simpleText: 'Shorts' }, items: [short('aaaaaaaaaaa'), short('bbbbbbbbbbb'), reel('ddddddddddd', CH_A)] } }],
            },
          },
        ],
      },
    },
  };
  const date = new Date(2026, 9, 12).getTime();
  assert.deepEqual(P.parseHistoryPage(page, state), [
    { channelId: CH_C, date, videoId: 'ccccccccccc' },
    { channelId: null, date, videoId: 'aaaaaaaaaaa', short: true },
    { channelId: null, date, videoId: 'bbbbbbbbbbb', short: true },
    { channelId: CH_A, date, videoId: 'ddddddddddd', short: true },
  ]);
  assert.equal(P.countVideoItems(page), 4);
});

test('parseOwnerUrl reads the channel behind an oEmbed author URL', () => {
  assert.deepEqual(P.parseOwnerUrl('https://www.youtube.com/@MrBeast'), { channelId: null, handle: '@MrBeast' });
  assert.deepEqual(P.parseOwnerUrl('https://www.youtube.com/@%E6%88%B4%E5%BC%98%E5%AD%B8/videos'), { channelId: null, handle: '@戴弘學' });
  assert.deepEqual(P.parseOwnerUrl(`https://www.youtube.com/channel/${CH_A}`), { channelId: CH_A, handle: '' });
  assert.equal(P.parseOwnerUrl('https://www.youtube.com/user/legacy'), null);
  assert.equal(P.parseOwnerUrl('https://evil.example/@MrBeast'), null);
  assert.equal(P.parseOwnerUrl(undefined), null);
});

test('firstShortId and parsePublishDate read a Shorts tab and a player response', () => {
  const tab = {
    contents: {
      richGridRenderer: {
        contents: [
          { richItemRenderer: { content: { shortsLockupViewModel: { entityId: 'shorts-shelf-item-aaaaaaaaaaa', onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'aaaaaaaaaaa' } } } } } } },
          { richItemRenderer: { content: { shortsLockupViewModel: { entityId: 'shorts-shelf-item-bbbbbbbbbbb', onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'bbbbbbbbbbb' } } } } } } },
        ],
      },
    },
  };
  assert.equal(P.firstShortId(tab), 'aaaaaaaaaaa');
  assert.equal(P.firstShortId({ contents: [] }), null);
  assert.equal(P.firstShortId(null), null);
  const player = { videoDetails: { videoId: 'aaaaaaaaaaa' }, microformat: { playerMicroformatRenderer: { publishDate: '2026-11-06T09:00:02-08:00', uploadDate: '2026-11-06T09:00:02-08:00' } } };
  assert.equal(P.parsePublishDate(player), Date.parse('2026-11-06T09:00:02-08:00'));
  assert.equal(P.parsePublishDate({ microformat: { playerMicroformatRenderer: { uploadDate: '2026-11-06' } } }), Date.parse('2026-11-06'));
  assert.equal(P.parsePublishDate({ playabilityStatus: { status: 'ERROR' } }), null);
  assert.equal(P.parsePublishDate(null), null);
});

test('newestRelativeAge reads the Live tab (lockup metadata, "Streamed …")', () => {
  const DAY = 86400000;
  const live = {
    contents: [
      { lockupViewModel: { metadata: { lockupMetadataViewModel: { metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '74M views' } }, { text: { content: '3 months ago' }, accessibilityLabel: '3 months ago' }] }] } } } } } },
      { lockupViewModel: { metadata: { lockupMetadataViewModel: { metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'Streamed 2 years ago' } }] }] } } } } } },
    ],
  };
  assert.equal(P.newestRelativeAge(live), Math.round(3 * 30.44 * DAY));
});
