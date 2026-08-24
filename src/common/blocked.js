/* Downright — why a clip did not happen, in words a person can act on.
 *
 * A handful of surfaces are sealed off from every extension by the browser
 * itself; a few more are closed by the page. Until now each of those ended
 * as a silent no-op with a badge flash nobody watches. This module names
 * them, so the toast can say what went wrong and what to do about it.
 *
 * Loaded by the background worker, the popup, and injected alongside the
 * content scripts, so every surface tells the same story. No DOM, no
 * browser APIs — pure strings, and unit-tested in Node. */
(function (root) {
  'use strict';

  const REASONS = {
    /* --- the browser shut us out (no content script ever runs) --- */
    'browser-page': {
      title: 'Browser pages are off-limits',
      detail: 'The browser seals its own pages — settings, new tab, downloads, view-source — off from every extension, so there is nothing here Downright is allowed to read.',
    },
    'extension-page': {
      title: 'Extension pages are off-limits',
      detail: 'Browsers keep extensions out of each other’s pages, this one included.',
    },
    'web-store': {
      title: 'The add-on store blocks extensions',
      detail: 'Chrome Web Store, Edge Add-ons, and addons.mozilla.org are fenced off from every extension, so none can install or remove another behind your back.',
    },
    'local-file': {
      title: 'Local files need one more permission',
      detail: 'Turn on “Allow access to file URLs” for Downright on your browser’s extensions page, then try again.',
    },
    'blank-page': {
      title: 'This tab is empty',
      detail: 'Nothing is loaded here yet. Open a page and try again.',
    },
    'injection-blocked': {
      title: 'This page won’t let Downright run',
      detail: 'The browser refused to run the converter here. Reload the page and try again — if it keeps happening, this page is restricted.',
    },

    /* --- we got in, but there was nothing to take --- */
    'pdf-viewer': {
      title: 'PDFs aren’t web pages',
      detail: 'The built-in viewer paints a document rather than HTML, so there is no page text to convert. Look for an HTML version of the same document.',
    },
    'empty-page': {
      title: 'Nothing to copy',
      detail: 'Downright found no readable text on this page. If the content loads as you scroll, let it load and try again.',
    },
    'convert-failed': {
      title: 'Downright couldn’t convert this page',
      detail: 'The converter hit something it could not read. Try again from the Downright popup, or select the part you want and clip just that.',
    },

    /* --- we converted it, but the handover failed --- */
    'clipboard-blocked': {
      title: 'This page blocked the clipboard',
      detail: 'Its permissions policy will not allow an extension to write to the clipboard. Open the Downright popup — copying from there still works.',
    },
    'page-not-focused': {
      title: 'Click the page first',
      detail: 'The browser only allows a clipboard write while the page has focus. Click anywhere on it, then press the shortcut again.',
    },
    'download-blocked': {
      title: 'The save was blocked',
      detail: 'This page stopped the download. Open the Downright popup and use “Save .md” there instead.',
    },

    /* --- nothing to aim at --- */
    'no-tab': {
      title: 'No page to clip',
      detail: 'Downright could not find an active tab to read.',
    },
  };

  const FALLBACK = {
    title: 'Downright couldn’t clip this page',
    detail: 'The browser blocked the extension here.',
  };

  function describe(code) {
    const r = REASONS[code] || FALLBACK;
    return { code: code || 'unknown', title: r.title, detail: r.detail };
  }

  /* Schemes the browser reserves for itself. A content script never lands
   * on any of them, whatever permissions an extension holds. */
  const BROWSER_SCHEMES = new Set([
    'about', 'chrome', 'chrome-untrusted', 'chrome-error', 'chrome-search',
    'chrome-native', 'chrome-devtools', 'devtools', 'edge', 'brave', 'opera',
    'vivaldi', 'view-source', 'resource', 'moz', 'jar',
  ]);

  const EXTENSION_SCHEMES = new Set([
    'chrome-extension', 'moz-extension', 'extension', 'safari-web-extension',
  ]);

  /* The add-on galleries. Hosts are matched with regexes rather than string
   * literals on purpose — an absolute URL in a string literal would trip the
   * no-network audit, and it has every right to. */
  const STORE_HOSTS = [
    /^chromewebstore\.google\.com$/,
    /^addons\.mozilla\.org$/,
    /^addons\.opera\.com$/,
  ];
  const STORE_SECTIONS = [
    { host: /^chrome\.google\.com$/, path: /^\/webstore(\/|$)/ },
    { host: /^microsoftedge\.microsoft\.com$/, path: /^\/addons(\/|$)/ },
  ];

  /* Returns a reason code for a URL that cannot be clipped, or null when the
   * URL looks ordinary (or is unreadable — an empty tab.url means we were not
   * granted activeTab yet, which is not the same as "blocked"). */
  function classifyUrl(url) {
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) return null;

    const scheme = (raw.match(/^([a-z][a-z0-9+.-]*):/i) || ['', ''])[1].toLowerCase();
    if (!scheme) return null;
    if (/^about:blank(\?|#|$)/i.test(raw)) return 'blank-page';
    if (EXTENSION_SCHEMES.has(scheme)) return 'extension-page';
    if (BROWSER_SCHEMES.has(scheme)) return 'browser-page';
    if (scheme === 'file') return 'local-file';
    if (scheme !== 'http' && scheme !== 'https') return null;

    let host = '';
    let path = '';
    try {
      const u = new URL(raw);
      host = u.hostname.toLowerCase();
      path = u.pathname;
    } catch (e) {
      return null;
    }

    for (const re of STORE_HOSTS) if (re.test(host)) return 'web-store';
    for (const s of STORE_SECTIONS) if (s.host.test(host) && s.path.test(path)) return 'web-store';
    // Query strings full of ".pdf" are common; the path is the honest signal.
    if (/\.pdf$/i.test(path)) return 'pdf-viewer';
    return null;
  }

  root.DOWNRIGHT_BLOCKED = { REASONS, describe, classifyUrl };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { REASONS, describe, classifyUrl };
  }
})(globalThis);
