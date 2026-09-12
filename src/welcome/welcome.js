/* Downright — the welcome page.
 *
 * The page is readable with the script disabled; everything here replaces a
 * hard-coded fallback with the truth about this particular install:
 *
 *   · the keycaps show the shortcut the browser actually bound, which is not
 *     always Alt+M — Chrome hands out only four command slots, and the user
 *     may have rebound it before ever opening this tab;
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
 * Two places show the shortcut — the hero slab and the first of the three
 * ways in — and both are filled from one read, so they cannot disagree.
 * ------------------------------------------------------------------ */

function renderKeys(box, combo) {
  if (!box) return;
  box.className = box.classList.contains('sm') ? 'keys sm' : 'keys';
  box.textContent = '';
  for (const part of (combo || 'Alt+M').split('+')) {
    const key = document.createElement('kbd');
    key.textContent = IS_MAC && MAC_KEYS[part] ? MAC_KEYS[part] : part;
    box.appendChild(key);
  }
}

/* No slot was assigned. Saying so — and saying where to fix it — beats
 * printing a key that does nothing. */
function renderUnset() {
  const box = el('shortcut-keys');
  if (box) {
    box.className = 'keys unset';
    box.textContent = 'No shortcut assigned';
  }
  const say = el('shortcut-say');
  if (say) say.textContent = 'assign one below, then press it on any page';
  renderKeys(el('shortcut-keys-2'), 'Alt+M');
}

async function loadShortcut() {
  try {
    const commands = await api.commands.getAll();
    const copy = (commands || []).filter((c) => c.name === 'clip-copy')[0];
    if (copy && copy.shortcut) {
      renderKeys(el('shortcut-keys'), copy.shortcut);
      renderKeys(el('shortcut-keys-2'), copy.shortcut);
      return;
    }
    if (copy) { renderUnset(); return; }
  } catch (e) { /* fall through to the documented default */ }
  renderKeys(el('shortcut-keys'), 'Alt+M');
  renderKeys(el('shortcut-keys-2'), 'Alt+M');
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
