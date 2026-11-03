/*
 * SubSweep — inline SVG icons (24×24, stroke style) and the brand mark.
 * Built with createElementNS so nothing is parsed as HTML.
 */
(() => {
  'use strict';

  const NS = globalThis.SubSweep;
  const SVG = 'http://www.w3.org/2000/svg';

  const path = (d) => ['path', { d }];
  const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
  const rect = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];

  const ICONS = {
    x: [path('M18 6 6 18M6 6l12 12')],
    check: [path('M20 6 9 17l-5-5')],
    search: [circle(11, 11, 7), path('m20 20-3.5-3.5')],
    refresh: [path('M21 12a9 9 0 1 1-2.64-6.36'), path('M21 3v6h-6')],
    chevronDown: [path('m6 9 6 6 6-6')],
    users: [path('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'), circle(9, 7, 4), path('M23 21v-2a4 4 0 0 0-3-3.87'), path('M16 3.13a4 4 0 0 1 0 7.75')],
    userMinus: [path('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), circle(9, 7, 4), path('M22 11h-6')],
    bookmark: [path('M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z')],
    external: [path('M15 3h6v6'), path('M10 14 21 3'), path('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')],
    history: [path('M3 12a9 9 0 1 0 3-6.7L3 8'), path('M3 3v5h5'), path('M12 7v5l3 2')],
    video: [path('m22 8-6 4 6 4V8z'), rect(2, 6, 14, 12, 2)],
    eyeOff: [
      path('M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68'),
      path('M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61'),
      path('M14.12 14.12a3 3 0 1 1-4.24-4.24'),
      path('m2 2 20 20'),
    ],
    moon: [path('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')],
    target: [circle(12, 12, 10), circle(12, 12, 6), circle(12, 12, 2)],
    list: [path('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
    sparkles: [
      path('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z'),
      path('M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'),
    ],
    sliders: [path('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6')],
    download: [path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), path('m7 10 5 5 5-5'), path('M12 15V3')],
    upload: [path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), path('m17 8-5-5-5 5'), path('M12 3v12')],
    alert: [circle(12, 12, 10), path('M12 8v4'), path('M12 16h.01')],
    info: [circle(12, 12, 10), path('M12 16v-4'), path('M12 8h.01')],
    square: [rect(6, 6, 12, 12, 2)],
    play: [path('M7 4.5v15l12.5-7.5z')],
    pause: [rect(6, 5, 4, 14, 1), rect(14, 5, 4, 14, 1)],
    shield: [path('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'), path('m9 12 2 2 4-4')],
    undo: [path('M3 7v6h6'), path('M21 17a9 9 0 0 0-15-6.7L3 13')],
    trash: [path('M3 6h18'), path('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'), path('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6')],
  };

  function element(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  }

  function icon(name, size = 18, className = '') {
    const svg = element('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: `ic ${className}`.trim(),
    });
    for (const [tag, attrs] of ICONS[name] || []) svg.append(element(tag, attrs));
    return svg;
  }

  // Brand mark: a tidy list with a sparkle, on a violet gradient tile.
  const GLYPH_LINES = ['M11 16h22', 'M11 24h14', 'M11 32h8'];
  const GLYPH_SPARKLE = 'M34 21.5c.9 4.6 2.5 6.2 7 7-4.5.8-6.1 2.4-7 7-.9-4.6-2.5-6.2-7-7 4.5-.8 6.1-2.4 7-7z';
  let gradientSeq = 0;

  function glyph(svg, color) {
    for (const d of GLYPH_LINES) {
      svg.append(element('path', { d, stroke: color, 'stroke-width': 4.4, 'stroke-linecap': 'round', fill: 'none' }));
    }
    svg.append(element('path', { d: GLYPH_SPARKLE, fill: color }));
  }

  function logo(size = 32) {
    const id = `ss-grad-${++gradientSeq}`;
    const svg = element('svg', { viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true', class: 'logo' });
    const defs = element('defs', {});
    const gradient = element('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 });
    gradient.append(element('stop', { offset: '0', 'stop-color': '#6d5efc' }), element('stop', { offset: '1', 'stop-color': '#b651f5' }));
    defs.append(gradient);
    svg.append(defs, element('rect', { x: 0, y: 0, width: 48, height: 48, rx: 13, fill: `url(#${id})` }));
    glyph(svg, '#ffffff');
    return svg;
  }

  function mark(size = 20, color = 'currentColor') {
    const svg = element('svg', { viewBox: '6 6 38 36', width: size, height: size, 'aria-hidden': 'true' });
    glyph(svg, color);
    return svg;
  }

  NS.icons = { icon, logo, mark };
})();
