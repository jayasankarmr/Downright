/* Downright — the in-page confirmation toast.
 *
 * One implementation, two callers: the injected clip orchestrator raises it
 * on the page after a keyboard or context-menu clip, and the settings page
 * mounts the very same component as a live preview — so what the preview
 * shows can never drift from what the page shows.
 *
 * Everything is built as DOM nodes inside a closed shadow root. No innerHTML
 * (Trusted Types pages would reject it), no page CSS leaking in, no
 * extension CSS leaking out, and nothing loaded from anywhere. */
(function (root) {
  'use strict';

  /* A parser identifier, not an address — nothing is ever loaded from it.
   * scripts/check-no-network.sh allows this exact line and no other. */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const HOST_ID = 'downright-toast-host';

  /* Brand ink. The medallion is warm paper in both themes, the way the
   * mark is drawn everywhere else Downright appears. */
  const INK = '#17140F';
  const PAPER = '#F4EFE6';
  const BLUE = '#2D5DAE';

  function svgEl(doc, name, attrs) {
    const node = doc.createElementNS(SVG_NS, name);
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, String(attrs[key]));
    }
    return node;
  }

  /* ------------------------------------------------------------------ *
   * The mark, redrawn as a scene
   *
   * Same leafcutter as the icon, but split into animatable parts: she
   * hauls the sheet in from the left, the mandibles snip twice, and the
   * three lines of the clip wipe on in order — the middle one blue, the
   * way a link lands in Markdown.
   * ------------------------------------------------------------------ */

  function buildMark(doc) {
    // The viewBox is padded past the artwork so the hind legs and the top
    // corner of the sheet do not graze the edge of the medallion, and so
    // she has somewhere off-frame to walk in from.
    const svg = svgEl(doc, 'svg', {
      viewBox: '-6 -4 112 112', width: '46', height: '46',
      'aria-hidden': 'true', focusable: 'false',
    });
    const scene = svgEl(doc, 'g', { class: 'scene' });

    // The carried sheet, tilted the way the logo tilts it.
    const sheet = svgEl(doc, 'g', { class: 'sheet' });
    const tilt = svgEl(doc, 'g', { transform: 'rotate(-13 55 27)' });
    tilt.append(
      svgEl(doc, 'rect', { x: 24, y: 4, width: 62, height: 44, fill: PAPER, stroke: INK, 'stroke-width': 4 }),
      svgEl(doc, 'rect', { class: 'ln a', x: 32, y: 13, width: 26, height: 3.8, fill: INK }),
      svgEl(doc, 'rect', { class: 'ln b', x: 32, y: 23, width: 46, height: 3.8, fill: BLUE }),
      svgEl(doc, 'rect', { class: 'ln c', x: 32, y: 33, width: 34, height: 3.8, fill: INK })
    );
    sheet.appendChild(tilt);

    const ant = svgEl(doc, 'g', { class: 'ant' });

    // Antennae and legs go down first so the body covers where they join.
    const feelers = [['M60 58 L54 45', 'f1'], ['M72 57 L79 45', 'f2']];
    for (const [d, cls] of feelers) {
      ant.appendChild(svgEl(doc, 'path', {
        class: 'feel ' + cls, d, stroke: INK, 'stroke-width': 3.6,
        'stroke-linecap': 'round', fill: 'none',
      }));
    }
    const legs = [['M36 84 L26 95', 'g1'], ['M48 82 L46 97', 'g2'], ['M58 80 L68 94', 'g3']];
    for (const [d, cls] of legs) {
      ant.appendChild(svgEl(doc, 'path', {
        class: 'leg ' + cls, d, stroke: INK, 'stroke-width': 4.4,
        'stroke-linecap': 'round', fill: 'none',
      }));
    }

    ant.append(
      svgEl(doc, 'ellipse', { cx: 24, cy: 76, rx: 16, ry: 12.5, transform: 'rotate(-8 24 76)', fill: INK }),
      svgEl(doc, 'ellipse', { cx: 38, cy: 75, rx: 5.5, ry: 4.5, fill: INK }),
      svgEl(doc, 'ellipse', { cx: 50, cy: 72, rx: 11, ry: 9.5, fill: INK }),
      svgEl(doc, 'path', { class: 'jaw', d: 'M77 62 L88 66 L77 71 Z', fill: INK }),
      svgEl(doc, 'circle', { cx: 68, cy: 67, r: 10.5, fill: INK }),
      svgEl(doc, 'circle', { cx: 71, cy: 63.5, r: 3, fill: PAPER })
    );

    scene.append(sheet, ant);
    svg.appendChild(scene);
    return svg;
  }

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */

  function styleText(dark, ok) {
    const card = dark ? '#211D16' : '#FBF8F2';
    const text = dark ? '#F4EFE6' : '#17140F';
    const muted = dark ? '#9C9384' : '#6B6355';
    const edge = dark ? '#3A342A' : '#DDD4C3';
    const rail = dark ? 'rgba(244,239,230,.10)' : 'rgba(23,20,15,.08)';
    const accent = ok
      ? (dark ? '#6E92D8' : '#2D5DAE')
      : (dark ? '#E08D77' : '#A8412B');
    const shadow = dark
      ? '0 18px 40px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)'
      : '0 18px 40px rgba(23,20,15,.16), 0 2px 6px rgba(23,20,15,.08)';

    return [
      ':host{all:initial}',
      '*{box-sizing:border-box}',

      '.card{position:relative;display:flex;align-items:center;gap:12px;',
      'width:294px;max-width:calc(100vw - 32px);padding:12px 16px 13px 12px;',
      'border-radius:14px;overflow:hidden;',
      'font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
      '-webkit-font-smoothing:antialiased;text-align:left;direction:ltr;',
      'background:', card, ';color:', text, ';border:1px solid ', edge, ';box-shadow:', shadow, ';',
      'animation:dr-in .34s cubic-bezier(.2,.9,.3,1.1) both}',

      '.card.leaving{animation:dr-out .2s ease-in forwards}',

      '.tile{flex:none;width:52px;height:52px;border-radius:12px;display:flex;',
      'align-items:center;justify-content:center;background:#EDE7DA;',
      'border:1px solid rgba(23,20,15,.14);overflow:hidden}',

      '.body{min-width:0;flex:1}',
      '.brand{font-size:9.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;',
      'color:', muted, ';margin-bottom:2px}',
      '.title{font-size:13.5px;font-weight:600;letter-spacing:-.005em;line-height:1.3;',
      'color:', text, ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      /* A success is a headline and a count, and both fit one line. A failure
       * is a sentence with something to do in it, so the error variant drops
       * the truncation and lets the card grow downward instead — same width,
       * same corner, same medallion. */
      '.card.err .title{color:', accent, ';white-space:normal}',
      '.card.err .meta{white-space:normal;',
      'font:400 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
      '.card.err{align-items:flex-start}',
      '.meta{margin-top:3px;font:400 11.5px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'color:', muted, ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      '.bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:', rail, '}',
      '.bar i{display:block;height:100%;background:', accent, ';',
      'transform-origin:left center;animation:dr-bar linear both}',

      // The scene
      '.scene{animation:dr-haul .6s cubic-bezier(.24,.9,.3,1) both}',
      '.ant{animation:dr-bob .52s ease-in-out infinite}',
      '.leg{transform-box:view-box;animation:dr-step .52s ease-in-out infinite}',
      '.g1{transform-origin:36px 84px}',
      '.g2{transform-origin:48px 82px;animation-delay:-.17s}',
      '.g3{transform-origin:58px 80px;animation-delay:-.34s}',
      '.feel{transform-box:view-box;animation:dr-feel 1.7s ease-in-out infinite}',
      '.f1{transform-origin:60px 58px}',
      '.f2{transform-origin:72px 57px;animation-delay:-.5s}',
      '.jaw{transform-box:view-box;transform-origin:77px 66.5px;',
      'animation:dr-snip 2.1s ease-in-out infinite}',
      '.sheet{transform-box:view-box;transform-origin:55px 40px;',
      'animation:dr-sway 2.4s ease-in-out infinite}',
      '.ln{transform-box:fill-box;transform-origin:left center;animation:dr-wipe .32s ease-out both}',
      '.ln.a{animation-delay:.34s}.ln.b{animation-delay:.46s}.ln.c{animation-delay:.58s}',

      // A failed clip gets a still mark: nothing was cut, nothing was carried.
      '.card.err .scene,.card.err .ant,.card.err .leg,.card.err .feel,',
      '.card.err .jaw,.card.err .sheet,.card.err .ln{animation:none}',

      '@keyframes dr-in{from{opacity:0;transform:translate3d(0,-12px,0) scale(.96)}',
      'to{opacity:1;transform:none}}',
      '@keyframes dr-out{to{opacity:0;transform:translate3d(0,-8px,0) scale(.98)}}',
      '@keyframes dr-haul{0%{transform:translateX(-14px)}58%{transform:translateX(1.5px)}',
      '100%{transform:none}}',
      '@keyframes dr-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}',
      '@keyframes dr-step{0%,100%{transform:rotate(0)}50%{transform:rotate(17deg)}}',
      '@keyframes dr-feel{0%,100%{transform:rotate(0)}38%{transform:rotate(-8deg)}',
      '68%{transform:rotate(5deg)}}',
      '@keyframes dr-snip{0%,64%,100%{transform:rotate(0)}72%{transform:rotate(-14deg)}',
      '80%{transform:rotate(3deg)}88%{transform:rotate(-9deg)}}',
      '@keyframes dr-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.7deg)}}',
      '@keyframes dr-wipe{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
      '@keyframes dr-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}',

      '@media (prefers-reduced-motion: reduce){',
      '.card,.card.leaving,.scene,.ant,.leg,.feel,.jaw,.sheet,.ln,.bar i{animation:none}',
      '.bar i{transform:scaleX(1)}}',
    ].join('');
  }

  /* ------------------------------------------------------------------ *
   * show()
   *
   *   title    headline, e.g. "Copied as Markdown"
   *   detail   the mono line under it, e.g. "≈1.2k tokens · 4,231 chars"
   *   ok       false paints the failure variant and stills the mark
   *   duration ms on screen; 0 or `sticky` keeps it up
   *   mount    render in-flow inside this element instead of over the page
   *
   * Returns { host, close } — or null if the DOM would not have it.
   * ------------------------------------------------------------------ */

  function show(options, docArg) {
    const o = options || {};
    const doc = docArg || o.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    try {
      const inline = !!o.mount;
      const mount = o.mount || doc.documentElement;
      const ok = o.ok !== false;
      const duration = typeof o.duration === 'number' ? o.duration : 3400;
      const timed = !o.sticky && duration > 0;

      // Only one page-level toast at a time; a second clip replaces the first.
      if (!inline) {
        const prev = doc.getElementById(HOST_ID);
        if (prev) prev.remove();
      }

      const host = doc.createElement('div');
      if (!inline) host.id = HOST_ID;
      host.style.cssText = inline
        ? 'all:initial;display:block;'
        : 'all:initial;display:block;position:fixed;top:16px;right:16px;z-index:2147483647;';

      const shadow = host.attachShadow({ mode: 'closed' });
      const dark = !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);

      const style = doc.createElement('style');
      style.textContent = styleText(dark, ok);

      const card = doc.createElement('div');
      card.className = ok ? 'card' : 'card err';
      card.setAttribute('role', 'status');

      const tile = doc.createElement('div');
      tile.className = 'tile';
      tile.appendChild(buildMark(doc));

      const body = doc.createElement('div');
      body.className = 'body';
      const brand = doc.createElement('div');
      brand.className = 'brand';
      brand.textContent = 'Downright';
      const title = doc.createElement('div');
      title.className = 'title';
      title.textContent = o.title || '';
      body.append(brand, title);
      if (o.detail) {
        const meta = doc.createElement('div');
        meta.className = 'meta';
        meta.textContent = o.detail;
        body.appendChild(meta);
      }

      card.append(tile, body);

      if (timed) {
        const bar = doc.createElement('div');
        bar.className = 'bar';
        const fill = doc.createElement('i');
        fill.style.animationDuration = duration + 'ms';
        bar.appendChild(fill);
        card.appendChild(bar);
      }

      shadow.append(style, card);
      mount.appendChild(host);

      let gone = false;
      const close = () => {
        if (gone) return;
        gone = true;
        host.remove();
      };
      if (timed) {
        setTimeout(() => {
          card.classList.add('leaving');
          setTimeout(close, 260);
        }, duration);
      }
      return { host, close };
    } catch (e) {
      return null; // The toast is confirmation, never a dependency.
    }
  }

  root.__downright = Object.assign(root.__downright || {}, { showToast: show });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast: show };
  }
})(globalThis);
