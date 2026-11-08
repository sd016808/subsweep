# Changelog

## 1.0.3 — 2026-11-08

- After updating, users who scanned with an older version see a one-time notice in the panel: Shorts and live streams are now counted, with a button that re-reads the watch history in full (Shorts already in the history are only counted by a full re-read) and rechecks the latest uploads. "Got it" hides it.
- Live streams and Shorts count as uploads when a channel's feed is unavailable: the channel-page fallback reads the Videos, Live and Shorts tabs (the Shorts tab shows no dates, so the newest Short's date is read from the player) instead of the Videos tab only.
- Shorts in the watch history count for their channel. The history page lists them in a shelf without naming the channel, so each Short's channel is looked up (YouTube's public oEmbed data, without the session) and matched to the subscriptions by handle.
- "0 years ago" fixed: a date exactly one year ago reads "1 year ago" (months and years are counted on the calendar).
- A video watched later on the day of a scan is counted by the next scan (it used to update "Last watched" but not the count, showing e.g. "today · 0 videos" for a channel watched for the first time). Entries on that day are still skipped when the channel had already been watched that day, as they may have been counted.
- Copyright notice at the top of every script; LICENSE (all rights reserved).

## 1.0.2 — 2026-11-04

Store release, same as 1.0.1. It replaces 1.0.0 in Firefox Add-ons review: 1.0.0 still had the validator warning about Firefox for Android.

## 1.0.1 — 2026-11-04

Same code as 1.0.0, with a new version number: AMO uses each version number only once per add-on (listed and self-distributed together), and 1.0.0 is in store review. 1.0.1 is the signed, self-distributed Firefox build for testers. The next store release is 1.0.2 or higher.

- Firefox: the minimum version is now 142 (was 140). Firefox for Android only understands the no-data-collection declaration from 142, and AMO's validator warned about it. The add-on is still desktop-only.

## 1.0.0 — 2026-11-04

First release.

- Lists all subscribed channels with their latest upload date (channel feed, with the channel page as fallback).
- Reads YouTube watch history to show when each channel was last watched; incremental re-scans.
- Scans can be paused and resumed: watch history is checkpointed after every page (own small storage key), a recent subscription list is reused and checked channels are skipped; an expired saved position falls back to a full read.
- Watch history and latest-upload checks run at the same time; uploads are checked 6 at a time; shorter pauses between pages.
- When YouTube's channel feeds (RSS) are unavailable, a scan stops requesting them after 5 failures in a row and reads the Videos tab directly; every new scan tries the feeds again.
- Widening the watch-history range only reads the extra months (the end position of the previous read is kept).
- An outdated copy left running in a tab after an update stops and asks for a page refresh.
- Filters: Suggested, Not uploading, Not watching, Both, All, Kept; adjustable periods (1–36 months); search and sorting.
- Bulk unsubscribe with confirmation, progress, stop button, rate-friendly pacing and automatic stop on repeated failures.
- Bulk unsubscribe keeps running in a background tab; the remaining queue is saved after every channel, so a batch cut short by closing/reloading the tab can be continued.
- Fast mode (default): unsubscribes 20 channels per request and verifies the result against the subscription list; unconfirmed channels are redone one by one, and batching YouTube doesn't honour is remembered and skipped. One-by-one mode slows down automatically when YouTube pushes back.
- Toolbar button reuses an open YouTube tab (injecting the scripts instead of reloading) and otherwise opens the YouTube home page instead of the heavy subscriptions page.
- Long channel lists render in pages, keeping the panel fast with thousands of subscriptions.
- Unsubscribed tab with one-click resubscribe (undo).
- Keep list, CSV export, optional Google Takeout watch-history import.
- Light/dark theme following YouTube; English, 繁體中文, 简体中文, 日本語, 한국어.
- All data stored locally per YouTube account; no servers, analytics or remote code.
- Runs in Chrome / Edge (111+) and Firefox desktop (140+) from the same code; `npm run package` builds a package for each store. Firefox declares no data collection.
- Data that YouTube's page hands to the extension is copied before use (Firefox isolates page objects from content scripts).
