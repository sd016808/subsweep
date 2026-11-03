/*
 * SubSweep — the panel UI (Shadow DOM overlay on www.youtube.com) and the launcher button.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  const { h, t, fmt, monthsAgo, DAY } = NS.util;
  const { icon, logo, mark } = NS.icons;
  const App = NS.App;
  const S = App.state;
  const F = NS.filters;

  const MONTH_CHOICES = [1, 2, 3, 6, 9, 12, 18, 24, 36];
  const HISTORY_CHOICES = [3, 6, 12, 24, 36];
  const LIST_THROTTLE_MS = 700;

  let host = null;
  let root = null;
  let wrap = null;
  let isOpen = false;
  let closeTimer = null;
  let launcherHost = null;
  let visibleIds = [];
  let lastClickedId = null;
  let lastListRender = 0;
  let listTimer = null;
  const els = {};

  const isDark = () => document.documentElement.hasAttribute('dark');
  const channelUrl = (id) => `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
  const safeImage = (url) => (typeof url === 'string' && /^(https:\/\/|data:image\/)/.test(url) ? url : '');
  const alive = (el) => Boolean(el && el.isConnected);

  function version() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------- small building blocks

  function hueOf(text) {
    let x = 0;
    for (let i = 0; i < text.length; i++) x = (x * 31 + text.charCodeAt(i)) >>> 0;
    return x % 360;
  }

  function paintInitial(el, channel) {
    const hue = hueOf(channel.id || channel.title || '');
    el.style.background = `linear-gradient(135deg, hsl(${hue} 72% 62%), hsl(${(hue + 42) % 360} 68% 50%))`;
    el.replaceChildren((Array.from(channel.title || '?')[0] || '?').toUpperCase());
  }

  function avatar(channel, size = '', asLink = false) {
    const src = safeImage(channel.thumb);
    const props = { class: ['avatar', size] };
    const el = asLink
      ? h('a', { ...props, href: channelUrl(channel.id), target: '_blank', rel: 'noopener noreferrer', tabindex: '-1', 'aria-hidden': 'true' })
      : h('span', props);
    if (src) {
      const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => paintInitial(el, channel), { once: true });
      el.append(img);
    } else {
      paintInitial(el, channel);
    }
    return el;
  }

  function selectEl(options, value, onChange, label, variant = '') {
    const select = h(
      'select',
      { class: 'select', 'aria-label': label, onChange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h('option', { value: String(v) }, text)),
    );
    select.value = String(value);
    return h('span', { class: ['select-wrap', variant] }, select, icon('chevronDown', 14));
  }

  function switchEl(checked, onChange, label) {
    return h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked, 'aria-label': label, onChange: (e) => onChange(e.target.checked) });
  }

  function segmented(options, value, onChange) {
    return h(
      'div',
      { class: 'seg', role: 'radiogroup' },
      options.map(([v, text]) =>
        h('button', { class: v === value ? 'on' : '', role: 'radio', 'aria-checked': String(v === value), onClick: () => onChange(v) }, text),
      ),
    );
  }

  function emptyState(iconName, title, body) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon(iconName, 26)), h('h4', null, title), body ? h('p', null, body) : null);
  }

  /** @param {...[string, Function]} actions  [label, handler] pairs shown as links */
  function notice(tone, iconName, text, ...actions) {
    return h(
      'div',
      { class: ['notice', tone] },
      icon(iconName, 16),
      h('div', { class: 'grow' }, text, actions.map(([label, handler]) => h('button', { class: 'link-btn', onClick: handler }, label))),
    );
  }

  // ---------------------------------------------------------------- shell

  function mount() {
    if (alive(host)) return;
    host = document.createElement('div');
    host.setAttribute('data-subsweep', 'panel');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483000;display:none;';
    root = host.attachShadow({ mode: 'closed' });
    wrap = h('div', { class: 'ss', lang: fmt.locale() });
    root.append(h('style', null, NS.styles.panel), wrap);

    // If SubSweep was updated since this page loaded, say so before anything is clicked.
    host.addEventListener('pointerdown', () => App.ensureAlive(), true);

    // Keep YouTube's keyboard shortcuts from firing while typing in the panel.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === 'keydown' && event.key === 'Escape') onEscape();
      });
    }

    els.backdrop = h('div', { class: 'backdrop', onClick: close });
    els.backdrop.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    els.tabs = h('nav', { class: 'tabs', role: 'tablist' });
    els.body = h('main', { class: 'body', tabindex: '-1' });
    els.dock = h('div', { class: 'dock', role: 'toolbar' });
    els.modal = h('div', {
      class: 'modal-layer',
      onClick: (event) => {
        if (event.target === els.modal) App.closeModal();
      },
    });
    els.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    els.panel = h(
      'aside',
      { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('extShortName'), tabindex: '-1' },
      h(
        'header',
        { class: 'top' },
        h('div', { class: 'brand' }, logo(34), h('div', { style: { minWidth: '0' } }, h('div', { class: 'brand-name' }, t('extShortName')), h('div', { class: 'brand-sub' }, t('tagline')))),
        els.tabs,
        h('button', { class: 'icon-btn', title: t('close'), 'aria-label': t('close'), onClick: close }, icon('x', 20)),
      ),
      els.body,
      els.dock,
      els.modal,
      els.toasts,
    );
    wrap.append(els.backdrop, els.panel);
    document.documentElement.append(host);
  }

  function onEscape() {
    if (S.modal) App.closeModal();
    else close();
  }

  function renderTabs() {
    const pendingUndo = S.data.removed.filter((entry) => !entry.resubscribedAt).length;
    const tabs = [
      ['channels', 'list', t('tabChannels'), 0],
      ['removed', 'history', t('tabRemoved'), pendingUndo],
      ['settings', 'sliders', t('tabSettings'), 0],
    ];
    els.tabs.replaceChildren(
      ...tabs.map(([id, iconName, label, count]) =>
        h(
          'button',
          { class: ['tab', S.tab === id && 'on'], role: 'tab', 'aria-selected': String(S.tab === id), onClick: () => App.setTab(id) },
          icon(iconName, 15),
          label,
          count ? h('span', { class: 'count' }, fmt.num(count)) : null,
        ),
      ),
    );
  }

  function renderBody() {
    els.scanUI = null;
    els.unsubUI = null;
    els.hasSubs = undefined;
    els.settingsBusy = undefined;
    if (!S.ready) {
      els.body.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
      return;
    }
    if (!S.loggedIn) {
      els.body.replaceChildren(viewSignedOut());
      return;
    }
    if (S.tab === 'removed') els.body.replaceChildren(viewRemoved());
    else if (S.tab === 'settings') els.body.replaceChildren(viewSettings());
    else {
      els.hasSubs = S.data.subsOrder.length > 0;
      // Regions are filled after insertion: their renderers skip detached containers.
      if (els.hasSubs) {
        els.body.replaceChildren(...viewChannels());
        renderScanBox();
        renderChips();
        renderToolbar();
        renderNotices();
        renderList();
      } else {
        els.body.replaceChildren(viewHero());
        renderScanBox();
      }
    }
  }

  // ---------------------------------------------------------------- first run / signed out

  function feature(iconName, title, body) {
    return h('div', { class: 'feature' }, h('div', { class: 'feature-icon' }, icon(iconName, 19)), h('b', null, title), h('span', null, body));
  }

  function viewHero() {
    els.scanBox = h('div', { class: 'hero-scan' });
    els.scanMode = 'hero';
    const view = h(
      'div',
      { class: 'hero' },
      h('div', { class: 'hero-logo' }, logo(78)),
      h('h2', null, t('heroTitle')),
      h('p', null, t('heroBody')),
      h(
        'div',
        { class: 'features' },
        feature('users', t('feature1Title'), t('feature1Body')),
        feature('history', t('feature2Title'), t('feature2Body')),
        feature('userMinus', t('feature3Title'), t('feature3Body')),
      ),
      els.scanBox,
      h('div', { class: 'privacy-note' }, icon('shield', 15), t('privacyNote')),
    );
    return view;
  }

  function viewSignedOut() {
    return h(
      'div',
      { class: 'hero' },
      h('div', { class: 'hero-logo' }, logo(70)),
      h('h2', null, t('signedOutTitle')),
      h('p', null, t('signedOutBody')),
      h('div', { style: { marginTop: '26px' } }, h('button', { class: 'btn primary lg', onClick: () => location.reload() }, icon('refresh', 18), t('reloadPage'))),
    );
  }

  // ---------------------------------------------------------------- channels tab

  function viewChannels() {
    els.scanBox = h('section', { class: 'scan-card' });
    els.scanMode = 'card';
    els.chips = h('div', { class: 'chips' });
    els.toolbar = h('div', { class: 'toolbar' });
    els.notices = h('div');
    els.headCb = h('input', {
      type: 'checkbox',
      class: 'cb',
      'aria-label': t('selectAll'),
      onChange: (event) => App.selectMany(visibleIds, event.target.checked),
    });
    els.headCount = h('span', { class: 'count' });
    els.rows = h('div', { class: 'rows', onClick: onRowsClick });
    els.sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true' });
    listState.key = ''; // a fresh view starts at the top
    const list = h(
      'div',
      { class: 'list' },
      h('div', { class: 'list-head grid' }, els.headCb, els.headCount, h('div', { class: 'col-upload' }, t('colLastUpload')), h('div', { class: 'col-watched' }, t('colLastWatched')), h('div')),
      els.rows,
      els.sentinel,
    );
    return [els.scanBox, els.chips, els.toolbar, els.notices, list];
  }

  function renderScanBox() {
    if (!alive(els.scanBox)) return;
    const running = Boolean(S.scan);
    if (els.scanMode === 'hero') els.scanBox.className = running ? 'hero-scan scan-card running' : 'hero-scan';
    else els.scanBox.className = running ? 'scan-card running' : 'scan-card';

    if (running) {
      if (!els.scanUI || !els.scanBox.contains(els.scanUI.steps[0].el)) {
        els.scanUI = buildScanUI();
        els.scanBox.replaceChildren(...els.scanUI.nodes);
      }
      updateScanUI(els.scanUI);
      return;
    }
    els.scanUI = null;
    if (els.scanMode === 'hero') {
      els.scanBox.replaceChildren(h('button', { class: 'btn primary lg', onClick: () => App.scan() }, icon('sparkles', 18), t('scanStart')));
      return;
    }
    const d = S.data;
    const resumable = App.resumeState().any;
    els.scanBox.replaceChildren(
      h('div', { class: 'scan-glyph' }, icon('sparkles', 22)),
      h(
        'div',
        { class: 'scan-info' },
        h('div', { class: 'scan-title' }, t('scanCardTitle', fmt.num(d.subsOrder.length))),
        h('div', { class: 'scan-meta' }, resumable || !d.lastScanAt ? t('scanIncomplete') : t('lastScanned', fmt.relative(d.lastScanAt, { precise: true }))),
      ),
      resumable
        ? h('button', { class: 'btn primary', disabled: Boolean(S.unsub), onClick: () => App.scan() }, icon('play', 15), t('scanResume'))
        : h('button', { class: 'btn primary', disabled: Boolean(S.unsub), onClick: () => App.scan() }, icon('refresh', 16), t('scanAgain')),
    );
  }

  const SCAN_STEPS = [
    ['subs', 'users', 'stepSubs'],
    ['history', 'history', 'stepHistory'],
    ['uploads', 'video', 'stepUploads'],
  ];

  function buildScanUI() {
    const steps = SCAN_STEPS.map(([id, iconName, labelKey]) => {
      const iconBox = h('div', { class: 'step-icon' });
      const detail = h('div', { class: 'step-detail' });
      const el = h('div', { class: 'step pending' }, iconBox, h('div', { class: 'step-text' }, h('div', { class: 'step-label' }, t(labelKey)), detail));
      return { id, iconName, el, iconBox, detail, state: '' };
    });
    const bar = h('div', { class: 'bar' });
    const progress = h('div', { class: 'progress indeterminate' }, bar);
    return {
      steps,
      bar,
      progress,
      nodes: [
        h('div', { class: 'steps' }, steps.map((s) => s.el)),
        h('div', { class: 'scan-foot' }, progress, h('button', { class: 'btn ghost sm', title: t('pauseHint'), onClick: () => App.stopScan() }, icon('pause', 13), t('pause'))),
      ],
    };
  }

  function historyDetail(sc) {
    const state = sc.steps.history;
    if (state === 'pending') return t('stepWaiting');
    if (state === 'error') return t('stepFailed');
    if (sc.historyOldest && sc.historyCount) return t('historyBackTo', fmt.date(sc.historyOldest));
    return state === 'done' ? t('upToDate') : t('stepStarting');
  }

  function updateScanUI(ui) {
    const sc = S.scan;
    const details = {
      subs: sc.subs ? t('nChannels', fmt.num(sc.subs)) : t('stepStarting'),
      history: historyDetail(sc),
      uploads: sc.steps.uploads === 'pending' ? t('stepWaiting') : sc.uploadsTotal ? `${fmt.num(sc.uploadsDone)} / ${fmt.num(sc.uploadsTotal)}` : t('upToDate'),
    };
    // History and latest uploads run at the same time, so each step has its own state.
    ui.steps.forEach((step) => {
      const state = sc.steps[step.id];
      if (state !== step.state) {
        step.state = state;
        step.el.className = `step ${state === 'error' ? 'done error' : state}`;
        step.iconBox.replaceChildren(
          state === 'done' ? icon('check', 16) : state === 'error' ? icon('alert', 16) : state === 'active' ? h('span', { class: 'spinner' }) : icon(step.iconName, 16),
        );
      }
      step.detail.textContent = details[step.id];
    });
    // Overall progress: the average of the history (by date reached) and the uploads checked.
    let pct = null;
    if (sc.steps.subs === 'done') {
      const history = sc.steps.history === 'active' ? sc.historyPct || 0 : sc.steps.history === 'pending' ? 0 : 1;
      const uploads = sc.uploadsTotal ? sc.uploadsDone / sc.uploadsTotal : sc.steps.uploads === 'pending' ? 0 : 1;
      pct = ((history + uploads) / 2) * 100;
    }
    ui.progress.classList.toggle('indeterminate', pct == null);
    ui.bar.style.width = pct == null ? '' : `${pct.toFixed(1)}%`;
  }

  const MODE_DEFS = [
    ['suggested', 'sparkles', 'modeSuggested'],
    ['inactive', 'moon', 'modeInactive'],
    ['unwatched', 'eyeOff', 'modeUnwatched'],
    ['both', 'target', 'modeBoth'],
    ['all', 'list', 'modeAll'],
    ['kept', 'bookmark', 'modeKept'],
  ];

  function renderChips() {
    if (!alive(els.chips)) return;
    const counts = F.countModes(App.rows());
    els.chips.replaceChildren(
      ...MODE_DEFS.filter(([mode]) => mode !== 'kept' || counts.kept || S.settings.mode === 'kept').map(([mode, iconName, labelKey]) =>
        h(
          'button',
          { class: ['chip', S.settings.mode === mode && 'on'], 'aria-pressed': String(S.settings.mode === mode), onClick: () => App.setMode(mode) },
          icon(iconName, 15),
          t(labelKey),
          h('span', { class: 'n' }, fmt.num(counts[mode])),
        ),
      ),
    );
  }

  function renderToolbar() {
    if (!alive(els.toolbar)) return;
    const hadFocus = els.search && root.activeElement === els.search;
    els.search = h('input', {
      type: 'search',
      value: S.query,
      placeholder: t('searchPlaceholder'),
      'aria-label': t('searchPlaceholder'),
      onInput: (event) => App.setQuery(event.target.value),
    });
    const months = MONTH_CHOICES.map((m) => [m, fmt.months(m)]);
    els.toolbar.replaceChildren(
      h('label', { class: 'thresh' }, icon('moon', 14), t('inactiveFor'), selectEl(months, S.settings.inactiveMonths, (v) => App.setSetting('inactiveMonths', Number(v)), t('inactiveFor'))),
      h('label', { class: 'thresh' }, icon('eyeOff', 14), t('unwatchedFor'), selectEl(months, S.settings.unwatchedMonths, (v) => App.setSetting('unwatchedMonths', Number(v)), t('unwatchedFor'))),
      h('label', { class: 'search' }, icon('search', 16), els.search),
      selectEl(
        [
          ['upload', t('sortUpload')],
          ['watched', t('sortWatched')],
          ['name', t('sortName')],
        ],
        S.settings.sort,
        (v) => App.setSetting('sort', v),
        t('sortLabel'),
        'plain',
      ),
      h('button', { class: 'icon-btn bordered', title: t('exportCsv'), 'aria-label': t('exportCsv'), onClick: () => App.exportCsv() }, icon('download', 17)),
    );
    if (hadFocus) els.search.focus();
  }

  function renderNotices() {
    if (!alive(els.notices)) return;
    const items = [];
    const pending = App.pendingUnsub();
    if (pending.length) {
      items.push(
        notice('warn', 'userMinus', t('noticeUnsubPending', fmt.num(pending.length)), [t('unsubContinue'), () => App.continueUnsub()], [t('unsubDiscard'), () => App.discardUnsub()]),
      );
    }
    const info = App.historyInfo();
    const error = S.data.historyError;
    if (!info.ready && error) {
      items.push(notice('warn', 'alert', t(error === 'format' ? 'noticeHistoryFormat' : 'noticeHistoryFailed'), [t('openSettings'), () => App.setTab('settings')]));
    } else if (info.empty) {
      items.push(notice('warn', 'eyeOff', t('noticeHistoryEmpty')));
    } else if (info.ready) {
      if (error && !S.data.takeout) items.push(notice('warn', 'alert', t('noticeHistoryStale')));
      const needed = monthsAgo(S.settings.unwatchedMonths);
      if (info.from && needed < info.from - 2 * DAY) {
        if (info.reachedEnd) items.push(notice('', 'info', t('noticeHistoryShort', fmt.date(info.from))));
        else if (!S.scan) items.push(notice('warn', 'history', t('noticeHistoryRescan', fmt.date(info.from)), [t('scanAgain'), () => App.scan()]));
      }
    }
    els.notices.replaceChildren(...items);
  }

  function scheduleList() {
    const wait = S.scan || (S.unsub && !S.unsub.finished) ? LIST_THROTTLE_MS : 0;
    const since = performance.now() - lastListRender;
    if (since >= wait) {
      clearTimeout(listTimer);
      listTimer = null;
      renderList();
    } else if (!listTimer) {
      listTimer = setTimeout(() => {
        listTimer = null;
        renderList();
      }, wait - since);
    }
  }

  function uploadCell(r) {
    if (!r.uploadChecked) return { tone: 'muted', main: S.scan ? t('checking') : '—', sub: '' };
    if (r.noVideos) return { tone: r.inactive ? 'bad' : 'muted', main: t('noVideos'), sub: '' };
    if (r.lastUpload == null) return { tone: 'muted', main: t('unknown'), sub: '' };
    return { tone: r.inactive ? 'bad' : 'good', main: fmt.relative(r.lastUpload), sub: fmt.date(r.lastUpload) };
  }

  function watchedCell(r, historyReady) {
    if (!historyReady) return { tone: 'muted', main: '—', sub: '' };
    if (r.lastWatched == null) return { tone: r.unwatched ? 'bad' : 'muted', main: t('neverWatched'), sub: t('neverWatchedSub') };
    return { tone: r.unwatched ? 'bad' : 'good', main: fmt.relative(r.lastWatched), sub: t('watchCount', fmt.num(r.watchCount)) };
  }

  function cellEl(cell) {
    return h(
      'div',
      { class: ['cell', cell.tone] },
      h('span', { class: 'dot' }),
      h('div', { style: { minWidth: '0' } }, h('div', { class: 'cell-main' }, cell.main), cell.sub ? h('div', { class: 'cell-sub' }, cell.sub) : null),
    );
  }

  function rowEl(r, historyReady) {
    const selected = S.selected.has(r.id);
    const upload = uploadCell(r);
    const watched = watchedCell(r, historyReady);
    const sub = [r.ch.handle, r.ch.subscribers].filter(Boolean).join(' · ');
    return h(
      'div',
      { class: ['row', 'grid', selected && 'sel'], dataset: { id: r.id } },
      h('input', { type: 'checkbox', class: 'cb', checked: selected, 'aria-label': r.ch.title }),
      h(
        'div',
        { class: 'channel' },
        avatar(r.ch, '', true),
        h(
          'div',
          { class: 'ch-text' },
          h(
            'a',
            { class: 'ch-title', href: channelUrl(r.id), target: '_blank', rel: 'noopener noreferrer', title: t('openChannel') },
            h('span', null, r.ch.title),
            r.kept ? h('span', { class: 'badge' }, t('keptBadge')) : null,
            icon('external', 13),
          ),
          sub ? h('div', { class: 'ch-sub' }, sub) : null,
          h(
            'div',
            { class: 'compact-meta' },
            h('span', { class: upload.tone === 'bad' ? 'bad' : '' }, `${t('colLastUpload')}: ${upload.main}`),
            ' · ',
            h('span', { class: watched.tone === 'bad' ? 'bad' : '' }, `${t('colLastWatched')}: ${watched.main}`),
          ),
        ),
      ),
      cellEl(upload),
      cellEl(watched),
      h(
        'button',
        {
          class: ['icon-btn', 'keep', r.kept && 'on'],
          dataset: { action: 'keep' },
          title: r.kept ? t('unkeepHint') : t('keepHint'),
          'aria-label': r.kept ? t('unkeepHint') : t('keepHint'),
          'aria-pressed': String(r.kept),
        },
        icon('bookmark', 17),
      ),
    );
  }

  function emptyList(total) {
    if (S.query) return emptyState('search', t('emptySearchTitle'), t('emptySearchBody', S.query));
    if (S.settings.mode === 'kept') return emptyState('bookmark', t('emptyKeptTitle'), t('emptyKeptBody'));
    if (S.scan) return emptyState('sparkles', t('emptyScanningTitle'), t('emptyScanningBody'));
    if (!total) return emptyState('users', t('emptyNoSubsTitle'), '');
    return emptyState('sparkles', t('emptyFilteredTitle'), t('emptyFilteredBody'));
  }

  // Long lists are rendered in pages: the first PAGE_SIZE rows right away, more as the
  // user scrolls near the end (a sentinel element watched by an IntersectionObserver).
  // This keeps opening and filtering fast with thousands of subscriptions.
  const PAGE_SIZE = 80;
  const listState = { key: '', shown: [], rendered: 0, historyReady: false };
  let listObserver = null;

  function renderList() {
    if (!alive(els.rows)) return;
    lastListRender = performance.now();
    const all = App.rows();
    const shown = F.sortRows(F.filterRows(all, S.settings.mode, S.query), S.settings.sort, fmt.locale());
    visibleIds = shown.map((r) => r.id);
    // Same filter as before (e.g. a refresh during a scan): keep as many rows as were
    // already shown, so the scroll position doesn't jump.
    const key = [S.settings.mode, S.query, S.settings.sort, S.settings.inactiveMonths, S.settings.unwatchedMonths].join('|');
    const keep = key === listState.key ? listState.rendered : 0;
    Object.assign(listState, { key, shown, rendered: 0, historyReady: App.historyInfo().ready });

    els.headCount.textContent = t('listCount', fmt.num(shown.length));
    if (!shown.length) {
      els.rows.replaceChildren(emptyList(all.length));
      els.sentinel.hidden = true;
    } else {
      els.rows.replaceChildren();
      appendRows(Math.max(PAGE_SIZE, keep));
      watchSentinel();
    }
    syncHeadCheckbox();
  }

  function appendRows(count) {
    const end = Math.min(listState.shown.length, listState.rendered + count);
    if (end > listState.rendered) {
      const fragment = document.createDocumentFragment();
      for (let i = listState.rendered; i < end; i++) fragment.append(rowEl(listState.shown[i], listState.historyReady));
      els.rows.append(fragment);
      listState.rendered = end;
    }
    els.sentinel.hidden = listState.rendered >= listState.shown.length;
  }

  function watchSentinel() {
    if (listObserver) listObserver.disconnect();
    if (els.sentinel.hidden) return;
    listObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        appendRows(PAGE_SIZE);
        // Re-observe so we hear about it again if the sentinel is still on screen.
        listObserver.unobserve(els.sentinel);
        if (!els.sentinel.hidden) listObserver.observe(els.sentinel);
      },
      { root: els.body, rootMargin: '0px 0px 900px 0px' },
    );
    listObserver.observe(els.sentinel);
  }

  function syncHeadCheckbox() {
    if (!alive(els.headCb)) return;
    const selectedVisible = visibleIds.reduce((n, id) => n + (S.selected.has(id) ? 1 : 0), 0);
    els.headCb.checked = selectedVisible > 0 && selectedVisible === visibleIds.length;
    els.headCb.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    els.headCb.disabled = !visibleIds.length;
  }

  function syncSelection() {
    if (!alive(els.rows)) return;
    for (const row of els.rows.children) {
      const id = row.dataset && row.dataset.id;
      if (!id) continue;
      const on = S.selected.has(id);
      row.classList.toggle('sel', on);
      const checkbox = row.querySelector('input.cb');
      if (checkbox) checkbox.checked = on;
    }
    syncHeadCheckbox();
  }

  function onRowsClick(event) {
    const row = event.target.closest('.row');
    if (!row || !row.dataset.id) return;
    const id = row.dataset.id;
    if (event.target.closest('[data-action="keep"]')) {
      App.toggleKeep(id);
      return;
    }
    if (event.target.closest('a')) return;
    const checkbox = event.target.closest('input.cb');
    const next = checkbox ? checkbox.checked : !S.selected.has(id);
    if (event.shiftKey && lastClickedId && lastClickedId !== id) {
      const a = visibleIds.indexOf(lastClickedId);
      const b = visibleIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        App.selectMany(visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1), next);
        lastClickedId = id;
        return;
      }
    }
    lastClickedId = id;
    App.toggleSelect(id, next);
  }

  // ---------------------------------------------------------------- removed tab

  function viewRemoved() {
    const list = S.data.removed;
    if (!list.length) return emptyState('history', t('removedEmptyTitle'), t('removedEmptyBody'));
    const busy = Boolean(S.unsub && !S.unsub.finished);
    return h(
      'div',
      null,
      h(
        'div',
        { class: 'section-head' },
        h('div', null, h('h3', null, t('removedTitle')), h('p', null, t('removedSubtitle'))),
        h('button', { class: 'btn ghost sm', onClick: () => App.clearRemoved() }, icon('trash', 14), t('clearLog')),
      ),
      h(
        'div',
        { class: 'list' },
        list.map((entry) =>
          h(
            'div',
            { class: 'row removed-row' },
            h(
              'div',
              { class: 'channel' },
              avatar(entry, '', true),
              h(
                'div',
                { class: 'ch-text' },
                h('a', { class: 'ch-title', href: channelUrl(entry.id), target: '_blank', rel: 'noopener noreferrer' }, h('span', null, entry.title), icon('external', 13)),
                h('div', { class: 'ch-sub' }, t('unsubscribedAt', fmt.relative(entry.at, { precise: true }))),
              ),
            ),
            entry.resubscribedAt
              ? h('span', { class: 'badge good' }, icon('check', 12), t('resubscribed'))
              : h(
                  'button',
                  { class: 'btn ghost sm', disabled: Boolean(entry.pending) || busy, onClick: () => App.resubscribe(entry.id) },
                  entry.pending ? h('span', { class: 'spinner' }) : icon('undo', 14),
                  t('resubscribe'),
                ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- settings tab

  function group(title, rows) {
    return h('section', { class: 'set-group' }, h('h4', null, title), h('div', { class: 'set-card' }, rows));
  }

  function setRow(title, hint, control) {
    return h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, title), hint ? h('div', { class: 'set-hint' }, hint) : null), control);
  }

  function viewSettings() {
    const s = S.settings;
    const d = S.data;
    const busy = Boolean(S.scan || (S.unsub && !S.unsub.finished));
    els.settingsBusy = busy;
    const fileInput = h('input', {
      type: 'file',
      accept: '.json,application/json',
      style: { display: 'none' },
      onChange: (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        App.importTakeout(file);
      },
    });
    const takeoutHint = d.takeout
      ? [t('takeoutImported', fmt.num(d.takeout.entries), fmt.date(d.takeout.importedAt)), ' ', h('button', { class: 'link-btn', onClick: () => App.removeTakeout() }, t('remove'))]
      : [t('setTakeoutHint'), ' ', h('a', { class: 'link-btn', href: 'https://takeout.google.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Google Takeout ↗')];

    return h(
      'div',
      { class: 'settings' },
      group(t('setGroupScan'), [
        setRow(
          t('setHistoryRange'),
          t('setHistoryRangeHint'),
          selectEl(HISTORY_CHOICES.map((m) => [m, fmt.months(m)]), s.historyMonths, (v) => App.setSetting('historyMonths', Number(v)), t('setHistoryRange'), 'plain'),
        ),
        setRow(t('setNoVideos'), t('setNoVideosHint'), switchEl(s.includeNoVideos, (v) => App.setSetting('includeNoVideos', v), t('setNoVideos'))),
        setRow(t('setNeverWatched'), t('setNeverWatchedHint'), switchEl(s.includeNeverWatched, (v) => App.setSetting('includeNeverWatched', v), t('setNeverWatched'))),
      ]),
      group(t('setGroupUnsub'), [
        setRow(
          t('setSpeed'),
          t('setSpeedHint'),
          segmented(
            [
              ['fast', t('speedFast')],
              ['normal', t('speedNormal')],
              ['gentle', t('speedGentle')],
            ],
            s.speed,
            (v) => App.setSetting('speed', v),
          ),
        ),
      ]),
      group(t('setGroupDisplay'), [setRow(t('setLauncher'), t('setLauncherHint'), switchEl(s.showLauncher, (v) => App.setSetting('showLauncher', v), t('setLauncher')))]),
      group(t('setGroupData'), [
        setRow(
          t('setRereadHistory'),
          t('setRereadHistoryHint'),
          h('button', { class: 'btn ghost sm', disabled: busy, onClick: () => App.rescan({ fullHistory: true }) }, icon('history', 14), t('run')),
        ),
        setRow(
          t('setRecheckUploads'),
          t('setRecheckUploadsHint'),
          h('button', { class: 'btn ghost sm', disabled: busy, onClick: () => App.rescan({ recheckUploads: true }) }, icon('refresh', 14), t('run')),
        ),
        setRow(t('setTakeout'), takeoutHint, [fileInput, h('button', { class: 'btn ghost sm', onClick: () => fileInput.click() }, icon('upload', 14), t('chooseFile'))]),
        setRow(
          t('setExport'),
          t('setExportHint'),
          h('button', { class: 'btn ghost sm', disabled: !d.subsOrder.length, onClick: () => App.exportCsv() }, icon('download', 14), t('exportCsv')),
        ),
        setRow(t('setClear'), t('setClearHint'), h('button', { class: 'btn danger-ghost sm', disabled: busy, onClick: () => App.askClearAll() }, icon('trash', 14), t('setClearButton'))),
      ]),
      h(
        'div',
        { class: 'about' },
        icon('shield', 20),
        h('div', null, h('b', null, t('aboutTitle')), h('p', null, t('aboutBody')), h('div', { class: 'version' }, `${t('extShortName')} ${version()} · ${t('notAffiliated')}`)),
      ),
    );
  }

  // ---------------------------------------------------------------- dock, modal, toasts

  function renderDock() {
    const count = S.selected.size;
    const show = isOpen && count > 0 && S.tab === 'channels' && S.loggedIn && !S.modal;
    els.dock.classList.toggle('show', show);
    if (!show) return;
    els.dock.replaceChildren(
      h('span', { class: 'dock-count' }, t('selectedCount', fmt.num(count))),
      h('button', { class: 'btn subtle sm', onClick: () => App.clearSelection() }, t('clearSelection')),
      h(
        'button',
        { class: 'btn danger', disabled: Boolean(S.scan), title: S.scan ? t('waitForScan') : null, onClick: () => App.askUnsubscribe() },
        icon('userMinus', 16),
        t('unsubscribeButton', fmt.num(count)),
      ),
    );
  }

  function reasonText(row) {
    if (row.inactive && row.unwatched) return t('reasonBoth');
    if (row.inactive) return t('reasonInactive');
    if (row.unwatched) return t('reasonUnwatched');
    return '';
  }

  function confirmView(modal) {
    const channels = modal.ids.map((id) => S.data.subs[id]).filter(Boolean);
    const rowsById = new Map(App.rows().map((r) => [r.id, r]));
    return [
      h('div', { class: 'modal-icon danger' }, icon('userMinus', 24)),
      h('h3', null, t('confirmTitle', fmt.num(channels.length))),
      h('p', null, t('confirmBody', fmt.duration(App.estimateMs(channels.length)))),
      h(
        'ul',
        { class: 'name-list' },
        channels.map((ch) => {
          const row = rowsById.get(ch.id);
          const why = row ? reasonText(row) : '';
          return h('li', null, avatar(ch, 'sm'), h('span', null, ch.title), why ? h('span', { class: 'why' }, why) : null);
        }),
      ),
      h('div', { class: 'hint' }, icon('undo', 16), h('span', null, t('confirmUndo'))),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onClick: () => App.closeModal() }, t('cancel')),
        h('button', { class: 'btn danger', onClick: () => App.runUnsubscribe(channels.map((c) => c.id)) }, icon('userMinus', 16), t('confirmButton', fmt.num(channels.length))),
      ),
    ];
  }

  /** Running unsubscribe: built once, then updated in place so animations stay smooth. */
  function buildUnsubUI() {
    const ui = {
      count: h('span'),
      ok: h('span'),
      fail: h('span'),
      bar: h('div', { class: 'bar', style: { width: '0%' } }),
      currentAvatar: h('span'),
      currentName: h('span'),
    };
    ui.failWrap = h('span', { class: 'fail', style: { display: 'none' } }, icon('x', 14), ui.fail);
    ui.current = h('div', { class: 'current' }, ui.currentAvatar, ui.currentName, h('span', { class: 'spinner' }));
    ui.nodes = [
      h('div', { class: 'modal-icon' }, h('span', { class: 'spinner' })),
      h('h3', null, t('unsubRunningTitle')),
      h('p', null, t('unsubRunningBody')),
      h('div', { class: 'progress' }, ui.bar),
      h('div', { class: 'progress-meta' }, ui.count, h('span', { class: 'ok' }, icon('check', 14), ui.ok), ui.failWrap),
      ui.current,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onClick: () => App.stopUnsubscribe() }, icon('square', 14), t('stop'))),
    ];
    return ui;
  }

  function updateUnsubUI(ui) {
    const u = S.unsub;
    const batchPhase = u.phase === 'sending' || u.phase === 'verifying';
    const progress = batchPhase ? Math.max(u.done, u.sent || 0) : u.done;
    ui.count.textContent = `${fmt.num(progress)} / ${fmt.num(u.total)}`;
    ui.ok.textContent = fmt.num(u.ok);
    ui.fail.textContent = fmt.num(u.fail);
    ui.failWrap.style.display = u.fail ? '' : 'none';
    ui.bar.style.width = `${u.total ? (progress / u.total) * 100 : 0}%`;
    if (batchPhase) {
      if (ui.currentId !== u.phase) {
        ui.currentId = u.phase;
        ui.currentAvatar.replaceChildren(h('span', { class: 'phase-icon' }, icon(u.phase === 'sending' ? 'userMinus' : 'shield', 17)));
        ui.currentName.textContent = u.phase === 'sending' ? t('unsubSending') : t('unsubVerifying');
      }
      ui.current.style.visibility = 'visible';
      return;
    }
    if (u.current && ui.currentId !== u.current.id) {
      ui.currentId = u.current.id;
      ui.currentAvatar.replaceChildren(avatar(u.current, 'md'));
      ui.currentName.textContent = u.current.title;
    }
    ui.current.style.visibility = u.current ? 'visible' : 'hidden';
  }

  function finishedView() {
    const u = S.unsub;
    let tone = 'good';
    let iconName = 'check';
    let title = t('unsubDoneTitle');
    let body = t('unsubDoneBody', fmt.num(u.ok));
    if (u.fatal) {
      tone = 'warn';
      iconName = 'alert';
      title = t('unsubStoppedTitle');
      body = t(u.fatal === 'session' ? 'errSession' : 'unsubTooManyFailures');
    } else if (u.stopped) {
      tone = 'warn';
      iconName = 'square';
      title = t('unsubStoppedTitle');
      body = t('unsubStoppedBody', fmt.num(u.ok));
    } else if (u.fail) {
      tone = 'warn';
      iconName = 'alert';
      body = t('unsubDoneWithFail', fmt.num(u.ok), fmt.num(u.fail));
    }
    return [
      h('div', { class: ['modal-icon', tone] }, icon(iconName, 24)),
      h('h3', null, title),
      h('p', null, body),
      h('div', { class: 'progress' }, h('div', { class: 'bar', style: { width: `${u.total ? (u.done / u.total) * 100 : 100}%` } })),
      h(
        'div',
        { class: 'progress-meta' },
        h('span', null, `${fmt.num(u.done)} / ${fmt.num(u.total)}`),
        h('span', { class: 'ok' }, icon('check', 14), fmt.num(u.ok)),
        u.fail ? h('span', { class: 'fail' }, icon('x', 14), fmt.num(u.fail)) : null,
      ),
      u.failures.length
        ? [h('p', null, t('unsubFailedList')), h('ul', { class: 'name-list' }, u.failures.map((f) => h('li', null, avatar(f, 'sm'), h('span', null, f.title))))]
        : null,
      u.ok ? h('div', { class: 'hint' }, icon('undo', 16), h('span', null, t('confirmUndo'))) : null,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onClick: () => App.closeModal() }, t('done'))),
    ];
  }

  function outdatedView() {
    return [
      h('div', { class: 'modal-icon' }, icon('refresh', 24)),
      h('h3', null, t('outdatedTitle')),
      h('p', null, t('outdatedBody')),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onClick: () => App.closeModal() }, t('cancel')),
        h('button', { class: 'btn primary', onClick: () => location.reload() }, icon('refresh', 15), t('reloadPage')),
      ),
    ];
  }

  function clearView() {
    return [
      h('div', { class: 'modal-icon danger' }, icon('trash', 24)),
      h('h3', null, t('clearTitle')),
      h('p', null, t('clearBody')),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onClick: () => App.closeModal() }, t('cancel')),
        h('button', { class: 'btn danger', onClick: () => App.clearAll() }, icon('trash', 15), t('setClearButton')),
      ),
    ];
  }

  function renderModal() {
    const modal = S.modal;
    els.modal.classList.toggle('show', Boolean(modal));
    if (!modal) {
      els.unsubUI = null;
      els.modal.replaceChildren();
      return;
    }
    if (modal.type === 'unsub' && S.unsub && !S.unsub.finished) {
      if (!els.unsubUI || !els.modal.contains(els.unsubUI.bar)) {
        els.unsubUI = buildUnsubUI();
        els.modal.replaceChildren(h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' }, els.unsubUI.nodes));
      }
      updateUnsubUI(els.unsubUI);
      return;
    }
    els.unsubUI = null;
    let content = [];
    if (modal.type === 'confirm') content = confirmView(modal);
    else if (modal.type === 'unsub' && S.unsub) content = finishedView();
    else if (modal.type === 'clear') content = clearView();
    else if (modal.type === 'outdated') content = outdatedView();
    els.modal.replaceChildren(h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' }, content));
  }

  const TOAST_ICONS = { success: 'check', error: 'alert', warn: 'alert', info: 'info' };

  function renderToasts() {
    const existing = new Map(Array.from(els.toasts.children, (el) => [el.dataset.id, el]));
    els.toasts.replaceChildren(
      ...S.toasts.map(
        (item) =>
          existing.get(String(item.id)) ||
          h('div', { class: ['toast', item.tone], role: 'status', dataset: { id: String(item.id) } }, icon(TOAST_ICONS[item.tone] || 'info', 17), h('span', null, item.text)),
      ),
    );
  }

  // ---------------------------------------------------------------- updates

  function update(regions) {
    if (regions.has('launcher') || regions.has('all')) renderLauncher();
    if (!isOpen || !wrap) return;
    wrap.classList.toggle('dark', isDark());

    if (regions.has('all')) {
      renderTabs();
      renderBody();
      renderDock();
      renderModal();
      renderToasts();
      return;
    }
    if (regions.has('tabs') || regions.has('removed')) renderTabs();

    const onChannels = S.ready && S.loggedIn && S.tab === 'channels';
    if (regions.has('body') || (onChannels && (S.data.subsOrder.length > 0) !== els.hasSubs)) {
      renderBody();
    } else if (onChannels) {
      if (regions.has('scan')) renderScanBox();
      if (regions.has('chips')) renderChips();
      if (regions.has('controls')) {
        renderToolbar();
        renderNotices();
      }
      if (regions.has('list')) scheduleList();
      else if (regions.has('selection')) syncSelection();
    } else if (S.tab === 'removed' && regions.has('removed')) {
      renderBody();
    } else if (S.tab === 'settings') {
      const busy = Boolean(S.scan || (S.unsub && !S.unsub.finished));
      if (regions.has('settings') || busy !== els.settingsBusy) renderBody();
    }

    if (['selection', 'list', 'dock', 'modal', 'tabs', 'body', 'scan'].some((r) => regions.has(r))) renderDock();
    if (regions.has('modal')) renderModal();
    if (regions.has('toasts')) renderToasts();
  }

  // ---------------------------------------------------------------- launcher

  function renderLauncher() {
    if (NS.retired) return;
    const onSubscriptionsPage = /^\/feed\/channels\/?$/.test(location.pathname);
    const show = S.settings.showLauncher && onSubscriptionsPage && !isOpen;
    if (!show) {
      if (launcherHost) launcherHost.style.display = 'none';
      return;
    }
    if (!alive(launcherHost)) {
      launcherHost = document.createElement('div');
      launcherHost.setAttribute('data-subsweep', 'launcher');
      launcherHost.style.cssText = 'all:initial;position:fixed;z-index:2147482000;';
      const shadow = launcherHost.attachShadow({ mode: 'closed' });
      shadow.append(
        h('style', null, NS.styles.launcher),
        h('div', { class: 'launch-wrap' }, h('button', { class: 'launch', onClick: () => open() }, h('span', { class: 'mark' }, mark(18, '#ffffff')), t('launcherLabel'))),
      );
      document.documentElement.append(launcherHost);
    }
    launcherHost.style.display = 'block';
  }

  // ---------------------------------------------------------------- open / close

  async function open() {
    mount();
    clearTimeout(closeTimer);
    if (isOpen) return;
    isOpen = true;
    wrap.setAttribute('lang', fmt.locale());
    wrap.classList.toggle('dark', isDark());
    host.style.display = 'block';
    renderTabs();
    renderBody();
    renderDock();
    renderModal();
    renderToasts();
    renderLauncher();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    els.panel.focus({ preventScroll: true });
    await App.init();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    wrap.classList.remove('open');
    closeTimer = setTimeout(() => {
      if (!isOpen) host.style.display = 'none';
    }, 300);
    renderLauncher();
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function boot() {
    App.on((regions) => {
      if (!NS.retired) update(regions);
    });
    App.loadSettings();
  }

  /** A newer copy of SubSweep took over this page (after an update): step aside. */
  function retire() {
    NS.retired = true;
    App.stopScan();
    App.stopUnsubscribe();
    isOpen = false;
    if (host) host.remove();
    if (launcherHost) launcherHost.remove();
  }

  // isOpen/debugRoot are for tests (the shadow root is closed).
  NS.Panel = { boot, open, close, toggle, retire, onNavigate: renderLauncher, isOpen: () => isOpen, debugRoot: () => root };
})();
