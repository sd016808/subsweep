// Promo video stage (tools/video/make-video.mjs records it). Title cards plus a browser
// window that runs the real SubSweep panel against a fake YouTube (demo-backend.js).
// window.__play() runs the whole video in real time and returns when each narration line
// was shown, so the recorder can place the voice clips at the same moments.
(() => {
  'use strict';

  const V = window.__VIDEO; // { scenes: [{ id, lines: [{ key, show, ms }] }], cards, logo, logoInverse }
  const M = window.__MESSAGES;
  const msg = (key) => M[key].message;
  const $ = (selector, root = document) => root.querySelector(selector);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const events = [];
  const mark = (type, data = {}) => events.push({ type, at: Date.now(), ...data });

  // ---------------------------------------------------------------- tiny DOM builder

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'html') el.innerHTML = value;
      else el.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child != null) el.append(child);
    return el;
  }
  const ICONS = {
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9 3 12 5.5 12 8c0-2.5 3-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    serverOff: '<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"/><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z"/><path d="M22 17v-1a2 2 0 0 0-2-2h-1"/><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z"/><path d="M6 18h.01"/><path d="m2 2 20 20"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    forward: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    reload: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    puzzle: '<path d="M15.4 4.6a2.5 2.5 0 1 1 3.5 3.5L17 10l1.6 1.6a2 2 0 0 1 0 2.8L17 16l-1.6-1.6a2.5 2.5 0 1 0-3.5 3.5L13.5 19.5 12 21a2 2 0 0 1-2.8 0L7.6 19.4a2.5 2.5 0 1 0-3.5-3.5L2.5 14.3a2 2 0 0 1 0-2.8L4 10l1.6 1.6a2.5 2.5 0 1 0 3.5-3.5L7.5 6.5 9.2 4.8a2 2 0 0 1 2.8 0L13.6 6.4z"/>',
  };
  const svgIcon = (name, size, color = 'currentColor', width = 2) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  const raw = (html) => h('span', { html, style: 'display:contents' });

  // ---------------------------------------------------------------- scene setup

  const stage = $('#stage');
  const C = V.cards;
  const channels = window.__MOCK.CHANNELS.map(([title], index) => ({ title, src: window.__MOCK.avatar(title, index) }));
  const cards = {};
  function card(id, ...children) {
    const el = h('section', { class: 'card', id: `card-${id}` }, ...children);
    stage.insertBefore(el, $('#caption'));
    cards[id] = el;
    return el;
  }

  // Hook: a wall of subscriptions, most of them fading out.
  const KEEP = new Set([5, 9, 14, 29, 43, 50]);
  const wall = h('div', { class: 'wall' }, Array.from({ length: 13 * 7 }, (_, i) => h('img', { src: channels[i % channels.length].src, class: KEEP.has(i) ? 'keep' : '' })));
  const hookLines = [h('div', { class: 'big rise' }, '訂閱了', h('span', { class: 'accent' }, '幾百個'), '頻道，'), h('div', { class: 'big rise' }, '真正會看的卻沒幾個？')];
  card('hook', wall, h('div', { class: 'hook' }, h('div', { class: 'pill rise' }, C.hookCount), hookLines));

  // Problem: unsubscribing one channel at a time.
  const problemRows = channels.slice(0, 5).map((c, i) => {
    const button = h('button', { class: 'sub-btn' }, C.subscribed);
    return { button, el: h('div', { class: 'prow' }, h('img', { src: c.src }), h('div', { class: 't' }, h('b', null, c.title), h('span', null, `${[284, 52, 1210, 96, 731][i]}K`)), button) };
  });
  const counterValue = h('b', null, '0');
  card(
    'problem',
    h(
      'div',
      { class: 'problem' },
      h('div', null, h('h2', null, C.problemTitle), h('div', { class: 'counter' }, `${C.problemUnit} `, counterValue, ` / ${C.problemTotal}`)),
      h('div', { class: 'plist' }, problemRows.map((r) => r.el)),
    ),
  );

  // Intro: the brand.
  const introLogo = h('div', { class: 'logo', html: V.logoInverse });
  const introTag = h('div', { class: 'tag rise' }, msg('tagline'));
  card('intro', h('div', { class: 'intro' }, introLogo, h('div', { class: 'name rise' }, 'SubSweep'), introTag));

  // Privacy.
  const privacyCards = C.privacy.map((p) =>
    h('div', { class: 'pcard rise' }, h('div', { class: 'pi', html: svgIcon(p.icon, 42, '#fff', 2) }), h('b', null, p.title), h('span', null, p.body)),
  );
  card('privacy', h('div', { class: 'privacy' }, h('div', { class: 'pcards' }, privacyCards)));

  // Call to action.
  const typed = h('span', null, '');
  const browsers = h('div', { class: 'browsers rise' }, C.ctaBrowsers.map((b) => h('span', { class: 'pill' }, b)));
  const ctaLink = h('div', { class: 'link rise' }, `${C.ctaLink} ↓`);
  card(
    'cta',
    h(
      'div',
      { class: 'cta' },
      h('div', { class: 'brand' }, raw(V.logoInverse), 'SubSweep'),
      h('div', { class: 'store' }, C.ctaStore),
      h('div', { class: 'search' }, raw(svgIcon('search', 30, '#5f6368', 2.4)), typed, h('i', { class: 'caret' })),
      browsers,
      ctaLink,
      h('div', { class: 'small' }, C.notAffiliated),
    ),
  );

  // Browser chrome.
  $('.bar').append(
    h('div', { class: 'lights' }, h('i'), h('i'), h('i')),
    h('div', { class: 'navs', html: svgIcon('back', 18) + svgIcon('forward', 18) + svgIcon('reload', 17) }),
    h('div', { class: 'omnibox' }, raw(svgIcon('lock', 14, '#5f6368')), h('span', { class: 'host' }, 'www.youtube.com')),
    h('div', { class: 'exts' }, raw(svgIcon('puzzle', 19)), h('div', { id: 'ext-icon', html: V.logo }), h('i', { class: 'me' })),
  );

  function showCard(id) {
    for (const [key, el] of Object.entries(cards)) el.classList.toggle('show', key === id);
  }
  const browser = $('#browser');
  const showBrowser = (on) => browser.classList.toggle('hidden', !on);

  // ---------------------------------------------------------------- cursor

  const cursor = $('#cursor');
  cursor.innerHTML =
    '<span class="ripple"></span><svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5v17.2l4.6-4.3 3 6.9 3-1.3-3-6.8h6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const showCursor = (on) => cursor.classList.toggle('off', !on);
  async function moveTo(x, y, ms = 700) {
    cursor.style.setProperty('--move', `${ms}ms`);
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    await sleep(ms + 30);
  }
  async function clickEffect() {
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click', 'press');
    await sleep(130);
    cursor.classList.remove('press');
  }
  const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // ---------------------------------------------------------------- the panel inside the browser

  const frame = $('#site');
  const site = () => frame.contentWindow;
  const App = () => site().SubSweep.App;
  function panelRoot() {
    const host = frame.contentDocument && frame.contentDocument.querySelector('[data-subsweep="panel"]');
    return host && host.shadowRoot;
  }
  const inPanel = (selector) => () => panelRoot() && panelRoot().querySelector(selector);
  const byText = (selector, text) => () => panelRoot() && [...panelRoot().querySelectorAll(selector)].find((el) => el.textContent.includes(text));

  // The stage is laid out at 1440×810 and scaled to the 1920×1080 viewport (stage.css).
  const SCALE = stage.getBoundingClientRect().width / stage.offsetWidth;

  /**
   * Where an element is, in stage coordinates. Works for the stage's own elements and for
   * elements inside the page in the browser window (following the browser's zoom).
   */
  function stageRect(el) {
    const r = el.getBoundingClientRect();
    if (el.ownerDocument === document) return { left: r.left / SCALE, top: r.top / SCALE, width: r.width / SCALE, height: r.height / SCALE };
    const f = frame.getBoundingClientRect();
    const k = f.width / frame.clientWidth;
    return { left: (f.left + r.left * k) / SCALE, top: (f.top + r.top * k) / SCALE, width: (r.width * k) / SCALE, height: (r.height * k) / SCALE };
  }
  async function waitFor(find, timeout = 20000) {
    const end = performance.now() + timeout;
    for (;;) {
      const found = find();
      if (found) return found;
      if (performance.now() > end) throw new Error(`Timed out waiting for ${find}`);
      await sleep(40);
    }
  }
  async function pointAt(find, ms = 700) {
    const el = typeof find === 'function' ? await waitFor(find) : find;
    const p = center(stageRect(el));
    await moveTo(p.x, p.y, ms);
    return el;
  }
  async function clickOn(find, ms = 700) {
    const el = await pointAt(find, ms);
    await clickEffect();
    el.click();
    await sleep(160);
    return el;
  }

  // Zooming: the browser window is scaled and moved so that a region of the page fills the
  // picture above the subtitles. Regions are measured at zoom 1 (see measure()).
  const FULL_VIEW = { x: 720, y: 362, width: 1380, height: 690 };
  let VIEW = FULL_VIEW;
  browser.style.transformOrigin = '0 0';
  let zoomed = false;

  /** Regions of the page in stage coordinates as they are at zoom 1. */
  function measure(...elements) {
    const k = zoomed ? new DOMMatrix(getComputedStyle(browser).transform) : null;
    const rects = elements.filter(Boolean).map((el) => {
      const r = stageRect(el);
      if (!k) return r;
      // Undo the current zoom: stage point = B + T + (p - B) * s
      const s = k.a;
      const bx = browser.offsetLeft;
      const by = browser.offsetTop;
      return { left: bx + (r.left - bx - k.e) / s, top: by + (r.top - by - k.f) / s, width: r.width / s, height: r.height / s };
    });
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.left + r.width));
    const bottom = Math.max(...rects.map((r) => r.top + r.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  /** Zooms so that `region` (from measure()) fills the view, up to `max` times. Without a region: back to normal. */
  async function zoomTo(region, { max = 1.7, pad = 24, ms = 900 } = {}) {
    browser.style.transition = `transform ${ms}ms cubic-bezier(.65, 0, .35, 1), opacity .6s ease`;
    if (!region) {
      browser.style.transform = 'none';
      zoomed = false;
    } else {
      const s = Math.min(max, VIEW.width / (region.width + pad * 2), VIEW.height / (region.height + pad * 2));
      const c = center(region);
      const bx = browser.offsetLeft;
      const by = browser.offsetTop;
      const tx = VIEW.x - bx - (c.x - bx) * s;
      const ty = VIEW.y - by - (c.y - by) * s;
      browser.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      zoomed = true;
    }
    await sleep(ms + 40);
  }

  // ---------------------------------------------------------------- narration and captions

  const caption = $('#caption');
  const captionText = $('#caption span');
  const LEAD = 300; // ms from the start of a scene to its first line
  const GAP = 240; // between two lines
  const TAIL = 450; // after the last line

  /**
   * Runs one scene: its lines are "spoken" (captioned and marked) on a fixed schedule
   * while `run` animates; the scene lasts until both are done.
   */
  async function scene(id, run, { captions = true } = {}) {
    const def = V.scenes.find((s) => s.id === id);
    mark('scene', { id });
    let t = LEAD;
    const starts = def.lines.map((line) => {
      const start = t;
      t += line.ms + GAP;
      return start;
    });
    const end = t - GAP;
    const cues = def.lines.map(
      (line, i) =>
        new Promise((resolve) =>
          setTimeout(() => {
            mark('line', { key: line.key });
            if (captions) {
              captionText.textContent = line.show;
              caption.classList.add('show');
            }
            resolve();
          }, starts[i]),
        ),
    );
    if (captions) setTimeout(() => caption.classList.remove('show'), end + 200);
    await Promise.all([run({ line: (i) => cues[i] }), sleep(end + TAIL)]);
  }

  // ---------------------------------------------------------------- the video

  window.__ready = async () => {
    if (!(frame.contentDocument && frame.contentDocument.readyState === 'complete' && site().SubSweep)) {
      await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    }
    await document.fonts.ready;
    await frame.contentDocument.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await sleep(400);
    return true;
  };

  window.__play = async () => {
    const t0 = Date.now();
    mark('start');
    showCard('hook');
    showCursor(false);
    $('#fade').classList.add('clear');

    await scene(
      'hook',
      async ({ line }) => {
        $('.hook .pill').classList.add('in');
        await line(0);
        hookLines[0].classList.add('in');
        await line(1);
        wall.classList.add('fade');
        hookLines[1].classList.add('in');
      },
      { captions: false },
    );

    await scene('problem', async ({ line }) => {
      showCard('problem');
      await moveTo(1100, 860, 0);
      showCursor(true);
      await line(0);
      for (const [i, row] of problemRows.entries()) {
        await pointAt(row.button, i ? 380 : 650);
        await clickEffect();
        row.button.classList.add('off');
        row.button.textContent = C.subscribe;
        counterValue.textContent = String(i + 1);
        await sleep(260);
      }
    });

    await scene(
      'intro',
      async ({ line }) => {
        showCursor(false);
        showCard('intro');
        await line(0);
        introLogo.classList.add('in');
        $('.intro .name').classList.add('in');
        await line(1);
        introTag.classList.add('in');
      },
      { captions: false },
    );

    await scene('open', async ({ line }) => {
      showCard(null);
      showBrowser(true);
      await moveTo(900, 470, 0);
      await sleep(500);
      showCursor(true);
      await line(0);
      // Close-up of the toolbar while the button is clicked.
      const exts = measure($('.exts'));
      await zoomTo({ left: exts.left - 330, top: exts.top - 90, width: exts.width + 360, height: 300 }, { max: 2.3, ms: 800 });
      const icon = $('#ext-icon');
      await pointAt(icon, 700);
      icon.classList.add('hot');
      await clickEffect();
      site().SubSweep.Panel.open();
      await sleep(250);
      icon.classList.remove('hot');
      await zoomTo(null, { ms: 800 });
      await line(1);
      const start = await waitFor(inPanel('.hero-scan .btn.primary'));
      await zoomTo(measure(inPanel('.hero')()), { max: 1.25, ms: 700 });
      await clickOn(start, 700);
    });

    await scene('scan', async ({ line }) => {
      // Once the subscription list is in, the welcome screen turns into the channel list
      // with the scan progress card on top: zoom in on that.
      await waitFor(() => !App().state.scan || App().state.scan.steps.subs === 'done');
      await sleep(150);
      const box = await waitFor(inPanel('.scan-card'));
      await moveTo(1300, 660, 500);
      await zoomTo(measure(box, inPanel('.chips')()), { max: 1.7 });
      await line(1);
      await waitFor(() => !App().state.scan, 60000);
      await sleep(600);
    });

    const firstRows = (n) => [...panelRoot().querySelectorAll('.rows .row')].filter((row) => row.querySelector('input.cb')).slice(0, n);

    await scene('results', async ({ line }) => {
      await line(0);
      await waitFor(inPanel('.rows .row'));
      await zoomTo(measure(inPanel('.list-head')(), ...firstRows(4)), { max: 1.6 });
      await pointAt(inPanel('.list-head .col-upload'), 700);
      await sleep(700);
      await pointAt(inPanel('.list-head .col-watched'), 600);
      await sleep(500);
    });

    await scene('filters', async ({ line }) => {
      const chip = (key) => byText('.chips .chip', msg(key));
      await zoomTo(measure(inPanel('.chips')(), inPanel('.toolbar')(), ...firstRows(3)), { max: 1.6, ms: 800 });
      await line(0);
      await clickOn(chip('modeInactive'));
      await line(1);
      await clickOn(chip('modeUnwatched'));
      await line(2);
      await clickOn(chip('modeSuggested'));
      await line(3);
      const select = await pointAt(inPanel('.thresh select'), 700);
      await clickEffect();
      const option = [...select.options].find((o) => Number(o.value) === 12) || select.options[Math.min(select.selectedIndex + 1, select.options.length - 1)];
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await scene('unsub', async ({ line }) => {
      const rows = firstRows(4);
      await zoomTo(measure(inPanel('.list-head')(), ...rows, inPanel('.panel')()), { max: 1.5, ms: 800 });
      await line(0);
      for (const [i, row] of rows.entries()) await clickOn(row.querySelector('input.cb'), i ? 320 : 700);
      await clickOn(inPanel('.dock.show .btn.danger'), 700);
      const dialog = await waitFor(inPanel('.modal'));
      await sleep(250);
      await zoomTo(measure(dialog), { max: 1.6, ms: 700 });
      await line(1);
      await clickOn(inPanel('.modal-actions .btn.danger'), 700);
      await waitFor(() => App().state.unsub && App().state.unsub.finished, 30000);
      await sleep(1200);
      await clickOn(inPanel('.modal-actions .btn.primary'), 600);
    });

    await scene('undo', async ({ line }) => {
      await zoomTo(measure(inPanel('.top')(), inPanel('.list-head')(), ...firstRows(4)), { max: 1.45, ms: 800 });
      await line(0);
      await clickOn(byText('.tabs .tab', msg('tabRemoved')), 700);
      await line(1);
      await clickOn(inPanel('.removed-row .btn'), 800);
      await waitFor(inPanel('.removed-row .badge.good'), 10000);
      await sleep(500);
    });

    await scene('privacy', async ({ line }) => {
      showCursor(false);
      showBrowser(false);
      showCard('privacy');
      for (let i = 0; i < privacyCards.length; i++) {
        await line(i);
        privacyCards[i].classList.add('in');
      }
    });

    await scene('cta', async ({ line }) => {
      showCard('cta');
      await line(0);
      for (const ch of C.ctaSearch) {
        typed.textContent += ch;
        await sleep(110);
      }
      await line(1);
      browsers.classList.add('in');
      await sleep(500);
      ctaLink.classList.add('in');
    });

    await sleep(2600); // room for YouTube's end screen
    $('#fade').classList.remove('clear');
    await sleep(700);
    mark('end');
    return { t0, end: Date.now(), events };
  };

  /** The YouTube thumbnail: a headline on the left, the suggestions list on the right. Run after __play(). */
  window.__thumbnail = async () => {
    caption.classList.remove('show');
    showCursor(false);
    showCard('thumb');
    showBrowser(true);
    App().closeModal();
    App().setTab('channels');
    App().setMode('suggested');
    await sleep(400);
    App().selectMany(firstRowsNow(3).map((row) => row.dataset.id), true);
    await sleep(400);
    // The channel names and the last-upload column, large, on the right of the picture
    // (without the selection bar, which would be cut off at the edge).
    panelRoot().querySelector('.dock').style.display = 'none';
    VIEW = { x: 1040, y: 430, width: 800, height: 800 };
    const region = measure(inPanel('.list-head')(), ...firstRowsNow(5));
    region.width *= 0.62;
    await zoomTo(region, { max: 2, pad: 10, ms: 0 });
    $('#fade').classList.add('clear');
    await sleep(900);
    return true;
  };
  const firstRowsNow = (n) => [...panelRoot().querySelectorAll('.rows .row')].filter((row) => row.querySelector('input.cb')).slice(0, n);

  const T = C.thumb;
  card(
    'thumb',
    h(
      'div',
      { class: 'thumb' },
      h('div', { class: 'thumb-brand' }, raw(logoSmall()), 'SubSweep'),
      T.lines.map((text, i) => h('div', { class: i === T.accent ? 'thumb-line accent' : 'thumb-line' }, text)),
      h('div', { class: 'thumb-tag' }, T.tag),
    ),
  );
  function logoSmall() {
    return V.logoInverse.replace(/width="\d+"/, 'width="64"').replace(/height="\d+"/, 'height="64"');
  }
})();
