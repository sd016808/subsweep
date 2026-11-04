// Shared by the store-asset builder (tools/build-assets.mjs) and the promo video
// (tools/video/make-video.mjs): the brand mark, a neutral video-site backdrop, and the
// pieces of a page that runs the real content scripts with mock data.
import fs from 'node:fs';
import path from 'node:path';
import { EXT, readManifest } from './targets.mjs';

export const manifest = readManifest();
export const CONTENT_SCRIPTS = manifest.content_scripts.find((cs) => cs.world !== 'MAIN').js;
export const ALL_LOCALES = fs.readdirSync(path.join(EXT, '_locales'));
export const messagesOf = (locale) => JSON.parse(fs.readFileSync(path.join(EXT, '_locales', locale, 'messages.json'), 'utf8'));
export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------- brand mark (keep in sync with src/content/icons.js)

const GLYPH = (lineColor, sparkleColor) =>
  `<g stroke="${lineColor}" stroke-width="4.4" stroke-linecap="round" fill="none"><path d="M11 16h22"/><path d="M11 24h14"/><path d="M11 32h8"/></g>` +
  `<path fill="${sparkleColor}" d="M34 21.5c.9 4.6 2.5 6.2 7 7-4.5.8-6.1 2.4-7 7-.9-4.6-2.5-6.2-7-7 4.5-.8 6.1-2.4 7-7z"/>`;

export function logoSvg(size, variant = 'color') {
  const inverse = variant === 'inverse';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">` +
    `<defs><linearGradient id="lg-${variant}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#b651f5"/></linearGradient></defs>` +
    `<rect width="48" height="48" rx="13" fill="${inverse ? '#ffffff' : `url(#lg-${variant})`}"/>` +
    GLYPH(inverse ? '#6d5efc' : '#ffffff', inverse ? '#a957f6' : '#ffffff') +
    `</svg>`
  );
}

// ---------------------------------------------------------------- backdrop

/** A generic video site (grey placeholders, no real branding) for the panel to sit on. */
export function fakeSite(dark) {
  const cards = Array.from({ length: 12 }, (_, i) => {
    const hue = (i * 37 + 180) % 360;
    return `<div class="card"><div class="thumb" style="background:linear-gradient(135deg,hsl(${hue} 60% ${dark ? 30 : 72}%),hsl(${(hue + 40) % 360} 60% ${dark ? 22 : 60}%))"></div><div class="meta"><i class="av" style="background:hsl(${hue} 50% ${dark ? 40 : 70}%)"></i><div><b></b><b class="short"></b></div></div></div>`;
  }).join('');
  const nav = Array.from({ length: 9 }, (_, i) => `<div class="nav-item${i === 2 ? ' on' : ''}"><i></i><b></b></div>`).join('');
  return `
  <style>
    html,body{margin:0;height:100%;background:${dark ? '#0f0f13' : '#f7f7fa'};font-family:system-ui,sans-serif;overflow:hidden}
    .bar{height:56px;display:flex;align-items:center;gap:24px;padding:0 20px}
    .brandish{width:110px;height:22px;border-radius:6px;background:${dark ? '#2a2a33' : '#dcdce6'}}
    .searchpill{flex:0 1 560px;margin:0 auto;height:38px;border-radius:99px;background:${dark ? '#1c1c24' : '#fff'};border:1px solid ${dark ? '#2c2c36' : '#e2e2ea'}}
    .dots{display:flex;gap:12px}.dots i{width:32px;height:32px;border-radius:50%;background:${dark ? '#2a2a33' : '#dcdce6'}}
    .layout{display:flex}
    .nav{width:220px;padding:8px 12px}.nav-item{display:flex;align-items:center;gap:16px;height:40px;padding:0 12px;border-radius:10px}
    .nav-item.on{background:${dark ? '#22222b' : '#ebebf2'}}.nav-item i{width:22px;height:22px;border-radius:6px;background:${dark ? '#34343f' : '#d3d3de'}}.nav-item b{height:10px;width:96px;border-radius:5px;background:${dark ? '#2c2c36' : '#dedee8'}}
    .grid{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:28px 18px;padding:18px 24px}
    .thumb{aspect-ratio:16/9;border-radius:12px}
    .meta{display:flex;gap:10px;margin-top:10px}.av{width:34px;height:34px;border-radius:50%;flex:none}
    .meta div{flex:1}.meta b{display:block;height:11px;border-radius:5px;margin:4px 0 8px;background:${dark ? '#2c2c36' : '#dcdce6'}}.meta b.short{width:60%}
  </style>
  <div class="bar"><div class="brandish"></div><div class="searchpill"></div><div class="dots"><i></i><i></i></div></div>
  <div class="layout"><aside class="nav">${nav}</aside><main class="grid">${cards}</main></div>`;
}

/** The globals tools/preview/stub.js and mock.js read. */
export function previewGlobals(locale, extra = {}) {
  const messages = messagesOf(locale);
  const globals = {
    __MESSAGES: messages,
    __LOCALE_TAG: messages.localeCode.message,
    __VERSION: manifest.version,
    ...extra,
  };
  return `<script>${Object.entries(globals)
    .map(([key, value]) => `window.${key} = ${JSON.stringify(value)};`)
    .join('\n')}</script>`;
}

export const contentScriptTags = () => CONTENT_SCRIPTS.map((file) => `<script src="/extension/${file}"></script>`).join('\n');
