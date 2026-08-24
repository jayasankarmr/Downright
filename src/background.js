/* Downright — background service worker (event page on Firefox).
 *
 * Deliberately minimal: create context menus, react to the keyboard
 * command, inject-and-run on demand. There are no persistent content
 * scripts and no message ports — the classic MV3 "receiving end does not
 * exist" failure mode cannot happen because nothing ever listens.
 *
 * The one thing it owes the reader is an answer. Every path below ends in
 * either a success toast on the page or a named reason: in the page when a
 * script can still be injected there, and in the extension's own popup when
 * it cannot, because on a browser page there is no other surface left. */

/* global importScripts */
'use strict';

try {
  importScripts('common/defaults.js', 'common/blocked.js'); // Chromium service worker
} catch (e) { /* Firefox event page loads them via manifest scripts order */ }

const api = globalThis.browser ?? globalThis.chrome;

const CONTENT_FILES = [
  'common/defaults.js',
  'common/blocked.js',
  'common/toast.js',
  'content/convert.js',
  'content/extract.js',
  'content/clip.js',
];

// Enough to put a toast on a page when the clip pipeline never ran.
const TOAST_FILES = ['common/toast.js'];

const OK_BADGE = '#2F7A55';
const FAIL_BADGE = '#B3392E';

async function getSettings() {
  const defaults = globalThis.DOWNRIGHT_DEFAULTS || {};
  try {
    return await api.storage.sync.get(defaults);
  } catch (e) {
    return Object.assign({}, defaults);
  }
}

function describe(code) {
  const b = globalThis.DOWNRIGHT_BLOCKED;
  if (b && typeof b.describe === 'function') return b.describe(code);
  return { code: code || 'unknown', title: 'Downright couldn’t clip this page', detail: '' };
}

function classify(url) {
  const b = globalThis.DOWNRIGHT_BLOCKED;
  if (b && typeof b.classifyUrl === 'function') return b.classifyUrl(url);
  return null;
}

async function runClip(tabId, opts) {
  await api.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  const results = await api.scripting.executeScript({
    target: { tabId },
    func: (o) => globalThis.__downright.clip(o),
    args: [opts],
  });
  return results && results[0] ? results[0].result : null;
}

/* ------------------------------------------------------------------ *
 * Telling the reader what happened
 * ------------------------------------------------------------------ */

function flashBadge(tabId, ok) {
  if (tabId == null) return;
  try {
    api.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
    api.action.setBadgeBackgroundColor({ tabId, color: ok ? OK_BADGE : FAIL_BADGE });
    setTimeout(() => {
      try { api.action.setBadgeText({ tabId, text: '' }); } catch (e) { /* tab gone */ }
    }, ok ? 1800 : 4000);
  } catch (e) { /* badge is best-effort */ }
}

/* Park the reason on the toolbar tooltip for as long as the badge shows it,
 * then hand the tooltip back exactly as it was. */
async function flashTitle(tabId, title, ms) {
  if (tabId == null) return;
  let previous = '';
  try { previous = await api.action.getTitle({ tabId }); } catch (e) { return; }
  try { api.action.setTitle({ tabId, title }); } catch (e) { return; }
  setTimeout(() => {
    try { api.action.setTitle({ tabId, title: previous }); } catch (e) { /* tab gone */ }
  }, ms);
}

/* Returns true only if the toast is genuinely on the page. */
async function injectToast(tabId, ok, info) {
  if (tabId == null) return false;
  try {
    await api.scripting.executeScript({ target: { tabId }, files: TOAST_FILES });
    const results = await api.scripting.executeScript({
      target: { tabId },
      func: (o) => !!globalThis.__downright.showToast(o),
      args: [{ ok, title: info.title, detail: info.detail }],
    });
    return !!(results && results[0] && results[0].result === true);
  } catch (e) {
    return false;
  }
}

/* Last resort. On a browser page, the store, or another extension's page
 * there is no document we are allowed to draw on — no toast can exist. The
 * extension's own popup is the only surface the browser still lets us put in
 * front of the reader, and it opens anchored under the toolbar icon at the
 * top of the window. Stash the reason first so it opens explaining itself
 * rather than failing a second time in silence. */
async function escalateToPopup(tabId, code) {
  try {
    await api.storage.session.set({
      lastBlock: { tabId: tabId == null ? -1 : tabId, code, at: Date.now() },
    });
  } catch (e) { /* session storage is best-effort */ }
  try {
    if (api.action && typeof api.action.openPopup === 'function') await api.action.openPopup();
  } catch (e) { /* Chrome < 127, Firefox < 127, or no focused window */ }
}

/* One failure, told once, on the best surface available. */
async function reportFailure(tabId, code, alreadyToasted) {
  const info = describe(code);
  flashBadge(tabId, false);
  flashTitle(tabId, 'Downright — ' + info.title, 4000);
  if (alreadyToasted) return;
  const shown = await injectToast(tabId, false, info);
  if (!shown) await escalateToPopup(tabId, code);
}

/* ------------------------------------------------------------------ *
 * The two things the extension does
 * ------------------------------------------------------------------ */

async function clipTo(tab, mode, action) {
  const tabId = tab && tab.id != null ? tab.id : null;
  if (tabId == null) {
    await reportFailure(null, 'no-tab', false);
    return;
  }
  let res = null;
  try {
    const settings = await getSettings();
    const opts = { mode, settings, toast: true };
    opts[action] = true;
    res = await runClip(tabId, opts);
  } catch (e) {
    // Restricted page (browser UI, store, PDF viewer, a file: URL without
    // file access…): the URL usually says which.
    await reportFailure(tabId, classify(tab.url) || 'injection-blocked', false);
    return;
  }
  if (!res || !res.ok) {
    await reportFailure(tabId, 'convert-failed', false);
    return;
  }
  if (action === 'copy' ? res.copied : res.downloaded) {
    flashBadge(tabId, true);
    return;
  }
  // The content script reached the page, so it has already toasted the
  // reason itself — unless drawing the toast is what failed.
  await reportFailure(tabId, res.reason || 'convert-failed', res.toasted);
}

const clipToClipboard = (tab, mode) => clipTo(tab, mode, 'copy');
const clipToFile = (tab, mode) => clipTo(tab, mode, 'download');

/* ------------------------------------------------------------------ *
 * Install: context menus + welcome page
 * ------------------------------------------------------------------ */

api.runtime.onInstalled.addListener((details) => {
  try {
    api.contextMenus.removeAll(() => {
      api.contextMenus.create({
        id: 'downright-copy-selection',
        title: 'Copy selection as Markdown',
        contexts: ['selection'],
      });
      api.contextMenus.create({
        id: 'downright-copy-page',
        title: 'Copy page as Markdown',
        contexts: ['page'],
      });
      api.contextMenus.create({
        id: 'downright-save-page',
        title: 'Save page as Markdown (.md)',
        contexts: ['page'],
      });
    });
  } catch (e) { /* menus unavailable in some contexts */ }

  if (details && details.reason === 'install') {
    try {
      api.tabs.create({ url: api.runtime.getURL('welcome/welcome.html') });
    } catch (e) { /* non-fatal */ }
  }
});

api.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'downright-copy-selection':
      clipToClipboard(tab, 'selection');
      break;
    case 'downright-copy-page':
      clipToClipboard(tab, 'auto');
      break;
    case 'downright-save-page':
      clipToFile(tab, 'auto');
      break;
  }
});

api.commands.onCommand.addListener(async (command, tab) => {
  let target = tab;
  if (!target || target.id == null) {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    target = tabs && tabs[0];
  }
  if (command === 'clip-copy') clipToClipboard(target, 'auto');
  else if (command === 'clip-save') clipToFile(target, 'auto');
});
