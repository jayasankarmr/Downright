/* Downright — clip orchestrator.
 *
 * Injected on demand (activeTab); captures the page or selection, converts
 * it with the engine in convert.js, optionally copies / downloads / shows a
 * toast, and returns the result to the caller. No persistent listeners, no
 * message ports, no network. */
(function (root) {
  'use strict';

  const FALLBACK_DEFAULTS = {
    mode: 'article', frontmatter: true, fmTitle: true, fmSource: true,
    fmAuthor: true, fmPublished: true, fmDescription: false, fmClipped: true,
    titleHeading: true, bullet: '-', images: 'keep', toast: true,
    filenameTemplate: '{title}',
  };

  /* ------------------------------------------------------------------ *
   * Pure helpers (also unit-tested in Node)
   * ------------------------------------------------------------------ */

  function estimateTokens(text) {
    if (!text) return 0;
    let cjk = 0;
    const cjkRe = /[⺀-鿿가-힯豈-﫿]/g;
    const m = text.match(cjkRe);
    if (m) cjk = m.length;
    return Math.max(1, Math.round(cjk + (text.length - cjk) / 4));
  }

  function formatTokens(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  function sanitizeFilename(name) {
    const cleaned = (name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.\-]+|[\s.]+$/g, '')
      .slice(0, 120)
      .trim()
      // Bidi overrides let a page make a filename read backwards in the
      // download shelf. The page chooses this string; it does not get to
      // choose what the user sees.
      .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '');
    if (!cleaned) return 'clip';
    // CON.md is still CON on Windows — the reserved device names swallow
    // the save whatever extension follows them.
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return cleaned + '-clip';
    return cleaned;
  }

  function yamlValue(v) {
    return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim() + '"';
  }

  function localDateISO(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function buildFrontmatter(meta, settings) {
    const lines = [];
    if (settings.fmTitle && meta.title) lines.push('title: ' + yamlValue(meta.title));
    if (settings.fmSource && meta.url) lines.push('source: ' + yamlValue(meta.url));
    if (settings.fmAuthor && meta.author) lines.push('author: ' + yamlValue(meta.author));
    if (settings.fmPublished && meta.published) lines.push('published: ' + meta.published);
    if (settings.fmDescription && meta.description) lines.push('description: ' + yamlValue(meta.description));
    if (settings.fmClipped) lines.push('clipped: ' + localDateISO(new Date()));
    if (!lines.length) return '';
    return '---\n' + lines.join('\n') + '\n---\n\n';
  }

  function buildFilename(template, meta) {
    let host = '';
    try { host = new URL(meta.url).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }
    const name = (template || '{title}')
      .replace(/\{title\}/g, meta.title || 'clip')
      .replace(/\{date\}/g, localDateISO(new Date()))
      .replace(/\{domain\}/g, host);
    return sanitizeFilename(name) + '.md';
  }

  /* What the toast says. Kept beside the other string builders so the
   * wording lives with the code that measures the clip, not with the code
   * that paints it. */
  function describeClip(result, opts, tokens) {
    if (opts.download) {
      return result.downloaded
        ? { ok: true, title: 'Saved as Markdown', detail: result.meta.filename }
        : { ok: false, title: 'Could not save the file', detail: 'Try the Downright popup' };
    }
    if (!result.copied) {
      return {
        ok: false,
        title: 'Could not reach the clipboard',
        detail: 'Open the Downright popup to copy',
      };
    }
    return {
      ok: true,
      title: result.meta.mode === 'selection'
        ? 'Copied selection as Markdown'
        : 'Copied as Markdown',
      detail: '≈' + formatTokens(tokens) + ' tokens · ' + result.meta.chars.toLocaleString() + ' chars',
    };
  }

  /* ------------------------------------------------------------------ *
   * Selection capture
   * ------------------------------------------------------------------ */

  const WRAP_TAGS = new Set(['pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'ol', 'ul', 'blockquote', 'code', 'dl']);

  function selectionRoots(sel, doc) {
    const roots = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      if (range.collapsed) continue;
      const frag = range.cloneContents();

      // Re-wrap the fragment in clones of structural ancestors so a
      // selection that starts inside a list, table, or code block keeps
      // its structure (numbering, table-ness, fencing).
      let anc = range.commonAncestorContainer;
      if (anc.nodeType !== 1) anc = anc.parentElement;
      const chain = [];
      let cur = anc;
      while (cur && cur !== doc.body && cur !== doc.documentElement) {
        if (WRAP_TAGS.has(cur.localName)) chain.push(cur);
        cur = cur.parentElement;
      }

      let node = frag;
      for (const original of chain) { // innermost → outermost
        const shell = original.cloneNode(false);
        if (original.localName === 'ol') {
          // Preserve numbering: offset start by the items before the selection.
          let startNode = range.startContainer;
          if (startNode.nodeType !== 1) startNode = startNode.parentElement;
          const li = startNode && startNode.closest ? startNode.closest('li') : null;
          if (li && li.parentElement === original) {
            let idx = 0;
            for (const child of original.children) {
              if (child === li) break;
              if (child.localName === 'li') idx++;
            }
            const base = parseInt(original.getAttribute('start'), 10);
            shell.setAttribute('start', String((Number.isFinite(base) ? base : 1) + idx));
          }
        }
        if (original.localName === 'table' && original.tHead) {
          let headSelected = false;
          try { headSelected = range.intersectsNode(original.tHead); } catch (e) { /* ignore */ }
          if (!headSelected) shell.appendChild(original.tHead.cloneNode(true));
        }
        shell.appendChild(node);
        node = shell;
      }
      roots.push(node);
    }
    return roots;
  }

  /* ------------------------------------------------------------------ *
   * Clipboard and download
   * ------------------------------------------------------------------ */

  /* The execCommand fallback fires a real `copy` event in the page, and a
   * page listener can rewrite the clipboard payload out from under us —
   * putting whatever it likes on the user's clipboard while the toast says
   * "Copied ✓". So the fallback writes the data itself from a capturing
   * listener and stops the event there, and it puts the user's own
   * selection back afterwards instead of eating it. */
  function legacyCopy(text, doc) {
    const sel = doc.getSelection();
    const saved = [];
    for (let i = 0; sel && i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));

    const onCopy = (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.clipboardData) e.clipboardData.setData('text/plain', text);
    };
    doc.addEventListener('copy', onCopy, true);

    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    try {
      doc.body.appendChild(ta);
      ta.select();
      return !!doc.execCommand('copy');
    } finally {
      doc.removeEventListener('copy', onCopy, true);
      ta.remove();
      if (sel && saved.length) {
        sel.removeAllRanges();
        for (const r of saved) sel.addRange(r);
      }
    }
  }

  async function copyText(text, doc) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* fall through */ }
    try {
      return legacyCopy(text, doc);
    } catch (e) {
      return false;
    }
  }

  /* The anchor is deliberately never appended to the page. Attached, its
   * blob: URL carries the page's origin, so page script could observe the
   * save, read the whole clip back out of the blob, and cancel the click
   * from a capturing listener. Detached, the click still downloads and the
   * page sees nothing. */
  function triggerDownload(text, filename, doc) {
    try {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Main entry — called via chrome.scripting.executeScript
   * ------------------------------------------------------------------ */

  async function clip(options) {
    const opts = options || {};
    const settings = Object.assign({}, FALLBACK_DEFAULTS, root.DOWNRIGHT_DEFAULTS || {}, opts.settings || {});
    const doc = opts.document || document;
    const dr = root.__downright;

    try {
      const sel = doc.getSelection ? doc.getSelection() : null;
      const hasSelection = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed);
      const requested = opts.mode || 'auto';
      const mode = requested === 'auto'
        ? (hasSelection ? 'selection' : (settings.mode || 'article'))
        : requested;

      let bodyMd = '';
      let warnings = [];
      let meta;

      if (mode === 'selection' && hasSelection) {
        meta = dr.collectMeta(doc, doc.body);
        const roots = selectionRoots(sel, doc);
        const parts = [];
        for (const r of roots) {
          const res = dr.convert([r], { settings, detached: true });
          if (res.markdown) parts.push(res.markdown);
          warnings = warnings.concat(res.warnings);
        }
        bodyMd = parts.join('\n\n');
      } else if (mode === 'full') {
        meta = dr.collectMeta(doc, doc.body);
        const res = dr.convert([doc.body], { settings, articleMode: false });
        bodyMd = res.markdown;
        warnings = res.warnings;
      } else {
        const ex = dr.extract(doc);
        meta = ex.meta;
        const res = dr.convert([ex.root], {
          settings,
          articleMode: true,
          rootIsBody: ex.usedFallback,
        });
        bodyMd = res.markdown;
        warnings = res.warnings;
        if (ex.usedFallback) warnings.push('article-fallback-full-page');
      }

      let out = '';
      const isSelection = mode === 'selection' && hasSelection;
      if (settings.frontmatter && !isSelection) {
        out += buildFrontmatter(meta, settings);
      } else if (!isSelection && settings.titleHeading && meta.title) {
        const firstLine = (bodyMd.split('\n', 1)[0] || '').trim();
        const plainFirst = firstLine.replace(/^#+\s*/, '').replace(/\\/g, '').trim().toLowerCase();
        if (plainFirst !== meta.title.trim().toLowerCase()) {
          out += '# ' + meta.title.replace(/\s+/g, ' ').trim() + '\n\n';
        }
      }
      out += bodyMd;
      if (out && !out.endsWith('\n')) out += '\n';

      const tokens = estimateTokens(out);
      const result = {
        ok: true,
        markdown: out,
        warnings,
        copied: false,
        downloaded: false,
        meta: {
          title: meta.title,
          url: meta.url,
          author: meta.author,
          published: meta.published,
          mode,
          tokens,
          chars: out.length,
          filename: buildFilename(settings.filenameTemplate, meta),
        },
      };

      if (opts.copy) result.copied = await copyText(out, doc);
      if (opts.download) result.downloaded = triggerDownload(out, result.meta.filename, doc);

      if (opts.toast && settings.toast) {
        const toast = root.__downright && root.__downright.showToast;
        if (toast) toast(describeClip(result, opts, tokens), doc);
      }
      return result;
    } catch (e) {
      return { ok: false, error: String((e && e.stack) || e) };
    }
  }

  root.__downright = Object.assign(root.__downright || {}, {
    clip, estimateTokens, formatTokens, sanitizeFilename, buildFilename,
    buildFrontmatter, yamlValue,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      estimateTokens, formatTokens, sanitizeFilename, buildFilename, yamlValue,
    };
  }
})(globalThis);
