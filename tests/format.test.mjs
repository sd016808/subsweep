// fmt.relative: "today", "3 weeks ago", "1 year ago"… Months and years are counted on the
// calendar, so a date exactly one year ago reads "1 year ago" (not "0 years ago").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('./helpers.cjs');
const { fmt, monthsBetween } = load('core.js').util;

const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime(); // noon: clear of DST changes
const rel = (from, now) => fmt.relative(from, { now });

test('exactly one year ago is "1 year ago", not "0 years ago"', () => {
  assert.equal(rel(day(2025, 11, 8), day(2026, 11, 8)), '1 year ago');
  assert.equal(rel(day(2024, 11, 8), day(2025, 11, 8)), '1 year ago'); // 365 days
  assert.equal(rel(day(2023, 11, 8), day(2024, 11, 8)), '1 year ago'); // 366 days (leap year)
  assert.equal(rel(day(2025, 11, 9), day(2026, 11, 8)), '11 months ago'); // one day short of a year
  assert.equal(rel(day(2024, 11, 8), day(2026, 11, 8)), '2 years ago');
  assert.equal(rel(day(2024, 11, 9), day(2026, 11, 8)), '1 year ago'); // one day short of two years
  assert.equal(rel(day(2024, 2, 29), day(2026, 2, 28)), '1 year ago');
  assert.equal(rel(day(2024, 2, 29), day(2026, 3, 1)), '2 years ago');
});

test('days, weeks and months', () => {
  const now = day(2026, 11, 8);
  assert.equal(rel(now, now), 'today');
  assert.equal(rel(day(2026, 11, 7), now), 'yesterday');
  assert.equal(rel(day(2026, 11, 5), now), '3 days ago');
  assert.equal(rel(day(2026, 11, 1), now), '1 week ago');
  assert.equal(rel(day(2026, 10, 12), now), '3 weeks ago'); // 27 days
  assert.equal(rel(day(2026, 10, 9), now), '1 month ago'); // 30 days, not yet a calendar month
  assert.equal(rel(day(2026, 10, 8), now), '1 month ago');
  assert.equal(rel(day(2026, 9, 8), now), '2 months ago');
  assert.equal(rel(day(2025, 12, 8), now), '11 months ago');
});

test('monthsBetween counts whole calendar months', () => {
  assert.equal(monthsBetween(day(2026, 1, 31), day(2026, 2, 28)), 0);
  assert.equal(monthsBetween(day(2026, 1, 31), day(2026, 3, 1)), 1);
  assert.equal(monthsBetween(day(2025, 11, 8), day(2026, 11, 8)), 12);
  assert.equal(monthsBetween(day(2026, 11, 8), day(2025, 11, 8)), 0); // never negative
});
