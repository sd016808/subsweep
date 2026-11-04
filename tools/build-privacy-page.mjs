// Builds the public privacy-policy page (site/) from PRIVACY.md.
// The page is published with GitHub Pages: see tools/publish-privacy.mjs.
// Run with: npm run privacy
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site');

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (text) => text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
const isCjk = (text) => /[㐀-鿿]/.test(text);

// Inline markdown: `code`, [link](url), **bold**, _italic_.
function inline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
  html = html
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1<em>$2</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function table(lines) {
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => inline(cell.trim()));
  const [head, , ...rows] = lines;
  return `<div class="table"><table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${cells(row).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}</tbody></table></div>`;
}

// Block markdown → { title, sections: [{ id, lang, html }] }. Content before the first ## goes to the intro.
function convert(markdown) {
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  let title = '';
  const intro = [];
  const sections = [];
  const out = () => (sections.length ? sections[sections.length - 1].parts : intro);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (block.startsWith('# ')) title = block.slice(2).trim();
    else if (block.startsWith('## ')) {
      const text = block.slice(3).trim();
      sections.push({ id: slug(text), lang: isCjk(text) ? 'zh-Hant' : 'en', heading: text, parts: [] });
    } else if (block.startsWith('### ')) out().push(`<h3>${inline(block.slice(4).trim())}</h3>`);
    else if (block === '---') continue; // sections are visually separated already
    else if (lines.every((l) => l.trim().startsWith('|'))) out().push(table(lines));
    else if (lines.every((l) => l.startsWith('- '))) out().push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
    else if (/^\[[^\]]+\]\(#[^)]+\)( · \[[^\]]+\]\(#[^)]+\))*$/.test(block)) {
      const links = [...block.matchAll(/\[([^\]]+)\]\((#[^)]+)\)/g)].map(([, label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
      out().push(`<nav class="langs" aria-label="Language">${links.join('')}</nav>`);
    } else out().push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return { title, intro, sections };
}

// Same mark as the extension (src/content/icons.js), white tile variant as on the promo tiles.
const LOGO =
  `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect width="48" height="48" rx="13" fill="#fff"/>` +
  `<g stroke="#6d5efc" stroke-width="4.4" stroke-linecap="round" fill="none"><path d="M11 16h22"/><path d="M11 24h14"/><path d="M11 32h8"/></g>` +
  `<path fill="#a957f6" d="M34 21.5c.9 4.6 2.5 6.2 7 7-4.5.8-6.1 2.4-7 7-.9-4.6-2.5-6.2-7-7 4.5-.8 6.1-2.4 7-7z"/></svg>`;

function page({ title, intro, sections }) {
  const body = sections
    .map((s) => `<section id="${escapeHtml(s.id)}" lang="${s.lang}">\n<h2>${inline(s.heading)}</h2>\n${s.parts.join('\n')}\n</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="Privacy policy of SubSweep – Subscription Cleaner for YouTube. SubSweep 隱私權政策。">
<link rel="icon" href="icon.png">
<style>
  :root { color-scheme: light dark; --bg: #f6f5fb; --card: #fff; --text: #1d1b2e; --text-2: #4a4763; --text-3: #6f6b8a; --line: #e7e4f3; --accent: #6d5efc; --accent-ink: #5545ee; --accent-soft: rgba(109,94,252,.1); --code: #f1effa; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111019; --card: #1a1925; --text: #ecebf5; --text-2: #c3c0d8; --text-3: #9591b0; --line: #2c2a3d; --accent: #8576ff; --accent-ink: #a99eff; --accent-soft: rgba(133,118,255,.16); --code: #24222f; } }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.7 system-ui, -apple-system, "Segoe UI", Roboto, "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; -webkit-font-smoothing: antialiased; }
  header { background: radial-gradient(60% 120% at 90% 0%, rgba(255,255,255,.22), transparent 60%), linear-gradient(135deg, #5546ee 0%, #8a52f6 55%, #c057ee 100%); color: #fff; padding: 56px 20px 88px; }
  .wrap { max-width: 820px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 800; font-size: 22px; letter-spacing: -.01em; }
  .brand svg { filter: drop-shadow(0 8px 16px rgba(30,10,90,.35)); border-radius: 13px; }
  h1 { margin: 26px 0 6px; font-size: clamp(30px, 5vw, 42px); line-height: 1.15; letter-spacing: -.02em; }
  .updated { color: rgba(255,255,255,.88); margin: 0; }
  .langs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
  .langs a { color: #fff; text-decoration: none; font-weight: 650; font-size: 14px; padding: 7px 15px; border-radius: 99px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3); }
  .langs a:hover { background: rgba(255,255,255,.28); }
  main.wrap { margin: -56px auto 0; padding: 0 20px 64px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: clamp(22px, 4vw, 44px); margin-bottom: 24px; box-shadow: 0 1px 2px rgba(20,10,60,.04), 0 12px 32px rgba(20,10,60,.06); scroll-margin-top: 20px; }
  h2 { margin: 0 0 14px; font-size: 26px; letter-spacing: -.01em; }
  h3 { margin: 34px 0 10px; font-size: 18px; color: var(--accent-ink); }
  p, li { color: var(--text-2); }
  strong { color: var(--text); }
  a { color: var(--accent-ink); }
  ul { padding-left: 1.3em; }
  li { margin: 4px 0; }
  li::marker { color: var(--accent); }
  code { font: 14px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; background: var(--code); padding: 2px 6px; border-radius: 6px; }
  .table { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; vertical-align: top; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  th { background: var(--accent-soft); color: var(--text); font-weight: 700; }
  tr:last-child td { border-bottom: 0; }
  td { color: var(--text-2); }
  td:first-child { color: var(--text); font-weight: 550; width: 42%; }
  footer { text-align: center; color: var(--text-3); font-size: 13px; padding-bottom: 40px; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="brand">${LOGO}<span>SubSweep</span></div>
    <h1>${inline(title)}</h1>
    ${intro.join('\n    ').replace('<p>', '<p class="updated">')}
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer>© ${new Date().getFullYear()} SubSweep</footer>
</body>
</html>
`;
}

const doc = convert(fs.readFileSync(path.join(ROOT, 'PRIVACY.md'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), page(doc));
fs.copyFileSync(path.join(ROOT, 'extension', 'icons', 'icon128.png'), path.join(OUT, 'icon.png'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // serve the files as they are
console.log(`✓ ${path.relative(ROOT, path.join(OUT, 'index.html'))}  (${doc.sections.length} languages)`);
