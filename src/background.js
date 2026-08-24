/* Downright — background service worker (event page on Firefox).
 *
 * Deliberately minimal: create context menus, react to the keyboard
 * command, inject-and-run on demand. There are no persistent content
 * scripts and no message ports — the classic MV3 "receiving end does not
 * exist" failure mode cannot happen because nothing ever listens. */

/* global importScripts */
'use strict';

try {
  importScripts('common/defaults.js'); // Chromium service worker
} catch (e) { /* Firefox event page loads it via manifest scripts order */ }

const api = globalThis.browser ?? globalThis.chrome;

const CONTENT_FILES = [
  'common/defaults.js',
  'common/toast.js',
  'content/convert.js',
  'content/extract.js',
  'content/clip.js',
];

async function getSettings() {
  const defaults = globalThis.DOWNRIGHT_DEFAULTS || {};
  try {
    return await api.storage.sync.get(defaults);
  } catch (e) {
    return Object.assign({}, defaults);
  }
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

function flashBadge(tabId, ok) {
  try {
    api.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
    api.action.setBadgeBackgroundColor({ tabId, color: ok ? '#10b981' : '#ef4444' });
    setTimeout(() => {
      try { api.action.setBadgeText({ tabId, text: '' }); } catch (e) { /* tab gone */ }
    }, 1800);
  } catch (e) { /* badge is best-effort */ }
}

async function clipToClipboard(tab, mode) {
  if (!tab || tab.id == null) return;
  try {
    const settings = await getSettings();
    const res = await runClip(tab.id, { mode, settings, copy: true, toast: true });
    flashBadge(tab.id, !!(res && res.ok && res.copied));
  } catch (e) {
    // Restricted page (browser UI, store, PDF viewer…): signal via badge.
    flashBadge(tab.id, false);
  }
}

async function clipToFile(tab, mode) {
  if (!tab || tab.id == null) return;
  try {
    const settings = await getSettings();
    const res = await runClip(tab.id, { mode, settings, download: true, toast: true });
    flashBadge(tab.id, !!(res && res.ok && res.downloaded));
  } catch (e) {
    flashBadge(tab.id, false);
  }
}

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
