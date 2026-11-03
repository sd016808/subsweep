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
