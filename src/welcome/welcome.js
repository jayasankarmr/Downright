/* Downright — the welcome page.
 *
 * The page is readable with the script disabled; everything here replaces a
 * hard-coded fallback with the truth about this particular install:
 *
 *   · the hero states both documented defaults, and the keycaps are swapped
 *     for a custom binding if one is found. See loadShortcut() for why it
 *     is written the way round it is;
 *   · the toast is the real component out of common/toast.js, mounted the
 *     same way the settings page mounts it, so this preview cannot drift
 *     from what a clip puts on the page;
 *   · the two buttons go where a plain link cannot — the options page and
 *     the browser's own shortcuts screen.
 *
 * Nothing here is load-bearing. Every failure falls back to the markup. */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const DR = globalThis.__downright || {};

const el = (id) => document.getElementById(id);

/* Same table and the same detection as the settings page. */
const MAC_KEYS = { Alt: '⌥', Ctrl: '⌃', Control: '⌃', Command: '⌘', MacCtrl: '⌃', Shift: '⇧' };
const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.userAgent);
const IS_FIREFOX = /Firefox/i.test(navigator.userAgent);
const SHORTCUT_URL = IS_FIREFOX ? 'about:addons' : 'chrome://extensions/shortcuts';

/* ------------------------------------------------------------------ *
 * Keycaps
 *
 * The hero lists both documented defaults in the markup — ⌥M and Alt+M —
 * because a reader who has just installed this needs to know which key to
 * press, and the page cannot ask them which machine they are on. The one
 * in the "three ways" card is the platform's own, since a sentence reads
 * badly with two shortcuts wedged into it.
 * ------------------------------------------------------------------ */

const DEFAULT_COMBO = 'Alt+M';

function keycaps(combo) {
  const box = document.createElement('span');
  box.className = 'keys';
  for (const part of (combo || DEFAULT_COMBO).split('+')) {
    const key = document.createElement('kbd');
    key.textContent = IS_MAC && MAC_KEYS[part] ? MAC_KEYS[part] : part;
    box.appendChild(key);
  }
  return box;
}

function renderKeys(box, combo) {
  if (!box) return;
  box.className = box.classList.contains('sm') ? 'keys sm' : 'keys';
  box.textContent = '';
  for (const part of (combo || DEFAULT_COMBO).split('+')) {
    const key = document.createElement('kbd');
    key.textContent = IS_MAC && MAC_KEYS[part] ? MAC_KEYS[part] : part;
    box.appendChild(key);
  }
}

/* Something other than the default is bound, so listing the defaults would
 * be a lie. Collapse the pair down to the one key that actually works. */
function renderCustom(combo) {
  const row = el('shortcut-keys');
  if (row) {
    row.textContent = '';
    const group = document.createElement('span');
    group.className = 'kgroup';
    const plat = document.createElement('span');
    plat.className = 'kplat';
    plat.textContent = 'your shortcut';
    group.append(keycaps(combo), plat);
    row.appendChild(group);
  }
  renderKeys(el('shortcut-keys-2'), combo);
}

/* Note the shape: this only ever *overrides* the markup.
 *
 * Chrome reports clip-copy with an empty `shortcut` for a moment after
 * onInstalled fires — which is precisely when this tab is opened — and an
 * earlier version believed it and announced "No shortcut assigned" to every
 * new user, correcting itself only once something else triggered a reread.
 * An empty binding here is far more likely to be that race than a browser
 * that genuinely refused the key, and the documented defaults are the safer
 * thing to leave on screen either way. The "Change shortcut" button covers
 * the rare install where the key really did not take. */
async function loadShortcut() {
  renderKeys(el('shortcut-keys-2'), DEFAULT_COMBO);
  try {
    const commands = await api.commands.getAll();
    const copy = (commands || []).filter((c) => c.name === 'clip-copy')[0];
    const combo = copy && copy.shortcut;
    if (combo && combo !== DEFAULT_COMBO) renderCustom(combo);
  } catch (e) { /* the markup already says the right thing */ }
}

/* ------------------------------------------------------------------ *
 * Version
 * ------------------------------------------------------------------ */

function loadVersion() {
  try {
    const manifest = api.runtime.getManifest();
    if (manifest && manifest.version) el('version').textContent = 'v' + manifest.version;
  } catch (e) { /* the bar reads fine without it */ }
}

/* ------------------------------------------------------------------ *
 * The live toast
 *
 * sticky, because this one is being read rather than glanced at — a timed
 * copy would wipe itself off the page before a new user found it.
 * ------------------------------------------------------------------ */

function mountToast() {
  const stage = el('toast-stage');
  if (!stage || typeof DR.showToast !== 'function') return;
  DR.showToast({
    title: 'Copied as Markdown',
    detail: '≈1.2k tokens · 4,930 chars',
    ok: true,
    sticky: true,
    mount: stage,
  }, document);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function wire() {
  const settings = el('open-settings');
  if (settings) {
    settings.addEventListener('click', () => {
      try { api.runtime.openOptionsPage(); } catch (e) { /* nothing to offer */ }
    });
  }

  /* chrome://extensions/shortcuts cannot be an href — the browser refuses to
   * follow a link to it from any page, extension pages included. When even
   * tabs.create is refused, print the address so it can be typed. */
  const shortcuts = el('open-shortcuts');
  if (shortcuts) {
    shortcuts.addEventListener('click', async () => {
      try {
        await api.tabs.create({ url: SHORTCUT_URL });
      } catch (e) {
        const help = el('shortcut-help');
        if (!help) return;
        help.textContent = 'Open ' + SHORTCUT_URL + ' to set the shortcut.';
        help.hidden = false;
      }
    });
  }
}

loadVersion();
loadShortcut();
mountToast();
wire();
