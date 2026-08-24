/* Downright — settings page.
 *
 * Reads and writes storage.sync directly; there is no background message
 * for settings and no state kept anywhere else. Every control saves on
 * change and then shows what that change does to the Markdown, using the
 * same helpers the clipper itself uses — the filename preview calls
 * buildFilename, and the toast preview mounts the real toast component,
 * so a preview here cannot drift from what a clip actually produces. */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const DR = globalThis.__downright || {};
const DEFAULTS = globalThis.DOWNRIGHT_DEFAULTS || {};

const SWITCHES = [
  'toast', 'images', 'frontmatter', 'fmTitle', 'fmSource', 'fmAuthor',
  'fmPublished', 'fmDescription', 'fmClipped', 'titleHeading',
];
const RADIOS = ['mode', 'bullet'];
const FM_IDS = ['fmTitle', 'fmSource', 'fmAuthor', 'fmPublished', 'fmDescription', 'fmClipped'];

const el = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/* The page the examples are pretending to clip. example.org is reserved by
 * RFC 2606 precisely so sample text can name a site without naming anyone. */
const SAMPLE = {
  title: 'Leafcutter ants farm fungus',
  url: 'https://example.org/leafcutter-ants',
  author: 'R. Sánchez',
  published: '2024-11-02',
  description: 'Leaf clippings, turned into a crop',
  imageAlt: 'Fungus garden',
  imageUrl: 'https://example.org/garden.jpg',
  lead: 'A mature colony can strip a tree overnight.',
};

let state = Object.assign({}, DEFAULTS); // mirrors the form, saved or not
let savedTimer = null;

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ------------------------------------------------------------------ *
 * Form <-> settings
 * ------------------------------------------------------------------ */

function radioValue(name) {
  const hit = document.querySelector('input[name="' + name + '"]:checked');
  return hit ? hit.value : null;
}

function setRadio(name, value) {
  for (const input of document.querySelectorAll('input[name="' + name + '"]')) {
    input.checked = input.value === value;
  }
}

function applyToForm(values) {
  setRadio('mode', values.mode === 'full' ? 'full' : 'article');
  setRadio('bullet', ['-', '*', '+'].indexOf(values.bullet) >= 0 ? values.bullet : '-');
  el('images').checked = values.images !== 'skip';
  el('filenameTemplate').value = values.filenameTemplate || '{title}';
  for (const id of SWITCHES) {
    if (id !== 'images') el(id).checked = !!values[id];
  }
}

function collect() {
  const out = {
    mode: radioValue('mode') === 'full' ? 'full' : 'article',
    bullet: radioValue('bullet') || '-',
    images: el('images').checked ? 'keep' : 'skip',
    filenameTemplate: el('filenameTemplate').value.trim() || '{title}',
  };
  for (const id of SWITCHES) {
    if (id !== 'images') out[id] = el(id).checked;
  }
  return out;
}

function showSaved() {
  const pill = el('saved');
  pill.hidden = false;
  // Re-run the entrance so rapid changes read as separate saves.
  pill.style.animation = 'none';
  void pill.offsetWidth;
  pill.style.animation = '';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { pill.hidden = true; }, 1600);
}

async function persist(values) {
  try {
    await api.storage.sync.set(values);
    showSaved();
  } catch (e) { /* storage unavailable — the form still reflects the intent */ }
}

/* ------------------------------------------------------------------ *
 * Derived bits of the UI
 * ------------------------------------------------------------------ */

function syncDerived() {
  const on = !!state.frontmatter;

  // Fields belong to the block; with the block off they are inert, not just dim.
  el('fm-fields').classList.toggle('off', !on);
  for (const id of FM_IDS) el(id).disabled = !on;

  const count = FM_IDS.filter((id) => state[id]).length;
  el('fm-count').textContent = on
    ? count + ' of ' + FM_IDS.length + ' included'
    : 'block is off';

  // Say which of the two title behaviours is actually in force right now.
  el('th-tag').hidden = on || !state.titleHeading;

  el('fm-clipped-eg').textContent = 'clipped: ' + today();
  el('filename-preview').textContent = previewFilename();
}

function previewFilename() {
  const template = el('filenameTemplate').value.trim() || '{title}';
  if (typeof DR.buildFilename === 'function') {
    return DR.buildFilename(template, { title: SAMPLE.title, url: SAMPLE.url });
  }
  return template + '.md';
}

/* ------------------------------------------------------------------ *
 * Examples
 *
 * Each entry answers one question: what does this switch do to the text
 * that lands on the clipboard? They render as a diff — struck-through red
 * for what goes away, green for what appears — against a made-up page
 * about ants, because the ant is right there in the icon.
 * ------------------------------------------------------------------ */

const FM_LINES = [
  ['fmTitle', () => 'title: "' + SAMPLE.title + '"'],
  ['fmSource', () => 'source: "' + SAMPLE.url + '"'],
  ['fmAuthor', () => 'author: "' + SAMPLE.author + '"'],
  ['fmPublished', () => 'published: ' + SAMPLE.published],
  ['fmDescription', () => 'description: "' + SAMPLE.description + '"'],
  ['fmClipped', () => 'clipped: ' + today()],
];

/* The whole block, every line marked the same way. */
function fmBlock(mark) {
  const lines = [['---', mark]];
  for (const [id, render] of FM_LINES) {
    if (state[id]) lines.push([render(), mark]);
  }
  lines.push(['---', mark], ['', mark]);
  return lines;
}

/* The block with one field called out as arriving or leaving. */
function fmBlockHighlighting(fieldId) {
  const lines = [['---', 'ctx']];
  for (const [id, render] of FM_LINES) {
    if (id === fieldId) lines.push([render(), state[id] ? 'add' : 'del']);
    else if (state[id]) lines.push([render(), 'ctx']);
  }
  lines.push(['---', 'ctx']);
  return lines;
}

const EXAMPLES = {
  mode() {
    const full = state.mode === 'full';
    const k = full ? 'add' : 'del';
    return {
      state: full ? 'Full page' : 'Article',
      off: !full,
      lines: [
        ['[Skip to main content](#main)', k],
        ['- [Home](/) · [Species](/species)', k],
        ['', k],
        ['# ' + SAMPLE.title, 'ctx'],
        ['', 'ctx'],
        [SAMPLE.lead, 'ctx'],
        ['', k],
        ['© 2024 · Cookie choices · Newsletter', k],
      ],
      note: full
        ? 'Full page keeps the furniture: menus, banners, footers, sidebars.'
        : 'Article keeps the body and drops the furniture around it.',
    };
  },

  toast() {
    const on = !!state.toast;
    return {
      kind: 'toast',
      state: on ? 'On' : 'Off',
      off: !on,
      note: on
        ? 'Shows in the top-right of the page for a few seconds, then leaves.'
        : 'The clip still happens — the toolbar badge is the only sign of it.',
    };
  },

  images() {
    const keep = state.images !== 'skip';
    const img = '![' + SAMPLE.imageAlt + '](' + SAMPLE.imageUrl + ')';
    return {
      state: keep ? 'On' : 'Off',
      off: !keep,
      lines: [
        ['Workers ferry clippings underground.', 'ctx'],
        ['', 'ctx'],
        [keep ? SAMPLE.imageAlt : img, 'del'],
        [keep ? img : SAMPLE.imageAlt, 'add'],
      ],
      note: keep
        ? 'URLs are made absolute, so the image still resolves outside the page.'
        : 'Alt text only — a smaller clip, and nothing that can 404 later.',
    };
  },

  bullet(from) {
    const now = state.bullet || '-';
    const was = from && from !== now ? from : (now === '-' ? '*' : '-');
    return {
      state: now,
      off: false,
      lines: [
        [was + ' Fungus gardens', 'del'],
        [was + ' Foraging trails', 'del'],
        [now + ' Fungus gardens', 'add'],
        [now + ' Foraging trails', 'add'],
      ],
      note: 'Numbered lists are unaffected — they always use 1. 2. 3.',
    };
  },

  frontmatter() {
    const on = !!state.frontmatter;
    const lines = fmBlock(on ? 'add' : 'del');
    lines.push(['# ' + SAMPLE.title, 'ctx'], ['', 'ctx'], [SAMPLE.lead, 'ctx']);
    return {
      state: on ? 'On' : 'Off',
      off: !on,
      lines,
      note: on
        ? 'Selections never get front matter — only whole-page clips do.'
        : 'With the block off, the title falls back to a # heading if that is on.',
    };
  },

  titleHeading() {
    const on = !!state.titleHeading;
    return {
      state: on ? 'On' : 'Off',
      off: !on,
      lines: [
        ['# ' + SAMPLE.title, on ? 'add' : 'del'],
        ['', 'ctx'],
        [SAMPLE.lead, 'ctx'],
      ],
      note: state.frontmatter
        ? 'Front matter is on, so this is the fallback if you ever turn it off.'
        : 'Skipped when the page already opens with that same heading.',
    };
  },
};

// Each front-matter field shows itself landing in, or leaving, the block.
for (const [id] of FM_LINES) {
  EXAMPLES[id] = () => ({
    state: state[id] ? 'Included' : 'Omitted',
    off: !state[id],
    lines: fmBlockHighlighting(id),
    note: state.frontmatter
      ? 'Fields the page does not publish are simply left out.'
      : 'The block itself is off right now, so no clip carries these yet.',
  });
}

/* ------------------------------------------------------------------ *
 * The example popover
 * ------------------------------------------------------------------ */

let peekAnchor = null;
let peekTimer = null;
let peekButton = null;

function anchorFor(id) {
  return document.querySelector('.row[data-row="' + id + '"]')
    || (el(id) ? el(id).closest('.field') : null);
}

function labelFor(id) {
  const row = document.querySelector('.row[data-row="' + id + '"] .row-label');
  if (row) return (row.firstChild ? row.firstChild.textContent : row.textContent).trim();
  const field = el(id) && el(id).closest('.field');
  const name = field && field.querySelector('.field-text b');
  return name ? name.textContent.trim() : id;
}

function diffLine(text, kind) {
  const line = document.createElement('div');
  line.className = 'dl ' + kind;
  const gutter = document.createElement('span');
  gutter.className = 'g';
  gutter.textContent = kind === 'add' ? '+' : (kind === 'del' ? '−' : ' ');
  const body = document.createElement('span');
  body.className = 't';
  body.textContent = text || ' ';
  line.append(gutter, body);
  return line;
}

function buildPeekBody(def) {
  const body = el('peek-body');
  body.textContent = '';

  if (def.kind === 'toast') {
    const stage = document.createElement('div');
    stage.className = def.off ? 'peek-stage empty' : 'peek-stage';
    if (def.off) {
      stage.textContent = 'Nothing appears on the page.';
    } else if (typeof DR.showToast === 'function') {
      DR.showToast({
        title: 'Copied as Markdown',
        detail: '≈1.2k tokens · 4,930 chars',
        ok: true,
        sticky: true,
        mount: stage,
      }, document);
    }
    body.appendChild(stage);
  } else {
    const diff = document.createElement('div');
    diff.className = 'diff';
    for (const [text, kind] of def.lines) diff.appendChild(diffLine(text, kind));
    body.appendChild(diff);
  }

  if (def.note) {
    const note = document.createElement('p');
    note.className = 'peek-note';
    note.textContent = def.note;
    body.appendChild(note);
  }
}

/* Prefer the empty gutter beside the cards; fall back to below the row,
 * then above it. Whichever it picks, the caret points back at the control
 * that changed. */
function placePeek() {
  const peek = el('peek');
  const row = peekAnchor;
  if (!row || peek.hidden) return;

  const card = row.closest('.card') || row;
  const r = row.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const arrow = peek.querySelector('.peek-arrow');
  const pad = 12;

  peek.className = 'peek';
  const w = peek.offsetWidth;
  const h = peek.offsetHeight;
  arrow.style.top = '';
  arrow.style.left = '';

  if (window.innerWidth - c.right > w + 26) {
    peek.classList.add('beside');
    const top = clamp(r.top + r.height / 2 - h / 2, pad, window.innerHeight - h - pad);
    peek.style.left = (c.right + 14) + 'px';
    peek.style.top = top + 'px';
    arrow.style.top = clamp(r.top + r.height / 2 - top - 4.5, 13, h - 22) + 'px';
    return;
  }

  const left = clamp(r.left, pad, Math.max(pad, window.innerWidth - w - pad));
  peek.style.left = left + 'px';
  if (window.innerHeight - r.bottom > h + 24) {
    peek.classList.add('below');
    peek.style.top = (r.bottom + 11) + 'px';
  } else {
    peek.classList.add('above');
    peek.style.top = Math.max(pad, r.top - h - 11) + 'px';
  }
  arrow.style.left = clamp(r.left + 46 - left, 14, Math.max(14, w - 24)) + 'px';
}

function hidePeek() {
  clearTimeout(peekTimer);
  const peek = el('peek');
  if (peek.hidden) return;
  peek.hidden = true;
  el('peek-body').textContent = ''; // stops the live toast animation
  peekAnchor = null;
  if (peekButton) peekButton.setAttribute('aria-expanded', 'false');
  peekButton = null;
}

function openPeek(id, from) {
  const make = EXAMPLES[id];
  const anchor = anchorFor(id);
  if (!make || !anchor) return;

  const def = make(from);
  const peek = el('peek');

  if (peekButton) peekButton.setAttribute('aria-expanded', 'false');
  peekButton = document.querySelector('.peek-btn[data-peek="' + id + '"]');
  if (peekButton) peekButton.setAttribute('aria-expanded', 'true');

  el('peek-title').textContent = labelFor(id);
  const badge = el('peek-state');
  badge.textContent = def.state;
  badge.className = 'peek-state ' + (def.off ? 'off' : 'on');
  buildPeekBody(def);

  peekAnchor = anchor;
  peek.hidden = false;
  peek.style.animation = 'none';
  void peek.offsetWidth;
  peek.style.animation = '';
  placePeek();

  clearTimeout(peekTimer);
  peekTimer = setTimeout(hidePeek, 6000);
}

function armPeekDismissal() {
  const peek = el('peek');

  peek.addEventListener('mouseenter', () => clearTimeout(peekTimer));
  peek.addEventListener('mouseleave', () => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(hidePeek, 1400);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePeek();
  });
  document.addEventListener('pointerdown', (e) => {
    if (peek.hidden) return;
    if (peek.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.row, .field')) return;
    hidePeek();
  });

  let queued = false;
  const reflow = () => {
    if (queued || el('peek').hidden) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; placePeek(); });
  };
  window.addEventListener('scroll', reflow, { passive: true, capture: true });
  window.addEventListener('resize', reflow);
}

/* ------------------------------------------------------------------ *
 * Keyboard shortcut display
 * ------------------------------------------------------------------ */

const MAC_KEYS = { Alt: '⌥', Ctrl: '⌃', Control: '⌃', Command: '⌘', MacCtrl: '⌃', Shift: '⇧' };
const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.userAgent);
const IS_FIREFOX = /Firefox/i.test(navigator.userAgent);
const SHORTCUT_URL = IS_FIREFOX ? 'about:addons' : 'chrome://extensions/shortcuts';

function renderKeys(combo) {
  const box = el('shortcut-keys');
  box.className = 'keys';
  box.textContent = '';
  const parts = (combo || 'Alt+M').split('+');
  for (const part of parts) {
    const key = document.createElement('kbd');
    key.textContent = IS_MAC && MAC_KEYS[part] ? MAC_KEYS[part] : part;
    box.appendChild(key);
  }
}

async function loadShortcut() {
  try {
    const commands = await api.commands.getAll();
    const copy = (commands || []).filter((c) => c.name === 'clip-copy')[0];
    if (copy && copy.shortcut) { renderKeys(copy.shortcut); return; }
    if (copy) {
      el('shortcut-keys').textContent = 'not set';
      el('shortcut-keys').className = 'keys unset';
      return;
    }
  } catch (e) { /* fall through to the documented default */ }
  renderKeys('Alt+M');
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function onChange(id, from) {
  state = collect();
  syncDerived();
  persist(state);
  openPeek(id, from);
}

function insertPlaceholder(token) {
  const input = el('filenameTemplate');
  const start = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? start : input.selectionEnd;
  input.value = input.value.slice(0, start) + token + input.value.slice(end);
  const caret = start + token.length;
  input.focus();
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input'));
}

/* Which section the rail highlights. Intersection ratios are the wrong
 * tool here — a tall card and a short one crossing the same band report
 * wildly different ratios — so this just asks which section heading was
 * the last one to pass under the sticky bar. */
function watchSections() {
  const links = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  if (!links.length || sections.indexOf(null) >= 0) return;

  const mark = () => {
    const line = 130;
    let active = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) active = i;
    }
    // The last card is often too short to ever reach the line, so the end of
    // the document counts as reaching it — but only on a page that scrolls at
    // all, or a tall window would land on the last section straight away.
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight > 4;
    if (scrollable && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
      active = sections.length - 1;
    }
    for (let i = 0; i < links.length; i++) links[i].classList.toggle('on', i === active);
  };

  // Six rects per scroll event, and the browser coalesces those to one per
  // frame anyway — cheap enough not to need a rAF hop, which would leave the
  // rail stale whenever the tab is in the background and frames stop.
  window.addEventListener('scroll', mark, { passive: true });
  window.addEventListener('resize', mark);
  mark();
}

async function main() {
  let values;
  try {
    values = await api.storage.sync.get(DEFAULTS);
  } catch (e) {
    values = Object.assign({}, DEFAULTS);
  }
  state = Object.assign({}, DEFAULTS, values);
  applyToForm(state);
  syncDerived();

  for (const id of SWITCHES) {
    el(id).addEventListener('change', () => onChange(id, state[id]));
  }
  for (const name of RADIOS) {
    for (const input of document.querySelectorAll('input[name="' + name + '"]')) {
      input.addEventListener('change', () => onChange(name, state[name]));
    }
  }

  let typingTimer = null;
  el('filenameTemplate').addEventListener('input', () => {
    el('filename-preview').textContent = previewFilename();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      state = collect();
      persist(state);
    }, 400);
  });

  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => insertPlaceholder(chip.dataset.insert));
  }

  for (const button of document.querySelectorAll('.peek-btn')) {
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const id = button.dataset.peek;
      if (!el('peek').hidden && peekButton === button) hidePeek();
      else openPeek(id);
    });
  }
  armPeekDismissal();

  el('open-shortcuts').addEventListener('click', async () => {
    try {
      await api.tabs.create({ url: SHORTCUT_URL });
    } catch (e) {
      const help = el('shortcut-help');
      help.classList.remove('flash');
      void help.offsetWidth;
      help.classList.add('flash');
    }
  });

  /* Restoring defaults throws away real configuration, so it asks once. */
  let armed = false;
  let armTimer = null;
  const reset = el('reset');
  const disarm = () => {
    armed = false;
    reset.classList.remove('armed');
    reset.textContent = 'Restore defaults';
  };
  reset.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      reset.classList.add('armed');
      reset.textContent = 'Click again to restore';
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    clearTimeout(armTimer);
    disarm();
    hidePeek();
    state = Object.assign({}, DEFAULTS);
    applyToForm(state);
    syncDerived();
    await persist(state);
  });

  try {
    const manifest = api.runtime.getManifest();
    if (manifest && manifest.version) el('version').textContent = 'v' + manifest.version;
  } catch (e) { /* running outside the extension, e.g. a design preview */ }

  loadShortcut();
  watchSections();
}

main();
