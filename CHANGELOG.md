# Changelog

## 1.0.0 — 2026-11-04

First release.

- Lists all subscribed channels with their latest upload date (channel feed, with the channel page as fallback).
- Reads YouTube watch history to show when each channel was last watched; incremental re-scans.
- Scans can be paused and resumed: watch history is checkpointed after every page, a recent subscription list is reused and checked channels are skipped; an expired saved position falls back to a full read.
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
