/* Downright — popup. Auto-clips the active tab on open, previews the
 * Markdown, and offers copy / save. The popup injects and calls the
 * converter itself; no messaging with the background worker. */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const CONTENT_FILES = [
  'common/defaults.js',
  'common/toast.js',
  'content/convert.js',
  'content/extract.js',
  'content/clip.js',
];

const el = (id) => document.getElementById(id);

let currentTab = null;
let currentResult = null;
let settings = null;
let forceMode = null; // 'auto' until the user overrides within the popup

async function getSettings() {
  const defaults = globalThis.DOWNRIGHT_DEFAULTS || {};
  try {
    return await api.storage.sync.get(defaults);
  } catch (e) {
    return Object.assign({}, defaults);
  }
}

function setModeButtons() {
  const article = settings.mode !== 'full';
  el('mode-article').classList.toggle('active', article);
  el('mode-full').classList.toggle('active', !article);
}

function showError(message) {
  el('preview').hidden = true;
  el('error').hidden = false;
  if (message) el('error-text').textContent = message;
  el('copy').disabled = true;
  el('save').disabled = true;
  el('stats').textContent = '';
}

function formatTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

async function clip() {
  if (!currentTab) return;
  el('preview').value = '';
  el('preview').placeholder = 'Converting…';
  try {
    await api.scripting.executeScript({ target: { tabId: currentTab.id }, files: CONTENT_FILES });
    const results = await api.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (o) => globalThis.__downright.clip(o),
      args: [{ mode: forceMode || 'auto', settings }],
    });
    const res = results && results[0] ? results[0].result : null;
    if (!res || !res.ok) {
      showError('Something went wrong converting this page.');
      return;
    }
    currentResult = res;
    el('error').hidden = true;
    el('preview').hidden = false;
    el('preview').value = res.markdown;
    el('copy').disabled = false;
    el('save').disabled = false;
    el('stats').textContent =
      '≈ ' + formatTokens(res.meta.tokens) + ' tokens · ' +
      res.meta.chars.toLocaleString() + ' chars';
    const isSelection = res.meta.mode === 'selection';
    el('selection-note').hidden = !isSelection;
  } catch (e) {
    showError();
  }
}

function flash(button, label) {
  const original = button.textContent;
  button.textContent = label;
  button.classList.add('done');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('done');
  }, 1400);
}

async function main() {
  settings = await getSettings();
  setModeButtons();

  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs && tabs[0];
  if (!currentTab) { showError(); return; }
  await clip();

  el('copy').addEventListener('click', async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.markdown);
      flash(el('copy'), 'Copied ✓');
    } catch (e) {
      el('preview').select();
      if (document.execCommand('copy')) flash(el('copy'), 'Copied ✓');
    }
  });

  el('save').addEventListener('click', () => {
    if (!currentResult) return;
    const blob = new Blob([currentResult.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentResult.meta.filename || 'clip.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    flash(el('save'), 'Saved ✓');
  });

  el('mode-article').addEventListener('click', async () => {
    settings.mode = 'article';
    forceMode = 'article';
    setModeButtons();
    try { await api.storage.sync.set({ mode: 'article' }); } catch (e) { /* ignore */ }
    await clip();
  });

  el('mode-full').addEventListener('click', async () => {
    settings.mode = 'full';
    forceMode = 'full';
    setModeButtons();
    try { await api.storage.sync.set({ mode: 'full' }); } catch (e) { /* ignore */ }
    await clip();
  });

  el('clip-whole').addEventListener('click', async () => {
    forceMode = settings.mode || 'article';
    el('selection-note').hidden = true;
    await clip();
  });

  el('open-options').addEventListener('click', () => {
    api.runtime.openOptionsPage();
  });
}

main();
