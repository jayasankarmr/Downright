/* Downright — popup. Auto-clips the active tab on open, previews the
 * Markdown, and offers copy / save. The popup injects and calls the
 * converter itself; no messaging with the background worker. */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const CONTENT_FILES = [
  'common/defaults.js',
  'common/blocked.js',
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

function describe(code) {
  const b = globalThis.DOWNRIGHT_BLOCKED;
  if (b && typeof b.describe === 'function') return b.describe(code);
  return { code, title: 'Downright can’t run on this page.', detail: '' };
}

function showError(code) {
  const info = describe(code);
  el('preview').hidden = true;
  el('error').hidden = false;
  el('error-text').textContent = info.title;
  el('error-sub').textContent = info.detail;
  el('copy').disabled = true;
  el('save').disabled = true;
  el('stats').textContent = '';
}

let statusTimer = null;

function showStatus(ok, text) {
  const bar = el('status');
  const mark = bar.querySelector('.mark');
  el('status-text').textContent = text;
  mark.className = 'mark ' + (ok ? 'ok' : 'no');
  bar.hidden = false;
  // Restart the entry animation even when the bar is already showing.
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { bar.hidden = true; }, ok ? 2200 : 6000);
}

/* When the background worker could not draw a toast on the page it stashes
 * the reason and opens this popup instead. Read it once, then clear it, so a
 * later click on the toolbar icon does not replay an old failure. */
async function stashedReason(tabId) {
  try {
    const stored = await api.storage.session.get({ lastBlock: null });
    const block = stored && stored.lastBlock;
    await api.storage.session.remove('lastBlock');
    if (!block || !block.code) return null;
    if (block.tabId !== tabId && block.tabId !== -1) return null;
    if (Date.now() - block.at > 60000) return null;
    return block.code;
  } catch (e) {
    return null;
  }
}

function classifyTab(tab) {
  const b = globalThis.DOWNRIGHT_BLOCKED;
  if (b && typeof b.classifyUrl === 'function') return b.classifyUrl(tab && tab.url);
  return null;
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
      showError('convert-failed');
      return;
    }
    // A PDF or a page with no readable text converts "successfully" to
    // nothing at all; say which rather than showing an empty preview.
    if (res.reason === 'pdf-viewer' || res.reason === 'empty-page') {
      showError(res.reason);
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
    const code = (await stashedReason(currentTab.id)) ||
      classifyTab(currentTab) || 'injection-blocked';
    showError(code);
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
  if (!currentTab) { showError('no-tab'); return; }
  await clip();

  el('copy').addEventListener('click', async () => {
    if (!currentResult) return;
    let done = false;
    try {
      await navigator.clipboard.writeText(currentResult.markdown);
      done = true;
    } catch (e) {
      try {
        el('preview').select();
        done = document.execCommand('copy');
      } catch (err) { /* fall through to the status bar */ }
    }
    if (done) {
      flash(el('copy'), 'Copied ✓');
      showStatus(true, 'Copied as Markdown · ≈' + formatTokens(currentResult.meta.tokens) + ' tokens');
    } else {
      showStatus(false, describe('clipboard-blocked').title +
        ' — select the text above and press Ctrl/⌘+C.');
    }
  });

  el('save').addEventListener('click', () => {
    if (!currentResult) return;
    try {
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
      showStatus(true, 'Saved ' + (currentResult.meta.filename || 'clip.md'));
    } catch (e) {
      showStatus(false, describe('download-blocked').title);
    }
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
