import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('./helpers.cjs');
const { filters: F } = load('filters.js');

const NOW = new Date(2026, 10, 4, 12).getTime();
const DAY = 86400000;
const ago = (days) => NOW - days * DAY;

const settings = {
  inactiveMonths: 6,
  unwatchedMonths: 6,
  includeNoVideos: true,
  includeNeverWatched: true,
};

function channel(id, title) {
  return { id, title, handle: `@${title.toLowerCase()}`, thumb: '', subscribers: '', unsubParams: '' };
}

function dataset() {
  const ids = ['active', 'quiet', 'unwatched', 'both', 'empty', 'never', 'unknown', 'kept'];
  const subs = Object.fromEntries(ids.map((id) => [id, channel(id, id[0].toUpperCase() + id.slice(1))]));
  return {
    subs,
    subsOrder: ids,
    uploads: {
      active: { t: ago(3), none: false },
      quiet: { t: ago(400), none: false },
      unwatched: { t: ago(10), none: false },
      both: { t: ago(300), none: false },
      empty: { t: null, none: true },
      never: { t: ago(20), none: false },
      kept: { t: ago(500), none: false },
      // "unknown" has no upload info yet
    },
    watch: {
      active: [ago(1), 12],
      quiet: [ago(5), 3],
      unwatched: [ago(250), 2],
      both: [ago(365), 1],
      empty: [ago(2), 1],
      kept: [ago(900), 1],
    },
    history: { syncedAt: NOW, months: 12, coverageFrom: ago(365), reachedEnd: false, entries: 20 },
    takeout: null,
    kept: { kept: 1 },
  };
}

test('buildRows classifies channels as inactive / unwatched / unknown', () => {
  const rows = F.buildRows(dataset(), settings, NOW);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.active.inactive, false);
  assert.equal(byId.active.unwatched, false);
  assert.equal(byId.quiet.inactive, true);
  assert.equal(byId.unwatched.unwatched, true);
  assert.equal(byId.both.inactive && byId.both.unwatched, true);
  assert.equal(byId.empty.noVideos, true);
  assert.equal(byId.empty.inactive, true);
  assert.equal(byId.never.lastWatched, null);
  assert.equal(byId.never.unwatched, true);
  assert.equal(byId.unknown.inactive, null);
  assert.equal(byId.kept.kept, true);
});

test('settings toggles change how empty and never-watched channels count', () => {
  const rows = F.buildRows(dataset(), { ...settings, includeNoVideos: false, includeNeverWatched: false }, NOW);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.empty.inactive, false);
  assert.equal(byId.never.unwatched, false);
});

test('without watch history, "unwatched" is unknown rather than true', () => {
  const data = { ...dataset(), history: null, watch: {} };
  const rows = F.buildRows(data, settings, NOW);
  assert.ok(rows.every((r) => r.unwatched === null));
});

test('countModes and filterRows exclude kept channels from suggestions', () => {
  const rows = F.buildRows(dataset(), settings, NOW);
  const counts = F.countModes(rows);
  // "unknown" has no upload data yet but is absent from the history, so it still counts as unwatched.
  assert.deepEqual(counts, { suggested: 6, inactive: 3, unwatched: 4, both: 1, all: 8, kept: 1 });
  assert.deepEqual(
    F.filterRows(rows, 'both', '').map((r) => r.id),
    ['both'],
  );
  assert.deepEqual(
    F.filterRows(rows, 'all', 'QUI').map((r) => r.id),
    ['quiet'],
  );
  assert.deepEqual(
    F.filterRows(rows, 'kept', '').map((r) => r.id),
    ['kept'],
  );
});

test('sortRows orders by oldest upload, least-recent watch, or name', () => {
  const rows = F.buildRows(dataset(), settings, NOW);
  assert.deepEqual(
    F.sortRows(rows, 'upload', 'en').map((r) => r.id),
    ['empty', 'kept', 'quiet', 'both', 'never', 'unwatched', 'active', 'unknown'],
  );
  assert.deepEqual(
    F.sortRows(rows, 'watched', 'en').map((r) => r.id).slice(0, 4),
    ['never', 'unknown', 'kept', 'both'], // never-watched first, ties broken by oldest upload
  );
  assert.deepEqual(
    F.sortRows(rows, 'name', 'en').map((r) => r.id),
    ['active', 'both', 'empty', 'kept', 'never', 'quiet', 'unknown', 'unwatched'],
  );
});

test('historyInfo merges YouTube history with a Takeout import', () => {
  const data = dataset();
  assert.deepEqual(F.historyInfo(data), { ready: true, from: ago(365), reachedEnd: false, empty: false });
  data.takeout = { importedAt: NOW, oldest: ago(2000), entries: 10, watch: { never: [ago(30), 4] } };
  assert.deepEqual(F.historyInfo(data), { ready: true, from: ago(2000), reachedEnd: true, empty: false });
  const rows = F.buildRows(data, settings, NOW);
  const never = rows.find((r) => r.id === 'never');
  assert.equal(never.lastWatched, ago(30));
  assert.equal(never.unwatched, false);
});

test('toCsv escapes quotes, commas and spreadsheet formulas', () => {
  const data = dataset();
  data.subs.active.title = '=HYPERLINK("x"), "quoted"';
  const rows = F.buildRows(data, settings, NOW).filter((r) => r.id === 'active');
  const csv = F.toCsv(rows);
  assert.ok(csv.startsWith('﻿channel_id,title,'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x""), ""quoted"""`));
  assert.ok(csv.includes('https://www.youtube.com/channel/active'));
});

test('compareVersions orders version strings numerically', () => {
  assert.equal(F.compareVersions('1.0.3', '1.0.3'), 0);
  assert.equal(F.compareVersions('1.0.2', '1.0.3'), -1);
  assert.equal(F.compareVersions('1.0.10', '1.0.3'), 1);
  assert.equal(F.compareVersions('1.1', '1.0.9'), 1);
  assert.equal(F.compareVersions('1.0', '1.0.0'), 0);
  assert.equal(F.compareVersions('', '1.0.3'), -1);
});

test('updateNotice: shown once for a history read by a version before Shorts were counted', () => {
  const history = { syncedAt: NOW, months: 6, coverageFrom: ago(180), reachedEnd: false, entries: 10 };
  // Scanned with an older version (no watchVersion recorded at all).
  assert.equal(F.updateNotice({ history, lastScanAt: NOW }), true);
  assert.equal(F.updateNotice({ history, lastScanAt: NOW, watchVersion: '1.0.2' }), true);
  // Read in full by this version or a later one.
  assert.equal(F.updateNotice({ history, lastScanAt: NOW, watchVersion: F.SHORTS_SINCE }), false);
  assert.equal(F.updateNotice({ history, lastScanAt: NOW, watchVersion: '2.0.0' }), false);
  // Dismissed.
  assert.equal(F.updateNotice({ history, lastScanAt: NOW, noticeSeen: F.SHORTS_SINCE }), false);
  // Never scanned: nothing to re-read.
  assert.equal(F.updateNotice({ history: null, lastScanAt: 0 }), false);
  assert.equal(F.updateNotice({ history, lastScanAt: 0 }), false);
});
