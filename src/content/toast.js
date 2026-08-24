/* Downright — the in-page toast.
 *
 * Every invocation gets an answer at the top of the page: a checkmark that
 * draws itself when the clip landed, a cross and a sentence when it didn't.
 * Silence used to be the failure mode — the badge flashed for 1.8s in the
 * corner of the toolbar and that was the whole report.
 *
 * It lives in a closed shadow root pinned to the top of the viewport, so page
 * CSS cannot restyle it into invisibility and page script cannot read it. The
 * host's own geometry is written with !important for the same reason: a page
 * rule matching the host id must not be able to move or hide it.
 *
 * Loaded with the content scripts, and injectable on its own by the background
 * worker for the cases where the clip pipeline never got far enough to speak
 * for itself. */
(function (root) {
  'use strict';

  const HOST_ID = 'downright-toast-host';
  const OK_MS = 2600;
  const FAIL_MS = 6000;
  const OUT_MS = 200;

  const HOST_CSS = [
    'position:fixed!important', 'top:0!important', 'left:0!important',
    'right:0!important', 'bottom:auto!important', 'width:auto!important',
    'height:auto!important', 'max-width:none!important', 'max-height:none!important',
    'margin:0!important', 'padding:0!important', 'border:0!important',
    'background:none!important', 'display:block!important', 'float:none!important',
    'opacity:1!important', 'visibility:visible!important', 'transform:none!important',
    'filter:none!important', 'clip:auto!important', 'clip-path:none!important',
    'contain:none!important', 'pointer-events:none!important', 'direction:ltr!important',
    'z-index:2147483647!important',
  ].join(';') + ';';

  const THEMES = {
    light: { bg: '#F7F3EA', text: '#17140F', muted: '#6B6355', border: '#D8D0C0', ok: '#2F7A55', no: '#B3392E' },
    dark: { bg: '#201C15', text: '#F4EFE6', muted: '#A29886', border: '#3A342A', ok: '#56B889', no: '#E4776A' },
  };

  /* The glyph is two bars that grow from their joint — a stroke being drawn,
   * without an SVG namespace literal the no-network audit would have to
   * learn to forgive.
   *
   * Every rule below states the *finished* look and uses the animation only
   * to arrive there: no fill-mode holding an opacity:0 first frame, and the
   * stagger lives inside the keyframe percentages rather than in an
   * animation-delay. A frozen timeline — a backgrounded tab, a throttled
   * compositor, reduced motion — then leaves a fully drawn toast standing
   * instead of an invisible one, which for a message whose entire job is to
   * be seen is the only acceptable failure. */
  function sheet(ok, theme, ms) {
    const c = ok ? theme.ok : theme.no;
    return [
      ':host{all:initial}',
      '.row{display:flex;justify-content:center;padding:14px 12px 0}',
      '.card{pointer-events:auto;box-sizing:border-box;position:relative;overflow:hidden;',
      'display:flex;align-items:flex-start;gap:10px;max-width:440px;',
      'padding:11px 15px 12px 12px;border-radius:12px;',
      'font:500 13px/1.45 "Bricolage Grotesque",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'background:' + theme.bg + ';color:' + theme.text + ';border:1px solid ' + theme.border + ';',
      'box-shadow:0 10px 30px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.08);',
      'opacity:1;transform:none;animation:drop .34s cubic-bezier(.16,1,.3,1)}',
      '.card.out{animation:lift ' + OUT_MS + 'ms ease-in forwards}',
      '@keyframes drop{from{opacity:0;transform:translateY(-16px) scale(.96)}}',
      '@keyframes lift{to{opacity:0;transform:translateY(-10px) scale(.98)}}',

      '.icon{flex:none;position:relative;width:22px;height:22px;border-radius:50%;margin-top:1px;',
      'background:' + c + ';opacity:1;transform:none;',
      'animation:pop .34s cubic-bezier(.2,1.35,.4,1)}',
      '@keyframes pop{from{opacity:0;transform:scale(.2)}}',
      '.icon i{position:absolute;display:block;width:2px;background:#fff;border-radius:2px}',

      '.ok i:nth-child(1){left:6px;top:10px;height:5px;transform-origin:50% 100%;',
      'transform:rotate(-45deg);animation:s1 .5s ease-out}',
      '.ok i:nth-child(2){left:6px;top:5px;height:10px;transform-origin:50% 100%;',
      'transform:rotate(45deg);animation:s2 .5s ease-out}',
      '@keyframes s1{0%,30%{transform:rotate(-45deg) scaleY(0)}',
      '62%,100%{transform:rotate(-45deg) scaleY(1)}}',
      '@keyframes s2{0%,55%{transform:rotate(45deg) scaleY(0)}',
      '100%{transform:rotate(45deg) scaleY(1)}}',

      '.no i{left:10px;top:5px;height:12px;transform-origin:50% 50%}',
      '.no i:nth-child(1){transform:rotate(45deg);animation:x1 .5s cubic-bezier(.2,1.2,.4,1)}',
      '.no i:nth-child(2){transform:rotate(-45deg);animation:x2 .5s cubic-bezier(.2,1.2,.4,1)}',
      '@keyframes x1{0%,22%{transform:rotate(45deg) scaleY(0)}',
      '58%,100%{transform:rotate(45deg) scaleY(1)}}',
      '@keyframes x2{0%,50%{transform:rotate(-45deg) scaleY(0)}',
      '86%,100%{transform:rotate(-45deg) scaleY(1)}}',

      '.txt{min-width:0}',
      '.title{font-weight:700;letter-spacing:-.01em}',
      '.detail{margin-top:3px;font-weight:400;font-size:12px;line-height:1.4;color:' + theme.muted + ';',
      'opacity:1;animation:fade .4s}',
      '@keyframes fade{0%,30%{opacity:0}}',

      '.bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:' + c + ';',
      'opacity:.5;transform-origin:0 50%;animation:tick ' + ms + 'ms linear forwards}',
      '@keyframes tick{from{transform:scaleX(1)}to{transform:scaleX(0)}}',

      '@media (prefers-reduced-motion: reduce){',
      '.card,.card.out,.icon,.icon i,.detail,.bar{animation:none!important}}',
    ].join('');
  }

  let timers = [];

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  function dismiss(doc) {
    clearTimers();
    const prev = (doc || document).getElementById(HOST_ID);
    if (prev) prev.remove();
  }

  /* Returns true when the toast is actually on the page. The background
   * worker reads that answer: a false means the page could not be drawn on
   * at all, and the reason has to be delivered somewhere else. */
  function toast(options) {
    const o = options || {};
    const doc = o.document || document;
    try {
      if (!doc || !doc.documentElement) return false;
      dismiss(doc);

      const ok = !!o.ok;
      const ms = Math.max(1500, o.duration || (ok ? OK_MS : FAIL_MS));
      const dark = !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);

      const host = doc.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = HOST_CSS;
      const shadow = host.attachShadow({ mode: 'closed' });

      const style = doc.createElement('style');
      style.textContent = sheet(ok, dark ? THEMES.dark : THEMES.light, ms);

      const row = doc.createElement('div');
      row.className = 'row';
      const card = doc.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'status');

      const icon = doc.createElement('span');
      icon.className = 'icon ' + (ok ? 'ok' : 'no');
      icon.append(doc.createElement('i'), doc.createElement('i'));

      const txt = doc.createElement('div');
      txt.className = 'txt';
      const title = doc.createElement('div');
      title.className = 'title';
      title.textContent = o.title || (ok ? 'Done' : 'Downright couldn’t clip this page');
      txt.appendChild(title);
      if (o.detail) {
        const detail = doc.createElement('div');
        detail.className = 'detail';
        detail.textContent = o.detail;
        txt.appendChild(detail);
      }

      const bar = doc.createElement('span');
      bar.className = 'bar';

      card.append(icon, txt, bar);
      row.appendChild(card);
      shadow.append(style, row);

      // Anything the reader dismisses should go immediately.
      card.addEventListener('click', () => dismiss(doc));

      doc.documentElement.appendChild(host);

      timers.push(setTimeout(() => { card.classList.add('out'); }, ms));
      timers.push(setTimeout(() => dismiss(doc), ms + OUT_MS));
      return true;
    } catch (e) {
      return false;
    }
  }

  root.__downright = Object.assign(root.__downright || {}, { toast, dismissToast: dismiss });
})(globalThis);
