/*
 * Copyright (c) 2026 sd016808 <sd016808@gmail.com>. All rights reserved.
 *
 * SubSweep — styles for the panel and the launcher button (rendered inside Shadow DOM,
 * so they never leak into YouTube's page and YouTube's styles never leak in).
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;

  const FONT_BASE = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial`;

  const tokens = `
  .ss, .launch-wrap {
    --font: ${FONT_BASE}, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif;
    --bg: #ffffff;
    --bg-2: #f6f6fb;
    --bg-3: #ececf5;
    --line: rgba(22, 20, 52, 0.08);
    --line-2: rgba(22, 20, 52, 0.15);
    --text: #17162b;
    --text-2: #5c5b74;
    --text-3: #9898ad;
    --accent: #6d5efc;
    --accent-ink: #5545ee;
    --accent-soft: rgba(109, 94, 252, 0.11);
    --accent-softer: rgba(109, 94, 252, 0.055);
    --grad: linear-gradient(135deg, #6d5efc 0%, #9a57f8 55%, #b651f5 100%);
    --danger: #e8445f;
    --danger-soft: rgba(232, 68, 95, 0.11);
    --stale: #e8722c;
    --stale-soft: rgba(232, 114, 44, 0.13);
    --good: #14a866;
    --good-soft: rgba(20, 168, 102, 0.12);
    --shadow-lg: 0 32px 80px -24px rgba(24, 18, 72, 0.45), 0 0 0 1px rgba(24, 18, 72, 0.06);
    --shadow-md: 0 12px 32px -12px rgba(24, 18, 72, 0.3);
    --shadow-sm: 0 1px 2px rgba(24, 18, 72, 0.07), 0 1px 1px rgba(24, 18, 72, 0.04);
    --backdrop: rgba(16, 13, 40, 0.36);
    --dock: rgba(24, 22, 44, 0.94);
    color-scheme: light;
  }
  .ss.dark {
    --bg: #16161e;
    --bg-2: #1e1e29;
    --bg-3: #282836;
    --line: rgba(255, 255, 255, 0.07);
    --line-2: rgba(255, 255, 255, 0.13);
    --text: #f3f3f8;
    --text-2: #b1b1c6;
    --text-3: #77778e;
    --accent: #8576ff;
    --accent-ink: #a99eff;
    --accent-soft: rgba(133, 118, 255, 0.17);
    --accent-softer: rgba(133, 118, 255, 0.08);
    --danger: #ff5a78;
    --danger-soft: rgba(255, 90, 120, 0.15);
    --stale: #ff9550;
    --stale-soft: rgba(255, 149, 80, 0.15);
    --good: #38d18a;
    --good-soft: rgba(56, 209, 138, 0.14);
    --shadow-lg: 0 32px 80px -20px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.07);
    --shadow-md: 0 12px 32px -12px rgba(0, 0, 0, 0.6);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --backdrop: rgba(0, 0, 0, 0.52);
    --dock: rgba(44, 43, 62, 0.95);
    color-scheme: dark;
  }
  .ss[lang="zh-CN"] { --font: ${FONT_BASE}, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; }
  .ss[lang="ja"] { --font: ${FONT_BASE}, "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif; }
  .ss[lang="ko"] { --font: ${FONT_BASE}, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
  `;

  const panel = `
  ${tokens}
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }
  .ss {
    position: fixed; inset: 0;
    font-family: var(--font); font-size: 14px; line-height: 1.45; color: var(--text);
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  button, input, select { font-family: inherit; }
  .ic { flex: none; display: block; }

  /* ---------- shell ---------- */
  .backdrop {
    position: absolute; inset: 0; background: var(--backdrop);
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    opacity: 0; transition: opacity .28s ease;
  }
  .panel {
    position: absolute; top: 12px; right: 12px; bottom: 12px;
    width: min(940px, calc(100vw - 24px));
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg); border-radius: 22px; box-shadow: var(--shadow-lg);
    transform: translateX(28px) scale(.985); opacity: 0;
    transition: transform .36s cubic-bezier(.2, .8, .2, 1), opacity .22s ease;
    outline: none;
  }
  .ss.open .backdrop { opacity: 1; }
  .ss.open .panel { transform: none; opacity: 1; }

  .top {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 14px 14px 20px; border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 11px; margin-right: auto; min-width: 0; }
  .brand .logo { filter: drop-shadow(0 6px 12px rgba(109, 94, 252, .35)); flex: none; }
  .brand-name { font-weight: 750; font-size: 16.5px; letter-spacing: -.015em; line-height: 1.15; }
  .brand-sub { font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .tabs {
    display: flex; gap: 2px; padding: 3px; border-radius: 13px;
    background: var(--bg-2); border: 1px solid var(--line);
  }
  .tab {
    appearance: none; border: 0; background: transparent; color: var(--text-2);
    font-weight: 600; font-size: 13px; line-height: 1; height: 32px; padding: 0 13px;
    border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
    transition: color .15s, background .15s, box-shadow .15s;
  }
  .tab:hover { color: var(--text); }
  .tab.on { background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm); }
  .ss.dark .tab.on { background: var(--bg-3); }
  .tab .count {
    font-size: 11px; font-weight: 700; padding: 3px 6px; border-radius: 99px;
    background: var(--accent-soft); color: var(--accent-ink); font-variant-numeric: tabular-nums;
  }

  .icon-btn {
    appearance: none; width: 36px; height: 36px; flex: none;
    display: inline-grid; place-items: center; border-radius: 11px;
    border: 0; background: transparent; color: var(--text-2); cursor: pointer;
    transition: background .15s, color .15s;
  }
  .icon-btn:hover { background: var(--bg-2); color: var(--text); }
  .icon-btn.bordered { border: 1px solid var(--line-2); background: var(--bg); width: 36px; height: 36px; }
  .icon-btn.bordered:hover { border-color: var(--accent); color: var(--accent-ink); }

  .body {
    flex: 1; overflow: auto; overscroll-behavior: contain;
    padding: 20px 22px 120px; scrollbar-width: thin; scrollbar-color: var(--line-2) transparent;
  }
  .body:focus { outline: none; }

  /* ---------- buttons ---------- */
  .btn {
    appearance: none; border: 0; font-weight: 650; font-size: 13.5px; line-height: 1;
    height: 38px; padding: 0 16px; border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; white-space: nowrap; color: var(--text);
    transition: background .15s, box-shadow .15s, transform .06s, filter .15s, border-color .15s, color .15s;
  }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn:focus-visible, .chip:focus-visible, .tab:focus-visible, .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn.primary {
    background: var(--grad); color: #fff;
    box-shadow: 0 8px 20px -8px rgba(109, 94, 252, .7), inset 0 1px 0 rgba(255, 255, 255, .22);
  }
  .btn.primary:hover:not(:disabled) { filter: brightness(1.06) saturate(1.05); }
  .btn.danger { background: var(--danger); color: #fff; box-shadow: 0 8px 20px -8px rgba(232, 68, 95, .65); }
  .btn.danger:hover:not(:disabled) { filter: brightness(1.06); }
  .btn.ghost { background: var(--bg); border: 1px solid var(--line-2); }
  .btn.ghost:hover:not(:disabled) { background: var(--bg-2); }
  .btn.danger-ghost { background: var(--bg); border: 1px solid var(--line-2); color: var(--danger); }
  .btn.danger-ghost:hover:not(:disabled) { background: var(--danger-soft); border-color: transparent; }
  .btn.subtle { background: transparent; color: var(--text-2); }
  .btn.subtle:hover:not(:disabled) { background: var(--bg-2); color: var(--text); }
  .btn.sm { height: 32px; padding: 0 12px; font-size: 12.5px; border-radius: 10px; gap: 6px; }
  .btn.lg { height: 48px; padding: 0 26px; font-size: 15px; border-radius: 14px; gap: 10px; }

  .spinner {
    width: 16px; height: 16px; border-radius: 50%; flex: none;
    border: 2px solid currentColor; border-right-color: transparent;
    animation: ss-spin .75s linear infinite;
  }
  @keyframes ss-spin { to { transform: rotate(360deg); } }

  /* ---------- scan card ---------- */
  .scan-card {
    position: relative; display: flex; align-items: center; gap: 16px;
    padding: 16px 16px 16px 18px; margin-bottom: 18px; border-radius: 18px;
    border: 1px solid var(--line);
    background:
      radial-gradient(120% 140% at 0% 0%, var(--accent-soft) 0%, transparent 55%),
      var(--bg-2);
    overflow: hidden;
  }
  .scan-card.running { flex-direction: column; align-items: stretch; gap: 14px; }
  .scan-glyph {
    width: 46px; height: 46px; border-radius: 14px; flex: none;
    display: grid; place-items: center; color: #fff; background: var(--grad);
    box-shadow: 0 10px 22px -10px rgba(109, 94, 252, .8);
  }
  .scan-info { flex: 1; min-width: 0; }
  .scan-title { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
  .scan-meta { color: var(--text-2); font-size: 12.5px; margin-top: 3px; }
  .scan-meta b { color: var(--text); font-weight: 650; }

  .steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .step {
    display: flex; gap: 11px; align-items: center; min-width: 0;
    padding: 11px 12px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line);
    transition: border-color .2s, box-shadow .2s;
  }
  .step.active { border-color: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 0 0 3px var(--accent-softer); }
  .step-icon {
    width: 32px; height: 32px; border-radius: 10px; flex: none;
    display: grid; place-items: center; background: var(--bg-2); color: var(--text-3);
  }
  .step.active .step-icon { background: var(--accent-soft); color: var(--accent-ink); }
  .step.done .step-icon { background: var(--accent); color: #fff; }
  .step.error .step-icon { background: var(--stale-soft); color: var(--stale); }
  .step-text { min-width: 0; }
  .step-label { font-weight: 650; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step.pending .step-label { color: var(--text-3); }
  .step-detail { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scan-foot { display: flex; align-items: center; gap: 14px; }
  .scan-foot .progress { flex: 1; }

  .progress { position: relative; height: 7px; border-radius: 99px; background: var(--bg-3); overflow: hidden; }
  .progress .bar { height: 100%; border-radius: inherit; background: var(--grad); transition: width .35s ease; }
  .progress.indeterminate .bar { position: absolute; width: 38%; animation: ss-indet 1.25s ease-in-out infinite; }
  @keyframes ss-indet { 0% { left: -38%; } 100% { left: 100%; } }

  /* ---------- filters ---------- */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .chip {
    appearance: none; display: inline-flex; align-items: center; gap: 7px;
    height: 36px; padding: 0 7px 0 13px; border-radius: 99px; cursor: pointer;
    border: 1px solid var(--line-2); background: var(--bg); color: var(--text-2);
    font-weight: 600; font-size: 13px; line-height: 1;
    transition: border-color .15s, background .15s, color .15s, box-shadow .15s;
  }
  .chip:hover { color: var(--text); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .chip .n {
    min-width: 24px; height: 23px; padding: 0 7px; border-radius: 99px;
    display: inline-grid; place-items: center; font-size: 12px; font-weight: 700;
    background: var(--bg-2); color: var(--text-2); font-variant-numeric: tabular-nums;
  }
  .chip.on {
    background: var(--grad); border-color: transparent; color: #fff;
    box-shadow: 0 8px 18px -10px rgba(109, 94, 252, .9);
  }
  .chip.on .n { background: rgba(255, 255, 255, .22); color: #fff; }

  .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .thresh {
    display: inline-flex; align-items: center; gap: 2px; height: 36px; padding: 0 3px 0 12px;
    border-radius: 11px; background: var(--bg-2); border: 1px solid var(--line);
    color: var(--text-2); font-size: 12.5px; font-weight: 550; white-space: nowrap;
  }
  .thresh .ic { color: var(--text-3); margin-right: 5px; }
  .select-wrap { position: relative; display: inline-flex; align-items: center; }
  .select {
    appearance: none; -webkit-appearance: none; border: 0; outline: none; cursor: pointer;
    height: 30px; padding: 0 26px 0 9px; border-radius: 8px;
    background: var(--bg); color: var(--text); font-weight: 650; font-size: 12.5px;
    box-shadow: var(--shadow-sm);
  }
  .ss.dark .select { background: var(--bg-3); }
  .select:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
  .select-wrap .ic { position: absolute; right: 8px; pointer-events: none; color: var(--text-3); }
  .select-wrap.plain .select { height: 36px; border: 1px solid var(--line-2); box-shadow: none; padding-left: 12px; border-radius: 11px; background: var(--bg); }
  .ss.dark .select-wrap.plain .select { background: var(--bg); }

  .search { position: relative; flex: 1; min-width: 170px; }
  .search .ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
  .search input {
    width: 100%; height: 36px; padding: 0 12px 0 36px; border-radius: 11px;
    border: 1px solid var(--line-2); background: var(--bg); color: var(--text);
    font-size: 13px; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .search input::placeholder { color: var(--text-3); }
  .search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

  .notice {
    display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;
    padding: 11px 14px; border-radius: 13px; font-size: 12.5px; line-height: 1.5;
    background: var(--bg-2); color: var(--text-2); border: 1px solid var(--line);
  }
  .notice .ic { margin-top: 1px; color: var(--text-3); }
  .notice.warn { background: var(--stale-soft); border-color: transparent; color: var(--text); }
  .notice.warn .ic { color: var(--stale); }
  .notice .grow { flex: 1; }
  .link-btn {
    appearance: none; border: 0; background: none; padding: 0; margin-left: 8px; cursor: pointer;
    color: var(--accent-ink); font-weight: 650; font-size: inherit; white-space: nowrap;
  }
  .link-btn:hover { text-decoration: underline; }

  /* ---------- channel list ---------- */
  .list { border: 1px solid var(--line); border-radius: 18px; background: var(--bg); overflow: clip; }
  .grid { display: grid; grid-template-columns: 30px minmax(0, 1fr) 152px 152px 40px; align-items: center; column-gap: 12px; }
  .list-head {
    position: sticky; top: 0; z-index: 3; height: 42px; padding: 0 12px 0 16px;
    background: color-mix(in srgb, var(--bg-2) 92%, transparent);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
    font-size: 11.5px; font-weight: 650; color: var(--text-3); letter-spacing: .02em;
  }
  .list-head .count { color: var(--text-2); }
  .row {
    padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--line);
    cursor: pointer; transition: background .12s; user-select: none;
  }
  .row:last-child { border-bottom: 0; }
  .sentinel { height: 1px; }
  .row:hover { background: var(--bg-2); }
  .row.sel { background: var(--accent-softer); }
  .row.sel:hover { background: var(--accent-soft); }
  .row.flash { animation: ss-flash .9s ease; }
  @keyframes ss-flash { from { background: var(--accent-soft); } }

  .cb {
    appearance: none; -webkit-appearance: none; margin: 0; cursor: pointer;
    width: 19px; height: 19px; border-radius: 6px; border: 1.6px solid var(--line-2);
    background: var(--bg); display: grid; place-items: center; transition: background .12s, border-color .12s;
  }
  .cb::after {
    content: ''; width: 5px; height: 10px; margin-top: -2px;
    border: solid #fff; border-width: 0 2.2px 2.2px 0;
    transform: rotate(45deg) scale(0); transition: transform .14s cubic-bezier(.2, .8, .2, 1.4);
  }
  .cb:hover { border-color: var(--accent); }
  .cb:checked, .cb:indeterminate { background: var(--accent); border-color: var(--accent); }
  .cb:checked::after { transform: rotate(45deg) scale(1); }
  .cb:indeterminate::after { width: 9px; height: 0; margin: 0; border-width: 0 0 2.2px 0; transform: none; }
  .cb:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .channel { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .avatar {
    position: relative; width: 42px; height: 42px; flex: none; border-radius: 50%;
    display: grid; place-items: center; overflow: hidden; text-decoration: none;
    background: var(--bg-3); color: #fff; font-weight: 700; font-size: 16px;
    box-shadow: 0 0 0 1px var(--line);
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .avatar.sm { width: 24px; height: 24px; font-size: 11px; }
  .avatar.md { width: 32px; height: 32px; font-size: 13px; }
  .ch-text { min-width: 0; }
  .ch-title {
    display: flex; align-items: center; gap: 7px; min-width: 0;
    color: var(--text); text-decoration: none; font-weight: 620; font-size: 14px;
  }
  .ch-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch-title:hover span { color: var(--accent-ink); }
  .ch-title .ic { opacity: 0; color: var(--text-3); transition: opacity .15s; }
  .row:hover .ch-title .ic { opacity: 1; }
  .ch-sub { font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .badge {
    display: inline-flex; align-items: center; gap: 4px; flex: none;
    height: 19px; padding: 0 7px; border-radius: 99px;
    font-size: 10.5px; font-weight: 700; letter-spacing: .01em;
    background: var(--accent-soft); color: var(--accent-ink);
  }
  .badge.good { background: var(--good-soft); color: var(--good); }

  .cell { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
  .cell .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--line-2); }
  .cell.good .dot { background: var(--good); }
  .cell.bad .dot { background: var(--stale); box-shadow: 0 0 0 3px var(--stale-soft); }
  .cell-main { font-size: 13px; font-weight: 560; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell.bad .cell-main { color: var(--stale); }
  .cell.muted .cell-main { color: var(--text-3); font-weight: 500; }
  .cell-sub { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact-meta { display: none; }

  .keep { width: 32px; height: 32px; border-radius: 10px; opacity: 0; }
  .row:hover .keep, .keep:focus-visible { opacity: 1; }
  .keep.on { opacity: 1; color: var(--accent-ink); }
  .keep.on .ic { fill: currentColor; }

  .empty { text-align: center; padding: 56px 24px; color: var(--text-2); }
  .empty-icon {
    width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 18px;
    display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink);
  }
  .empty h4 { margin: 0 0 6px; font-size: 15px; color: var(--text); }
  .empty p { margin: 0 auto; max-width: 380px; font-size: 13px; line-height: 1.55; }

  /* ---------- selection dock ---------- */
  .dock {
    position: absolute; left: 50%; bottom: 20px; z-index: 6;
    display: flex; align-items: center; gap: 8px; padding: 7px 7px 7px 18px;
    border-radius: 18px; background: var(--dock); color: #fff;
    box-shadow: 0 24px 48px -16px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255, 255, 255, .06);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    transform: translate(-50%, 24px); opacity: 0; pointer-events: none;
    transition: transform .3s cubic-bezier(.2, .8, .2, 1), opacity .2s;
  }
  .dock.show { transform: translate(-50%, 0); opacity: 1; pointer-events: auto; }
  .dock-count { font-weight: 650; font-size: 13.5px; margin-right: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dock .btn.subtle { color: rgba(255, 255, 255, .72); }
  .dock .btn.subtle:hover { background: rgba(255, 255, 255, .1); color: #fff; }

  /* ---------- modal ---------- */
  .modal-layer {
    position: absolute; inset: 0; z-index: 10; display: none; place-items: center; padding: 24px;
    background: rgba(12, 10, 30, .38); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  }
  .modal-layer.show { display: grid; animation: ss-fade .2s ease; }
  .modal {
    width: min(490px, 100%); max-height: 100%; overflow: auto; padding: 26px;
    border-radius: 22px; background: var(--bg); box-shadow: var(--shadow-lg);
    animation: ss-pop .26s cubic-bezier(.2, .8, .2, 1);
  }
  @keyframes ss-fade { from { opacity: 0; } }
  @keyframes ss-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } }
  .modal-icon {
    width: 50px; height: 50px; border-radius: 16px; margin-bottom: 16px;
    display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink);
  }
  .modal-icon.danger { background: var(--danger-soft); color: var(--danger); }
  .modal-icon.good { background: var(--good-soft); color: var(--good); }
  .modal-icon.warn { background: var(--stale-soft); color: var(--stale); }
  .modal h3 { margin: 0 0 6px; font-size: 19px; font-weight: 750; letter-spacing: -.015em; line-height: 1.3; }
  .modal p { margin: 6px 0 0; color: var(--text-2); font-size: 13.5px; line-height: 1.55; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  .stack { display: flex; align-items: center; margin: 16px 0 4px; padding-left: 8px; }
  .stack .avatar { width: 36px; height: 36px; margin-left: -8px; box-shadow: 0 0 0 2.5px var(--bg); font-size: 13px; }
  .stack .more { background: var(--bg-3); color: var(--text-2); font-size: 11.5px; font-weight: 750; }
  .name-list {
    list-style: none; margin: 14px 0 0; padding: 6px; max-height: 168px; overflow: auto;
    border: 1px solid var(--line); border-radius: 14px; background: var(--bg-2);
  }
  .name-list li { display: flex; align-items: center; gap: 9px; padding: 5px 8px; font-size: 13px; min-width: 0; }
  .name-list li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name-list li .why { margin-left: auto; color: var(--text-3); font-size: 11.5px; flex: none; }
  .hint {
    display: flex; gap: 9px; align-items: flex-start; margin-top: 14px; padding: 11px 13px;
    border-radius: 13px; background: var(--bg-2); color: var(--text-2); font-size: 12.5px; line-height: 1.5;
  }
  .hint .ic { margin-top: 1px; color: var(--accent-ink); }
  .hint.warn { background: var(--stale-soft); color: var(--text); }
  .hint.warn .ic { color: var(--stale); }
  .progress-meta { display: flex; align-items: center; gap: 14px; margin-top: 10px; font-size: 12.5px; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .progress-meta .ok, .progress-meta .fail { display: inline-flex; align-items: center; gap: 4px; font-weight: 650; }
  .progress-meta .ok { color: var(--good); }
  .progress-meta .fail { color: var(--danger); }
  .modal .progress { margin-top: 18px; }
  .current {
    display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px;
    border-radius: 13px; background: var(--bg-2); font-size: 13px; min-width: 0;
  }
  .current span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .current .spinner { color: var(--accent); margin-left: auto; }
  .phase-icon {
    width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
    background: var(--accent-soft); color: var(--accent-ink);
  }

  /* ---------- toasts ---------- */
  .toasts {
    position: absolute; left: 50%; bottom: 86px; z-index: 20; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none;
    width: max-content; max-width: calc(100% - 40px);
  }
  .toast {
    display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 14px;
    background: var(--dock); color: #fff; font-size: 13px; font-weight: 550;
    box-shadow: var(--shadow-md); animation: ss-toast .32s cubic-bezier(.2, .8, .2, 1);
  }
  .toast.success .ic { color: #4ade9a; }
  .toast.error .ic { color: #ff7b93; }
  .toast.warn .ic { color: #ffb066; }
  @keyframes ss-toast { from { opacity: 0; transform: translateY(10px) scale(.96); } }

  /* ---------- hero / onboarding ---------- */
  .hero { max-width: 660px; margin: 0 auto; padding: 34px 8px 8px; text-align: center; }
  .hero-logo { display: inline-block; margin-bottom: 20px; }
  .hero-logo .logo { filter: drop-shadow(0 18px 30px rgba(109, 94, 252, .45)); }
  .hero h2 { margin: 0 0 10px; font-size: 26px; font-weight: 780; letter-spacing: -.025em; line-height: 1.25; text-wrap: balance; }
  .hero > p { margin: 0 auto; max-width: 540px; color: var(--text-2); font-size: 14.5px; line-height: 1.65; text-wrap: pretty; }
  .features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 30px 0 26px; text-align: left; }
  .feature { padding: 16px; border-radius: 18px; background: var(--bg-2); border: 1px solid var(--line); }
  .feature-icon {
    width: 38px; height: 38px; margin-bottom: 12px; border-radius: 12px;
    display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink);
  }
  .feature b { display: block; font-size: 13.5px; margin-bottom: 4px; }
  .feature span { display: block; font-size: 12.5px; color: var(--text-2); line-height: 1.55; }
  .hero-scan { text-align: left; }
  .hero-scan:not(.running) { text-align: center; }
  .privacy-note { display: inline-flex; align-items: center; gap: 7px; margin-top: 18px; color: var(--text-3); font-size: 12.5px; }
  .privacy-note .ic { color: var(--good); }

  /* ---------- removed tab ---------- */
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 2px 2px 14px; }
  .section-head h3 { margin: 0; font-size: 17px; font-weight: 750; letter-spacing: -.01em; }
  .section-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--text-2); }
  .removed-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 11px 14px 11px 16px; cursor: default; }
  .removed-row:hover { background: var(--bg-2); }

  /* ---------- settings ---------- */
  .settings { max-width: 700px; margin: 0 auto; }
  .set-group { margin-bottom: 22px; }
  .set-group h4 { margin: 0 0 8px 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--text-3); }
  .set-card { border: 1px solid var(--line); border-radius: 18px; background: var(--bg); overflow: hidden; }
  .set-row { display: flex; align-items: center; gap: 18px; padding: 15px 16px 15px 18px; border-bottom: 1px solid var(--line); }
  .set-row:last-child { border-bottom: 0; }
  .set-text { flex: 1; min-width: 0; }
  .set-title { font-weight: 620; font-size: 13.5px; }
  .set-hint { margin-top: 3px; font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
  .set-hint .link-btn { margin-left: 0; }
  .switch {
    appearance: none; -webkit-appearance: none; margin: 0; flex: none; cursor: pointer;
    position: relative; width: 42px; height: 25px; border-radius: 99px; background: var(--line-2);
    transition: background .2s;
  }
  .switch::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 19px; height: 19px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .22s cubic-bezier(.2, .8, .2, 1.2);
  }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { transform: translateX(17px); }
  .switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 12px; background: var(--bg-2); border: 1px solid var(--line); flex: none; }
  .seg button {
    appearance: none; border: 0; background: transparent; color: var(--text-2); cursor: pointer;
    height: 30px; padding: 0 12px; border-radius: 9px; font-weight: 620; font-size: 12.5px;
  }
  .seg button.on { background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm); }
  .ss.dark .seg button.on { background: var(--bg-3); }
  .about {
    display: flex; gap: 14px; align-items: flex-start; padding: 18px; border-radius: 18px;
    background: radial-gradient(120% 160% at 0% 0%, var(--good-soft) 0%, transparent 55%), var(--bg-2);
    border: 1px solid var(--line);
  }
  .about > .ic { color: var(--good); margin-top: 2px; }
  .about b { font-size: 13.5px; }
  .about p { margin: 4px 0 0; font-size: 12.5px; color: var(--text-2); line-height: 1.6; }
  .about .version { margin-top: 8px; font-size: 11.5px; color: var(--text-3); }
  .loading { display: grid; place-items: center; height: 60%; color: var(--accent); }
  .loading .spinner { width: 28px; height: 28px; border-width: 3px; }

  /* ---------- small screens ---------- */
  @media (max-width: 760px) {
    .panel { top: 0; right: 0; bottom: 0; width: 100vw; border-radius: 0; }
    .top { padding: 10px 10px 10px 14px; gap: 8px; flex-wrap: wrap; }
    .brand-sub { display: none; }
    .tabs { order: 3; width: 100%; }
    .tab { flex: 1; justify-content: center; }
    .body { padding: 14px 12px 110px; }
    .grid { grid-template-columns: 26px minmax(0, 1fr) 34px; }
    .col-upload, .col-watched, .row > .cell { display: none; }
    .compact-meta { display: block; font-size: 11.5px; color: var(--text-2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .compact-meta .bad { color: var(--stale); font-weight: 600; }
    .keep { opacity: 1; }
    .steps, .features { grid-template-columns: 1fr; }
    .hero h2 { font-size: 22px; }
    .scan-card:not(.running) { flex-wrap: wrap; }
    .dock { bottom: 12px; width: calc(100% - 24px); justify-content: space-between; }
  }
  `;

  const launcher = `
  ${tokens}
  :host { all: initial; }
  .launch-wrap { position: fixed; right: 24px; bottom: 24px; z-index: 2147482000; font-family: var(--font); }
  .launch {
    appearance: none; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
    height: 46px; padding: 0 20px 0 8px; border-radius: 99px; color: #fff; background: var(--grad);
    font-family: inherit; font-weight: 650; font-size: 14px; letter-spacing: .005em;
    box-shadow: 0 14px 34px -10px rgba(109, 94, 252, .75), inset 0 1px 0 rgba(255, 255, 255, .25);
    animation: ss-rise .45s cubic-bezier(.2, .8, .2, 1);
    transition: transform .15s, filter .15s;
  }
  .launch:hover { transform: translateY(-2px); filter: brightness(1.06); }
  .launch:focus-visible { outline: 3px solid rgba(109, 94, 252, .5); outline-offset: 3px; }
  .launch .mark { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .2); }
  @keyframes ss-rise { from { opacity: 0; transform: translateY(14px); } }
  `;

  NS.styles = { panel, launcher };
})();
