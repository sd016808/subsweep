#!/usr/bin/env node
/*
 * Builds every image the extension and the store listing need, using headless Chrome:
 *   extension/icons/icon{16,32,48,128}.png
 *   store/assets/icon-128.png
 *   store/assets/<locale>/screenshot-*.png        (1280×800)
 *   store/assets/<locale>/promo-small-440x280.png
 *   store/assets/<locale>/marquee-1400x560.png
 *
 * The screenshots render the real content scripts with mock data (tools/preview/*).
 *
 * Usage:  node tools/build-assets.mjs [--only=icons,screens,promo] [--locales=en,zh_TW]
 *                                     [--scenarios=list,dark] [--out=<dir for screenshots>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { ALL_LOCALES, contentScriptTags, escapeHtml, fakeSite, logoSvg, messagesOf, previewGlobals } from './lib/preview-page.mjs';
import { startServer } from './lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const ASSETS = path.join(ROOT, 'store', 'assets');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const only = args.only ? new Set(args.only.split(',')) : null;
const want = (task) => !only || only.has(task);

const LOCALES = args.locales ? args.locales.split(',') : ALL_LOCALES;

// Store screenshots, in listing order. `dark` renders YouTube's dark theme.
const SCREENS = [
  { name: 'screenshot-1-suggestions', scenario: 'list' },
  { name: 'screenshot-2-confirm', scenario: 'confirm' },
  { name: 'screenshot-3-dark', scenario: 'dark', dark: true },
  { name: 'screenshot-4-undo', scenario: 'removed', dark: true },
  { name: 'screenshot-5-welcome', scenario: 'onboarding' },
];
const EXTRA_SCREENS = [
  { name: 'preview-scanning', scenario: 'scanning' },
  { name: 'preview-paused', scenario: 'paused' },
  { name: 'preview-progress', scenario: 'progress' },
  { name: 'preview-settings', scenario: 'settings' },
];

// ---------------------------------------------------------------- pages

function previewPage(locale, screen) {
  const messages = messagesOf(locale);
  return `<!doctype html><html lang="${messages.localeCode.message}"><head><meta charset="utf-8"><title>SubSweep preview</title></head><body>
${fakeSite(Boolean(screen.dark))}
${previewGlobals(locale, { __SCENARIO: screen.scenario, __DARK: Boolean(screen.dark) })}
<script src="/tools/preview/stub.js"></script>
<script src="/tools/preview/mock.js"></script>
${contentScriptTags()}
<script src="/tools/preview/scenario.js"></script>
</body></html>`;
}

function iconPage(size) {
  // Store icon: 96×96 artwork with 16px transparent padding. Toolbar icons: nearly full bleed.
  const art = size === 128 ? 96 : size - Math.max(1, Math.round(size / 16)) * 2;
  return `<!doctype html><html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${logoSvg(art)}</div></body></html>`;
}

const ICONS = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  eyeOff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>',
  userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const svgIcon = (name, size, color = 'currentColor') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const PROMO_FONT = `system-ui,-apple-system,"Segoe UI",Roboto,"Microsoft JhengHei","Microsoft YaHei","Yu Gothic UI","Malgun Gothic",sans-serif`;
const PROMO_BG = `radial-gradient(60% 80% at 85% 10%, rgba(255,255,255,.22), transparent 60%), radial-gradient(70% 90% at 0% 100%, rgba(40,20,120,.55), transparent 60%), linear-gradient(135deg,#5546ee 0%,#8a52f6 55%,#c057ee 100%)`;

function promoSmall(locale) {
  const m = messagesOf(locale);
  const msg = (key) => escapeHtml(m[key].message);
  return `<!doctype html><html lang="${m.localeCode.message}"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:440px;height:280px;overflow:hidden;font-family:${PROMO_FONT}}
  .tile{position:relative;width:440px;height:280px;background:${PROMO_BG};color:#fff;padding:34px 36px;box-sizing:border-box}
  .name{display:flex;align-items:center;gap:14px;font-size:40px;font-weight:800;letter-spacing:-.02em}
  .tag{margin-top:14px;font-size:19px;font-weight:600;opacity:.92;line-height:1.35;max-width:360px}
  .pills{position:absolute;left:36px;bottom:30px;display:flex;gap:8px}
  .pill{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:99px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-size:14px;font-weight:650}
  .logo svg{filter:drop-shadow(0 10px 18px rgba(30,10,90,.35))}
  </style></head><body><div class="tile">
    <div class="name"><span class="logo">${logoSvg(58, 'inverse')}</span>SubSweep</div>
    <div class="tag">${msg('tagline')}</div>
    <div class="pills"><span class="pill">${svgIcon('moon', 16, '#fff')}${msg('modeInactive')}</span><span class="pill">${svgIcon('eyeOff', 16, '#fff')}${msg('modeUnwatched')}</span></div>
  </div></body></html>`;
}

function promoMarquee(locale) {
  const m = messagesOf(locale);
  const msg = (key) => escapeHtml(m[key].message);
  const shot = `/store/assets/${locale}/screenshot-1-suggestions.png`;
  const bullet = (key) => `<li><span class="ck">${svgIcon('check', 16, '#fff')}</span>${msg(key)}</li>`;
  return `<!doctype html><html lang="${m.localeCode.message}"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1400px;height:560px;overflow:hidden;font-family:${PROMO_FONT}}
  .mq{position:relative;width:1400px;height:560px;background:${PROMO_BG};color:#fff;overflow:hidden}
  .left{position:absolute;left:72px;top:64px;width:520px}
  .brand{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;letter-spacing:-.01em}
  h1{margin:34px 0 26px;font-size:44px;line-height:1.18;font-weight:800;letter-spacing:-.025em;text-wrap:balance}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
  li{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600}
  .ck{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.2)}
  .frame{position:absolute;left:640px;top:58px;width:752px;height:540px;border-radius:22px;overflow:hidden;
    box-shadow:0 40px 90px -20px rgba(20,8,80,.65),0 0 0 1px rgba(255,255,255,.25)}
  .frame img{position:absolute;left:-262px;top:-10px;width:1024px;height:640px}
  </style></head><body><div class="mq">
    <div class="left">
      <div class="brand">${logoSvg(52, 'inverse')}SubSweep</div>
      <h1>${msg('heroTitle')}</h1>
      <ul>${bullet('feature1Title')}${bullet('feature2Title')}${bullet('feature3Title')}</ul>
    </div>
    <div class="frame"><img src="${shot}" alt=""></div>
  </div></body></html>`;
}

// ---------------------------------------------------------------- static server

const server = await startServer(ROOT);
const serve = (route, html) => server.page(route, html);

// ---------------------------------------------------------------- run

const chrome = await launch();
let problems = 0;

async function capture({ url, width, height, file, transparent = false, run = false }) {
  const page = await chrome.newPage({ width, height, transparent });
  try {
    await page.goto(url);
    if (run) await page.evaluate('window.__run()');
    else await page.evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 150)))');
    await page.screenshot(file);
    if (page.errors.length) {
      problems++;
      console.warn(`  ! ${path.relative(ROOT, file)}:\n    ${page.errors.join('\n    ')}`);
    }
    console.log(`  ✓ ${path.relative(ROOT, file)}`);
  } finally {
    await page.close();
  }
}

try {
  if (want('icons')) {
    console.log('Icons');
    for (const size of [16, 32, 48, 128]) {
      await capture({ url: serve(`/__icon/${size}.html`, iconPage(size)), width: size, height: size, transparent: true, file: path.join(EXT, 'icons', `icon${size}.png`) });
    }
    fs.mkdirSync(ASSETS, { recursive: true });
    fs.copyFileSync(path.join(EXT, 'icons', 'icon128.png'), path.join(ASSETS, 'icon-128.png'));
  }

  if (want('screens')) {
    const scenarioFilter = args.scenarios ? new Set(args.scenarios.split(',')) : null;
    const screens = [...SCREENS, ...(args.extras ? EXTRA_SCREENS : [])].filter((s) => !scenarioFilter || scenarioFilter.has(s.scenario));
    for (const locale of LOCALES) {
      console.log(`Screenshots · ${locale}`);
      const outDir = args.out ? path.join(path.resolve(args.out), locale) : path.join(ASSETS, locale);
      for (const screen of screens) {
        const url = serve(`/__preview/${locale}/${screen.name}.html`, previewPage(locale, screen));
        await capture({ url, width: 1280, height: 800, run: true, file: path.join(outDir, `${screen.name}.png`) });
      }
    }
  }

  if (want('promo')) {
    for (const locale of LOCALES) {
      console.log(`Promo tiles · ${locale}`);
      const outDir = path.join(ASSETS, locale);
      await capture({ url: serve(`/__promo/${locale}/small.html`, promoSmall(locale)), width: 440, height: 280, file: path.join(outDir, 'promo-small-440x280.png') });
      await capture({ url: serve(`/__promo/${locale}/marquee.html`, promoMarquee(locale)), width: 1400, height: 560, file: path.join(outDir, 'marquee-1400x560.png') });
    }
  }
} finally {
  await chrome.close();
  server.close();
}

if (problems) {
  console.error(`\n${problems} page(s) reported errors.`);
  process.exit(1);
}
console.log('\nDone.');
