/* Downright — HTML → Markdown conversion engine.
 *
 * Zero dependencies. Runs against the live DOM (so JavaScript-rendered pages,
 * logged-in pages, and Shadow DOM all work), walks the flattened tree, and
 * emits GitHub-Flavored Markdown.
 *
 * Design constraints, in order:
 *   1. Correctness of the output Markdown (tables, code fences, math, URLs).
 *   2. Clean output — minimal escaping, no converter watermark, no noise.
 *   3. No network access of any kind. Ever.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Tag classification
   * ------------------------------------------------------------------ */

  const INLINE_TAGS = new Set([
    'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'br', 'cite', 'code',
    'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark',
    'nobr', 'output', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
    'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
  ]);

  // Never rendered, never descended into.
  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'template', 'link', 'meta', 'base', 'title',
    'head', 'object', 'embed', 'applet', 'param', 'source', 'track', 'map',
    'area', 'input', 'button', 'select', 'textarea', 'option', 'optgroup',
    'datalist', 'progress', 'meter', 'canvas', 'dialog', 'portal', 'col',
    'colgroup', 'svg', 'frame', 'frameset', 'noframes',
  ]);

  // Rendered MathJax v2 shells; the TeX source lives in a sibling <script>.
  const MATHJAX_SHELL = /(?:^|\s)(?:MathJax|MathJax_Display|MathJax_Preview|MathJax_CHTML|MathJax_SVG|MathJax_MathML)(?:\s|$)/;

  // Hard junk is pruned unconditionally in article mode — a "menu" or
  // "dropdown" container is site chrome even when a sibling class says
  // "content" (Wikipedia's .vector-menu-content language switcher).
  const JUNK_HARD = /(^|[-_ ])(nav|navbar|navigation|menu|dropdown|portlet|interlanguage|breadcrumbs?|banner|toolbar|masthead|skip-link|screen-reader|sr-only|visually-hidden|edit-?section|noprint|mw-jump|mw-indicators|catlinks)([-_ ]|$)/i;
  const JUNK_NEGATIVE = /(^|[-_ ])(share|sharing|social|related|recommend|newsletter|subscribe|promo|advert|ads?|sponsor|cookie|consent|gdpr|pagination|pager|comments?|disqus|sidebar|popup|modal|overlay|tooltip|site-?(header|footer|nav)|footer|toc)([-_ ]|$)/i;
  const JUNK_POSITIVE = /(^|[-_ ])(article|post|entry|content|main|body|text|story|blog|page|markdown|prose)([-_ ]|$)/i;

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  function classAndId(el) {
    const cls = typeof el.className === 'string' ? el.className : '';
    return cls + ' ' + (el.id || '');
  }

  function shadowRootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    try {
      if (root.chrome && root.chrome.dom && root.chrome.dom.openOrClosedShadowRoot) {
        return root.chrome.dom.openOrClosedShadowRoot(el) || null;
      }
    } catch (e) { /* not an extension context */ }
    try {
      if (el.openOrClosedShadowRoot) return el.openOrClosedShadowRoot; // Firefox content scripts
    } catch (e) { /* ignore */ }
    return null;
  }

  /* Children in flattened-tree order: shadow roots are entered, <slot>
   * elements resolve to their assigned light-DOM nodes. */
  function effectiveChildren(node) {
    if (node.nodeType === 1) {
      if (node.localName === 'slot' && node.assignedNodes) {
        const assigned = node.assignedNodes({ flatten: true });
        if (assigned.length) return assigned;
        return Array.from(node.childNodes); // fallback content
      }
      const sr = shadowRootOf(node);
      if (sr) return Array.from(sr.childNodes);
    }
    return Array.from(node.childNodes);
  }

  function computedStyleOf(el) {
    try {
      if (!el.isConnected) return null;
      const doc = el.ownerDocument;
      const win = doc && doc.defaultView;
      return win ? win.getComputedStyle(el) : null;
    } catch (e) {
      return null;
    }
  }

  function isBlockElement(el) {
    const tag = el.localName;
    if (INLINE_TAGS.has(tag)) return false;
    if (tag === 'img' || tag === 'picture' || tag === 'math' || tag === 'slot') return false;
    if (tag.includes('-')) {
      // Custom element: trust the computed display when we can get it.
      const st = computedStyleOf(el);
      if (st && st.display) return !st.display.startsWith('inline');
      return true;
    }
    return true;
  }

  function baseUriOf(node) {
    const doc = node.ownerDocument || node;
    return (doc && doc.baseURI) || node.baseURI || '';
  }

  function absoluteUrl(rawValue, node) {
    if (!rawValue) return null;
    const value = rawValue.trim();
    if (!value) return null;
    if (/^(javascript|vbscript|data|blob|about|chrome|filesystem):/i.test(value)) return null;
    try {
      return new URL(value, baseUriOf(node)).href;
    } catch (e) {
      return null;
    }
  }

  /* Pick the best candidate from a srcset attribute: largest width
   * descriptor wins, then highest density, then the last entry. */
  function pickFromSrcset(srcset) {
    if (!srcset) return null;
    let best = null;
    let bestScore = -1;
    for (const part of srcset.split(',')) {
      const bits = part.trim().split(/\s+/);
      const url = bits[0];
      if (!url) continue;
      let score = 0;
      const desc = bits[1] || '';
      const w = /^(\d+(?:\.\d+)?)w$/.exec(desc);
      const x = /^(\d+(?:\.\d+)?)x$/.exec(desc);
      if (w) score = parseFloat(w[1]) * 1000;
      else if (x) score = parseFloat(x[1]);
      if (score >= bestScore) { bestScore = score; best = url; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Text cleaning and escaping
   * ------------------------------------------------------------------ */

  function cleanText(s) {
    return s
      .replace(/[­​﻿]/g, '')  // soft hyphen, zero-width space, BOM
      .replace(/ /g, ' ');              // nbsp → plain space
  }

  function escapeInlineText(s) {
    s = s.replace(/[\\`\[\]]/g, (ch) => '\\' + ch);
    s = s.replace(/\*/g, (m, off, str) => {
      const prev = str[off - 1] || ' ';
      const next = str[off + 1] || ' ';
      return (/\S/.test(prev) || /\S/.test(next)) ? '\\*' : '*';
    });
    s = s.replace(/_/g, (m, off, str) => {
      const prev = str[off - 1] || '';
      const next = str[off + 1] || '';
      return (/\w/.test(prev) && /\w/.test(next)) ? '_' : '\\_';
    });
    s = s.replace(/~~/g, '\\~~');
    s = s.replace(/<(?=[A-Za-z/!?])/g, '\\<');
    s = s.replace(/&(?=[A-Za-z][A-Za-z0-9]{1,31};|#\d{1,7};|#[xX][0-9A-Fa-f]{1,6};)/g, '\\&');
    return s;
  }

  /* A paragraph line must not accidentally begin a heading, list, quote,
   * table, thematic break, or setext underline. Applied after assembly. */
  function guardLineStart(line) {
    if (/^\s*[=-]+\s*$/.test(line)) return line.replace(/^(\s*)([=-])/, '$1\\$2');
    if (/^(\s*)#{1,6}(\s|$)/.test(line)) return line.replace(/^(\s*)#/, '$1\\#');
    if (/^\s*>/.test(line)) return line.replace(/^(\s*)>/, '$1\\>');
    if (/^(\s*)[-+*]\s/.test(line)) return line.replace(/^(\s*)([-+*])/, '$1\\$2');
    if (/^(\s*)\d{1,9}[.)]\s/.test(line)) return line.replace(/^(\s*)(\d{1,9})([.)])/, '$1$2\\$3');
    if (/^\s*\|/.test(line)) return line.replace(/^(\s*)\|/, '$1\\|');
    return line;
  }

  function escapeLinkDestination(url) {
    return /[()<>\s]/.test(url) ? '<' + url.replace(/>/g, '%3E') + '>' : url;
  }

  function escapeAltText(s) {
    return cleanText(s).replace(/\s+/g, ' ').trim().replace(/[\\\[\]]/g, (ch) => '\\' + ch);
  }

  function escapeTitleAttr(s) {
    return cleanText(s).replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
  }

  /* ------------------------------------------------------------------ *
   * Skip / prune decisions
   * ------------------------------------------------------------------ */

  function shouldSkip(el, ctx) {
    const tag = el.localName;
    if (SKIP_TAGS.has(tag)) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    if (el.hidden) return true;
    if (MATHJAX_SHELL.test(typeof el.className === 'string' ? el.className : '')) return true;
    if (tag === 'span' && el.classList && el.classList.contains('katex-html')) return true;

    if (!ctx.detached && !ctx.inDetails) {
      // Hidden MathML / TeX layers are the source of truth for rendered
      // math, so math carriers are exempt from the visibility prune.
      const mathish = tag === 'math' || tag === 'mjx-container' ||
        /math|katex/i.test(typeof el.className === 'string' ? el.className : '');
      if (!mathish) {
        const st = computedStyleOf(el);
        if (st && (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse')) {
          return true;
        }
      }
    }

    if (ctx.articleMode) {
      if (tag === 'nav' || tag === 'aside') return true;
      if ((tag === 'header' || tag === 'footer') && ctx.rootIsBody) return true;
      const ci = classAndId(el);
      if (ci.trim()) {
        if (JUNK_HARD.test(ci)) return true;
        if (!JUNK_POSITIVE.test(ci) && JUNK_NEGATIVE.test(ci)) return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Math: KaTeX, MathJax (v2/v3), MathML, and math-as-image
   * ------------------------------------------------------------------ */

  function cleanTex(tex) {
    if (!tex) return null;
    let t = cleanText(String(tex)).trim().replace(/\s*\n\s*/g, ' ');
    const dm = /^\{\\displaystyle\s+([\s\S]*)\}$/.exec(t);
    if (dm) t = dm[1].trim();
    return t || null;
  }

  const MML_OPS = {
    '×': '\\times', '⋅': '\\cdot', '·': '\\cdot', '−': '-',
    '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '±': '\\pm',
    '∞': '\\infty', '→': '\\to', '←': '\\leftarrow',
    '∈': '\\in', '∉': '\\notin', '⊂': '\\subset',
    '⊆': '\\subseteq', '∪': '\\cup', '∩': '\\cap',
    '∀': '\\forall', '∃': '\\exists', '¬': '\\neg',
    '∧': '\\land', '∨': '\\lor', '⇒': '\\Rightarrow',
    '⇔': '\\Leftrightarrow', '≈': '\\approx', '≡': '\\equiv',
    '∝': '\\propto', '∂': '\\partial', '∇': '\\nabla',
    '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '√': '\\sqrt',
    '…': '\\dots', '⋯': '\\cdots', '′': "'", '∘': '\\circ',
  };

  const MML_LETTERS = {
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
    'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
    'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
    'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi',
    'Ψ': '\\Psi', 'Ω': '\\Omega',
  };

  function mmlText(s) {
    let out = '';
    for (const ch of cleanText(s).trim()) {
      out += MML_LETTERS[ch] !== undefined ? MML_LETTERS[ch] + ' '
        : MML_OPS[ch] !== undefined ? ' ' + MML_OPS[ch] + ' '
        : ch;
    }
    return out;
  }

  /* Best-effort MathML → TeX for the common presentational elements.
   * Returns null when it meets something it cannot translate faithfully. */
  function mathmlToTex(node) {
    if (node.nodeType === 3) return mmlText(node.nodeValue);
    if (node.nodeType !== 1) return '';
    const tag = node.localName;
    const kids = Array.from(node.childNodes).filter((n) =>
      n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim() !== ''));
    const join = (list) => {
      const parts = list.map(mathmlToTex);
      if (parts.some((p) => p === null)) return null;
      return parts.join('');
    };
    const one = (i) => (kids[i] ? mathmlToTex(kids[i]) : '');
    const grp = (s) => (s !== null && (s.length > 1 || s.length === 0) ? '{' + s + '}' : s);

    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'merror':
        return join(kids);
      case 'semantics':
        return kids.length ? mathmlToTex(kids[0]) : '';
      case 'annotation': case 'annotation-xml':
        return '';
      case 'mphantom':
        return '';
      case 'mi': case 'mn':
        return mmlText(node.textContent);
      case 'mo': {
        const t = cleanText(node.textContent).trim();
        if (MML_OPS[t] !== undefined) return ' ' + MML_OPS[t] + ' ';
        return /^[+\-=<>]$/.test(t) ? ' ' + t + ' ' : t;
      }
      case 'mtext':
        return '\\text{' + cleanText(node.textContent) + '}';
      case 'mspace':
        return ' ';
      case 'mfrac': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        return '\\frac{' + a + '}{' + b + '}';
      }
      case 'msup': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        return a + '^' + grp(b);
      }
      case 'msub': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        return a + '_' + grp(b);
      }
      case 'msubsup': case 'munderover': {
        const a = one(0), b = one(1), c = one(2);
        if (a === null || b === null || c === null) return null;
        return a + '_' + grp(b) + '^' + grp(c);
      }
      case 'munder': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        if (/\\(sum|prod|int|lim|max|min)/.test(a) || a.trim() === '\\lim') return a + '_' + grp(b);
        return '\\underset{' + b + '}{' + a + '}';
      }
      case 'mover': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        const acc = b.trim();
        if (acc === '¯' || acc === '―' || acc === '‾') return '\\bar' + grp(a);
        if (acc === '^') return '\\hat' + grp(a);
        if (acc === '→' || acc === ' \\to ') return '\\vec' + grp(a);
        if (acc === '˙') return '\\dot' + grp(a);
        if (acc === '~') return '\\tilde' + grp(a);
        return a + '^' + grp(b);
      }
      case 'msqrt': {
        const a = join(kids);
        if (a === null) return null;
        return '\\sqrt{' + a + '}';
      }
      case 'mroot': {
        const a = one(0), b = one(1);
        if (a === null || b === null) return null;
        return '\\sqrt[' + b + ']{' + a + '}';
      }
      case 'mfenced': {
        const a = join(kids);
        if (a === null) return null;
        return (node.getAttribute('open') || '(') + a + (node.getAttribute('close') || ')');
      }
      default:
        return null; // mtable and friends: bail, caller falls back
    }
  }

  function tidyTex(t) {
    return t.replace(/\s+/g, ' ').replace(/\s+([_^])/g, '$1').trim();
  }

  /* Returns {tex, display} when el is a rendered math construct, else null. */
  function matchMath(el) {
    const tag = el.localName;
    const cls = typeof el.className === 'string' ? el.className : '';

    // Wikipedia/MediaWiki wrapper: hidden MathML a11y layer + visible
    // rendering. Consume the whole wrapper as one unit so nothing doubles.
    if (/(?:^|\s)mwe-math-element(?:\s|$)/.test(cls)) {
      const display = /mwe-math-element-block|mwe-math-display/.test(cls) ||
        !!(el.querySelector && el.querySelector('.mwe-math-mathml-display, .mwe-math-fallback-image-display'));
      const ann = el.querySelector && el.querySelector('annotation[encoding="application/x-tex"]');
      if (ann) return { tex: cleanTex(ann.textContent), display };
      const img = el.querySelector && el.querySelector('img[alt]');
      if (img && img.getAttribute('alt')) return { tex: cleanTex(img.getAttribute('alt')), display };
      return null;
    }

    if (tag === 'script') {
      const type = el.getAttribute('type') || '';
      if (/^math\/tex/i.test(type)) {
        return { tex: cleanTex(el.textContent), display: /mode\s*=\s*display/i.test(type) };
      }
      return null;
    }

    if (/(?:^|\s)katex(?:\s|$)/.test(cls) || /(?:^|\s)katex-display(?:\s|$)/.test(cls) || tag === 'mjx-container' || tag === 'math') {
      const display =
        /katex-display/.test(cls) ||
        el.getAttribute('display') === 'block' ||
        el.getAttribute('displaystyle') === 'true' ||
        !!(el.closest && el.closest('.katex-display'));
      const ann = el.querySelector && el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"]');
      if (ann) return { tex: cleanTex(ann.textContent), display };
      const mml = tag === 'math' ? el : (el.querySelector && el.querySelector('math'));
      if (mml) {
        const tex = mathmlToTex(mml);
        if (tex !== null && tex.trim()) return { tex: tidyTex(tex), display };
        return { tex: cleanTex(mml.textContent), display };
      }
      return null;
    }

    if (tag === 'img') {
      const alt = el.getAttribute('alt') || '';
      const hint = cls + ' ' + (el.getAttribute('src') || '');
      if (/math|latex|tex(?![t])/i.test(hint) && alt.trim()) {
        const display = /display/i.test(cls) && !/inline/i.test(cls);
        return { tex: cleanTex(alt), display };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Code blocks
   * ------------------------------------------------------------------ */

  const LANG_ALIASES = {
    'c++': 'cpp', 'c#': 'csharp', 'f#': 'fsharp', 'objective-c': 'objc',
    'obj-c': 'objc', 'objectivec': 'objc', 'shell-session': 'console',
    'shellscript': 'bash', 'shell': 'bash', 'sh': 'bash', 'zsh': 'bash',
    'plain': '', 'plaintext': '', 'text': '', 'txt': '', 'none': '',
    'nohighlight': '', 'no-highlight': '', 'markup': 'html', 'svelte': 'svelte',
    'golang': 'go', 'ts': 'typescript', 'yml': 'yaml',
  };

  const LANG_CLASS_RE = /(?:^|\s)(?:lang(?:uage)?|brush|highlight(?:-source|-text)?)[-:]\s?([\w#+.-]+)/i;

  function normalizeLang(lang) {
    if (!lang) return '';
    const l = lang.toLowerCase().trim();
    return LANG_ALIASES[l] !== undefined ? LANG_ALIASES[l] : l;
  }

  function detectLang(el) {
    const seen = [];
    let cur = el;
    for (let i = 0; cur && i < 5; i++) { seen.push(cur); cur = cur.parentElement; }
    const inner = el.querySelector ? el.querySelector(':scope > code') : null;
    if (inner) seen.unshift(inner);
    for (const node of seen) {
      for (const attr of ['data-language', 'data-lang', 'data-code-language']) {
        const v = node.getAttribute && node.getAttribute(attr);
        if (v) return normalizeLang(v);
      }
      const cls = typeof node.className === 'string' ? node.className : '';
      const m = LANG_CLASS_RE.exec(cls);
      if (m) return normalizeLang(m[1]);
    }
    return '';
  }

  /* Extract code text, skipping line-number gutters and hidden helpers. */
  function codeTextOf(container) {
    const out = [];
    (function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { out.push(child.nodeValue); continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.localName;
        if (tag === 'br') { out.push('\n'); continue; }
        if (child.getAttribute('aria-hidden') === 'true') continue;
        if (/(?:^|\s)(?:line-numbers-rows|linenodiv|line-number|gutter)(?:\s|$)/.test(
          typeof child.className === 'string' ? child.className : '')) continue;
        if (tag === 'script' || tag === 'style' || tag === 'button') continue;
        walk(child);
      }
    })(container);
    return out.join('')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[​﻿]/g, '')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }

  function fenceFor(text) {
    let max = 2;
    const re = /`+/g;
    let m;
    while ((m = re.exec(text)) !== null) max = Math.max(max, m[0].length);
    return '`'.repeat(Math.max(3, max + (max >= 3 ? 1 : 1)));
  }

  function renderCodeBlock(codeEl, langSource) {
    const text = codeTextOf(codeEl);
    if (!text.trim()) return null;
    const lang = detectLang(langSource || codeEl);
    const fence = fenceFor(text);
    return { md: fence + lang + '\n' + text + '\n' + fence, kind: 'code' };
  }

  /* Table-based code listings (Sphinx, Rouge/Jekyll, GitHub blame view…):
   * a gutter cell of line numbers next to a cell of code. */
  function codeTableParts(table) {
    const gutterRe = /(^|[-_ ])(lineno|linenos|line-numbers?|gutter|blob-num)([-_ ]|$)/i;
    const codeRe = /(^|[-_ ])(code|content|blob-code|highlight)([-_ ]|$)/i;
    const cells = Array.from(table.querySelectorAll('td, th'));
    if (!cells.length) return null;
    const gutters = cells.filter((c) => gutterRe.test(classAndId(c)));
    const codes = cells.filter((c) => codeRe.test(classAndId(c)) && !gutterRe.test(classAndId(c)));
    if (gutters.length && codes.length) return codes;
    // Two-column single-row layout where the first column is only numbers.
    const rows = table.rows ? Array.from(table.rows) : [];
    if (rows.length === 1 && rows[0].cells.length === 2) {
      const first = rows[0].cells[0].textContent.trim();
      if (first && /^[\d\s]+$/.test(first)) return [rows[0].cells[1]];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Inline rendering
   * ------------------------------------------------------------------ */

  function appendInline(buf, piece) {
    if (!piece) return buf;
    // Collapse a leading space only against an existing trailing space —
    // never at the start of the buffer, or nested renders (emphasis,
    // links) would lose the boundary space they hand back to their parent.
    if (/^\s/.test(piece) && /\s$/.test(buf)) {
      piece = piece.replace(/^\s+/, '');
      if (!piece) return buf;
    }
    return buf + piece;
  }

  /* <slot> elements are transparent: replace them with their assigned
   * nodes so block/inline classification applies to the real content. */
  function flattenSlots(nodes) {
    const out = [];
    for (const n of nodes) {
      if (n.nodeType === 1 && n.localName === 'slot') out.push(...flattenSlots(effectiveChildren(n)));
      else out.push(n);
    }
    return out;
  }

  function renderInline(nodes, ctx) {
    let buf = '';
    const emit = (s) => { buf = appendInline(buf, s); };

    for (const node of flattenSlots(nodes)) {
      if (ctx.guard.n > 900) break;
      if (node.nodeType === 3) {
        const collapsed = cleanText(node.nodeValue).replace(/[ \t\r\n\f]+/g, ' ');
        if (collapsed) emit(escapeInlineText(collapsed));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node;
      if (shouldSkip(el, ctx)) {
        // A skipped <script type="math/tex"> must still surface its TeX.
        const math = el.localName === 'script' ? matchMath(el) : null;
        if (math && math.tex) emit('$' + math.tex + '$');
        continue;
      }

      const math = matchMath(el);
      if (math && math.tex) {
        emit(math.display && !ctx.inCell ? '$$' + math.tex + '$$' : '$' + math.tex + '$');
        continue;
      }

      const tag = el.localName;
      ctx.guard.n++;
      try {
        switch (tag) {
          case 'br':
            if (ctx.inCell) { emit('<br>'); }
            else { buf = buf.replace(/\s+$/, '') + '\\\n'; }
            break;
          case 'strong': case 'b':
            emit(wrapEmphasis(renderInline(effectiveChildren(el), ctx), '**'));
            break;
          case 'em': case 'i': case 'cite': case 'dfn': case 'var':
            emit(wrapEmphasis(renderInline(effectiveChildren(el), ctx), '*'));
            break;
          case 'del': case 's': case 'strike':
            emit(wrapEmphasis(renderInline(effectiveChildren(el), ctx), '~~'));
            break;
          case 'code': case 'samp': case 'tt': case 'kbd':
            emit(renderCodeSpan(el));
            break;
          case 'a':
            emit(renderLink(el, ctx));
            break;
          case 'img':
            emit(renderImage(el, ctx));
            break;
          case 'picture': {
            const img = el.querySelector('img');
            if (img) emit(renderImage(img, ctx));
            break;
          }
          case 'q':
            emit('"' + renderInline(effectiveChildren(el), ctx).trim() + '"');
            break;
          case 'sub': case 'sup': {
            const inner = renderInline(effectiveChildren(el), ctx).trim();
            if (inner) emit('<' + tag + '>' + inner + '</' + tag + '>');
            break;
          }
          case 'wbr': case 'rp': case 'rt':
            break;
          case 'video': case 'audio': {
            const media = renderMedia(el, ctx);
            if (media) emit(media.md);
            break;
          }
          default: {
            // Transparent inline containers, plus block elements that ended
            // up in an inline flow: recurse and keep the text.
            const inner = renderInline(effectiveChildren(el), ctx);
            if (inner) {
              if (isBlockElement(el) && buf && !/\s$/.test(buf)) emit(' ');
              emit(inner);
            }
            break;
          }
        }
      } finally {
        ctx.guard.n--;
      }
    }
    return buf;
  }

  function wrapEmphasis(inner, marker) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    const lead = m[1] ? ' ' : '';
    const core = m[2];
    const trail = m[3] ? ' ' : '';
    if (!core) return lead || trail ? ' ' : '';
    if (core.startsWith(marker) && core.endsWith(marker)) return lead + core + trail;
    return lead + marker + core + marker + trail;
  }

  function renderCodeSpan(el) {
    let text = cleanText(el.textContent).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    let max = 0;
    const re = /`+/g;
    let m;
    while ((m = re.exec(text)) !== null) max = Math.max(max, m[0].length);
    const fence = '`'.repeat(max + 1);
    const pad = max > 0 || /^`|`$/.test(text) ? ' ' : '';
    return fence + pad + text + pad + fence;
  }

  function renderLink(el, ctx) {
    const inner = renderInline(effectiveChildren(el), ctx).trim();
    const rawHref = el.getAttribute('href');
    const url = absoluteUrl(rawHref, el) ||
      (rawHref && /^mailto:|^tel:/i.test(rawHref.trim()) ? rawHref.trim() : null);
    if (!url) return inner;
    if (!inner) return '';
    const title = el.getAttribute('title');
    const titlePart = title && title.trim() ? ' "' + escapeTitleAttr(title) + '"' : '';
    if (!titlePart) {
      const plain = inner.replace(/\\/g, '');
      if (plain === url || plain + '/' === url || plain === url.replace(/\/$/, '')) {
        return '<' + url + '>';
      }
    }
    return '[' + inner + '](' + escapeLinkDestination(url) + titlePart + ')';
  }

  function renderImage(el, ctx) {
    const alt = escapeAltText(el.getAttribute('alt') || '');
    if (ctx.settings.images === 'skip') return alt;

    const w = parseInt(el.getAttribute('width'), 10);
    const h = parseInt(el.getAttribute('height'), 10);
    if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) return ''; // tracking pixel

    let src = el.getAttribute('src');
    if (!src || /^data:/i.test(src.trim())) {
      src = el.getAttribute('data-src') || el.getAttribute('data-original') ||
        el.getAttribute('data-lazy-src') ||
        pickFromSrcset(el.getAttribute('data-srcset') || el.getAttribute('srcset'));
    }
    const url = absoluteUrl(src, el);
    if (!url) return alt;
    const title = el.getAttribute('title');
    const titlePart = title && title.trim() ? ' "' + escapeTitleAttr(title) + '"' : '';
    return '![' + alt + '](' + escapeLinkDestination(url) + titlePart + ')';
  }

  /* ------------------------------------------------------------------ *
   * Block rendering
   * ------------------------------------------------------------------ */

  function paragraphBlock(text) {
    let t = text.replace(/\s+$/, '').replace(/^\s+/, '');
    t = t.replace(/(\\\n)+$/, '');
    if (!t) return null;
    t = t.split('\n').map(guardLineStart).join('\n');
    return { md: t, kind: 'para' };
  }

  function renderBlocks(nodes, ctx) {
    const blocks = [];
    let inlineRun = [];
    const flush = () => {
      if (!inlineRun.length) return;
      const text = renderInline(inlineRun, ctx);
      inlineRun = [];
      const p = paragraphBlock(text);
      if (p) blocks.push(p);
    };

    for (const node of flattenSlots(nodes)) {
      if (ctx.guard.n > 900) break;
      if (node.nodeType === 3) {
        if (node.nodeValue.trim() !== '' || inlineRun.length) inlineRun.push(node);
        continue;
      }
      if (node.nodeType === 11) { // DocumentFragment
        flush();
        blocks.push(...renderBlocks(Array.from(node.childNodes), ctx));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node;

      if (shouldSkip(el, ctx)) {
        const math = el.localName === 'script' ? matchMath(el) : null;
        if (math && math.tex) {
          if (math.display) { flush(); blocks.push({ md: '$$\n' + math.tex + '\n$$', kind: 'math' }); }
          else inlineRun.push(el); // inline math script rides in the text flow
        }
        continue;
      }

      const math = matchMath(el);
      if (math && math.tex && math.display) {
        flush();
        blocks.push({ md: '$$\n' + math.tex + '\n$$', kind: 'math' });
        continue;
      }

      if (!isBlockElement(el)) { inlineRun.push(el); continue; }

      flush();
      ctx.guard.n++;
      try {
        const rendered = renderBlockElement(el, ctx);
        if (rendered) blocks.push(...(Array.isArray(rendered) ? rendered : [rendered]));
      } finally {
        ctx.guard.n--;
      }
    }
    flush();
    return blocks.filter(Boolean);
  }

  function renderBlockElement(el, ctx) {
    const tag = el.localName;
    switch (tag) {
      case 'p': case 'address':
        return paragraphBlock(renderInline(effectiveChildren(el), ctx));

      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return renderHeading(el, ctx);

      case 'ul': case 'ol': case 'menu':
        return renderList(el, ctx);

      case 'blockquote':
        return renderBlockquote(el, ctx);

      case 'pre': {
        const inner = el.querySelector(':scope > code');
        return renderCodeBlock(inner || el, el);
      }

      case 'table':
        return renderTable(el, ctx);

      case 'hr':
        return { md: '---', kind: 'hr' };

      case 'figure':
        return renderFigure(el, ctx);

      case 'figcaption':
        return captionBlock(el, ctx);

      case 'dl':
        return renderDefinitionList(el, ctx);

      case 'details':
        return renderDetails(el, ctx);

      case 'img': {
        const md = renderImage(el, ctx);
        return md ? { md, kind: 'para' } : null;
      }

      case 'picture': {
        const img = el.querySelector('img');
        if (!img) return null;
        const md = renderImage(img, ctx);
        return md ? { md, kind: 'para' } : null;
      }

      case 'video': case 'audio':
        return renderMedia(el, ctx);

      case 'iframe': {
        const url = absoluteUrl(el.getAttribute('src'), el);
        if (!url) return null;
        let host = '';
        try { host = new URL(url).hostname; } catch (e) { /* ignore */ }
        return { md: '[Embedded content' + (host ? ' · ' + host : '') + '](' + escapeLinkDestination(url) + ')', kind: 'para' };
      }

      case 'br':
        return null;

      default:
        // div, section, article, main, header, footer, form, fieldset,
        // custom elements, … — transparent containers.
        return renderBlocks(effectiveChildren(el), ctx);
    }
  }

  function renderHeading(el, ctx) {
    const level = parseInt(el.localName[1], 10);
    const kids = effectiveChildren(el).filter((n) => {
      if (n.nodeType !== 1 || n.localName !== 'a') return true;
      const cls = classAndId(n);
      const text = (n.textContent || '').trim();
      const isAnchorish = /anchor|permalink|headerlink|hash-link|heading-link/i.test(cls) ||
        /^[#¶§🔗⚓]?$/u.test(text);
      // Keep it when the link IS the heading text.
      return !(isAnchorish && effectiveChildren(el).length > 1);
    });
    let text = renderInline(kids, ctx).replace(/\s*\\\n\s*/g, ' ').replace(/\n+/g, ' ').trim();
    if (!text) return null;
    return { md: '#'.repeat(level) + ' ' + text, kind: 'heading' };
  }

  function renderBlockquote(el, ctx) {
    const inner = joinBlocks(renderBlocks(effectiveChildren(el), ctx));
    if (!inner) return null;
    const md = inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
    return { md, kind: 'quote' };
  }

  function renderList(el, ctx) {
    const ordered = el.localName === 'ol';
    let index = parseInt(el.getAttribute('start'), 10);
    if (!Number.isFinite(index)) index = 1;

    const items = effectiveChildren(el).filter((n) => n.nodeType === 1 && n.localName === 'li' && !shouldSkip(n, ctx));
    if (!items.length) return null;

    const rendered = [];
    let loose = false;

    for (const li of items) {
      const valueAttr = parseInt(li.getAttribute('value'), 10);
      if (ordered && Number.isFinite(valueAttr)) index = valueAttr;
      const marker = ordered ? index + '.' : (ctx.settings.bullet || '-');
      if (ordered) index++;

      let prefix = marker + ' ';
      const cb = li.querySelector(
        ':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox], :scope > label:first-child > input[type=checkbox]');
      if (cb) prefix += (cb.checked || cb.hasAttribute('checked')) ? '[x] ' : '[ ] ';

      const blocks = renderBlocks(effectiveChildren(li), ctx);
      if (!blocks.length) { rendered.push({ text: prefix.trimEnd(), blocks }); continue; }

      const pad = ' '.repeat(prefix.length);
      const parts = [];
      blocks.forEach((b, i) => {
        const indented = b.md.split('\n').map((l, j) => (i === 0 && j === 0 ? prefix + l : (l ? pad + l : ''))).join('\n');
        parts.push({ text: indented, kind: b.kind });
      });
      const nonListExtras = blocks.slice(1).some((b) => b.kind !== 'list');
      if (nonListExtras) loose = true;

      let text = '';
      parts.forEach((p, i) => {
        if (i === 0) { text = p.text; return; }
        text += (p.kind === 'list' ? '\n' : '\n\n') + p.text;
      });
      rendered.push({ text, blocks });
    }

    const sep = loose ? '\n\n' : '\n';
    return { md: rendered.map((r) => r.text).join(sep), kind: 'list' };
  }

  function captionBlock(el, ctx) {
    const text = renderInline(effectiveChildren(el), ctx).trim();
    if (!text) return null;
    return { md: '*' + text + '*', kind: 'para' };
  }

  function renderFigure(el, ctx) {
    const pre = el.querySelector(':scope > pre, :scope > div > pre');
    if (pre) {
      const blocks = [];
      const code = renderCodeBlock(pre.querySelector(':scope > code') || pre, el);
      if (code) blocks.push(code);
      const cap = el.querySelector(':scope > figcaption');
      if (cap) { const c = captionBlock(cap, ctx); if (c) blocks.push(c); }
      return blocks;
    }
    return renderBlocks(effectiveChildren(el), ctx);
  }

  function renderDefinitionList(el, ctx) {
    const blocks = [];
    for (const child of effectiveChildren(el)) {
      if (child.nodeType !== 1 || shouldSkip(child, ctx)) continue;
      if (child.localName === 'dt') {
        const t = renderInline(effectiveChildren(child), ctx).trim();
        if (t) blocks.push({ md: '**' + t + '**', kind: 'para' });
      } else if (child.localName === 'dd') {
        blocks.push(...renderBlocks(effectiveChildren(child), ctx));
      } else if (child.localName === 'div') {
        blocks.push(...renderDefinitionList(child, ctx));
      }
    }
    return blocks;
  }

  function renderDetails(el, ctx) {
    const blocks = [];
    const detailsCtx = Object.assign({}, ctx, { inDetails: true });
    for (const child of effectiveChildren(el)) {
      if (child.nodeType === 1 && child.localName === 'summary') {
        const t = renderInline(effectiveChildren(child), detailsCtx).trim();
        if (t) blocks.push({ md: '**' + t + '**', kind: 'para' });
      }
    }
    const rest = effectiveChildren(el).filter((n) => !(n.nodeType === 1 && n.localName === 'summary'));
    blocks.push(...renderBlocks(rest, detailsCtx));
    return blocks;
  }

  function renderMedia(el, ctx) {
    let src = el.currentSrc || el.getAttribute('src');
    if (!src) {
      const s = el.querySelector('source[src]');
      if (s) src = s.getAttribute('src');
    }
    const url = absoluteUrl(src, el);
    if (!url) return null;
    const label = escapeAltText(el.getAttribute('title') || el.getAttribute('aria-label') ||
      (el.localName === 'video' ? 'Video' : 'Audio'));
    return { md: '[▶ ' + label + '](' + escapeLinkDestination(url) + ')', kind: 'para' };
  }

  /* ------------------------------------------------------------------ *
   * Tables
   * ------------------------------------------------------------------ */

  function collectRows(table) {
    const rows = [];
    const foot = [];
    for (const child of table.children) {
      switch (child.localName) {
        case 'thead':
          for (const tr of child.children) if (tr.localName === 'tr') rows.push({ tr, head: true });
          break;
        case 'tbody':
          for (const tr of child.children) if (tr.localName === 'tr') rows.push({ tr, head: false });
          break;
        case 'tfoot':
          for (const tr of child.children) if (tr.localName === 'tr') foot.push({ tr, head: false });
          break;
        case 'tr':
          rows.push({ tr: child, head: false });
          break;
      }
    }
    return rows.concat(foot);
  }

  function cellAlign(cell) {
    if (!cell) return '';
    const attr = (cell.getAttribute('align') || '').toLowerCase();
    const style = (cell.style && cell.style.textAlign || '').toLowerCase();
    const v = style || attr;
    return v === 'left' || v === 'center' || v === 'right' ? v : '';
  }

  function alignToken(align) {
    switch (align) {
      case 'left': return ':---';
      case 'center': return ':---:';
      case 'right': return '---:';
      default: return '---';
    }
  }

  function renderTable(table, ctx) {
    // Code listing disguised as a table?
    const codeCells = codeTableParts(table);
    if (codeCells) {
      const text = codeCells.map((c) => codeTextOf(c)).join('\n').replace(/\n+$/, '');
      if (!text.trim()) return null;
      const lang = detectLang(table);
      const fence = fenceFor(text);
      return { md: fence + lang + '\n' + text + '\n' + fence, kind: 'code' };
    }

    // Structures GFM tables cannot express: fall back to sanitized HTML.
    if (table.querySelector('td table, th table, td pre, th pre')) {
      ctx.warnings.push('table-kept-as-html');
      const html = sanitizeTableHtml(table, ctx);
      return html ? { md: html, kind: 'html' } : null;
    }

    const rowInfos = collectRows(table).filter((r) => !shouldSkip(r.tr, ctx));
    if (!rowInfos.length) return null;

    // Place cells on a grid, honoring colspan / rowspan.
    const grid = [];
    rowInfos.forEach((info, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      for (const cell of info.tr.children) {
        if (cell.localName !== 'td' && cell.localName !== 'th') continue;
        while (grid[r][c] !== undefined) c++;
        const cs = Math.min(Math.max(cell.colSpan || 1, 1), 100);
        const rs = Math.min(Math.max(cell.rowSpan || 1, 1), 200);
        for (let i = 0; i < rs && r + i < rowInfos.length + rs; i++) {
          grid[r + i] = grid[r + i] || [];
          for (let j = 0; j < cs; j++) {
            grid[r + i][c + j] = (i === 0 && j === 0) ? { cell } : { spanned: true };
          }
        }
        c += cs;
      }
    });
    const rowCount = rowInfos.length;
    const cols = Math.max(...grid.slice(0, rowCount).map((row) => row.length), 0);
    if (!cols) return null;

    const cellText = (slot) => {
      if (!slot || !slot.cell) return '';
      const blocks = renderBlocks(effectiveChildren(slot.cell), Object.assign({}, ctx, { inCell: true }));
      return blocks.map((b) => b.md).join('<br>')
        .replace(/\n+/g, '<br>')
        .replace(/\|/g, '\\|')
        .trim();
    };

    // Header: leading thead rows, or a leading all-<th> row.
    let headEnd = 0;
    while (headEnd < rowCount && rowInfos[headEnd].head) headEnd++;
    if (headEnd === 0) {
      const first = grid[0] || [];
      const originCells = first.filter((s) => s && s.cell);
      if (originCells.length && originCells.every((s) => s.cell.localName === 'th')) headEnd = 1;
    }

    let header = new Array(cols).fill('');
    if (headEnd > 0) {
      for (let r = 0; r < headEnd; r++) {
        for (let c = 0; c < cols; c++) {
          const t = cellText(grid[r][c]);
          if (t) header[c] = header[c] ? header[c] + ' / ' + t : t;
        }
      }
    }

    const aligns = new Array(cols).fill('');
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowCount; r++) {
        const slot = grid[r][c];
        if (slot && slot.cell) { aligns[c] = cellAlign(slot.cell); break; }
      }
    }

    const lines = [];
    lines.push('| ' + header.join(' | ') + ' |');
    lines.push('| ' + aligns.map(alignToken).join(' | ') + ' |');
    for (let r = headEnd; r < rowCount; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) cells.push(cellText(grid[r] && grid[r][c]));
      lines.push('| ' + cells.join(' | ') + ' |');
    }

    const blocks = [];
    const caption = table.querySelector(':scope > caption');
    if (caption) {
      const t = renderInline(effectiveChildren(caption), ctx).trim();
      if (t) blocks.push({ md: '**' + t + '**', kind: 'para' });
    }
    blocks.push({ md: lines.join('\n'), kind: 'table' });
    return blocks;
  }

  /* Sanitized HTML serializer for tables GFM cannot represent. Keeps only
   * structural tags and safe attributes; resolves URLs; drops everything
   * else. Never used for anything the converter can express as Markdown. */
  const HTML_KEEP_TAGS = new Set([
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'code', 'pre', 'sub', 'sup',
  ]);

  function sanitizeTableHtml(el, ctx) {
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function ser(node) {
      if (node.nodeType === 3) {
        const t = cleanText(node.nodeValue);
        if (!t.trim()) return '';
        return escapeHtml(t.replace(/\s+/g, ' '));
      }
      if (node.nodeType !== 1) return '';
      if (shouldSkip(node, ctx)) return '';
      const tag = node.localName;
      const childHtml = effectiveChildren(node).map(ser).join('');
      if (!HTML_KEEP_TAGS.has(tag)) return childHtml;
      let attrs = '';
      if (tag === 'a') {
        const href = absoluteUrl(node.getAttribute('href'), node);
        if (href) attrs += ' href="' + escapeHtml(href) + '"';
      }
      if (tag === 'img') {
        const src = absoluteUrl(node.getAttribute('src'), node);
        if (!src) return '';
        attrs += ' src="' + escapeHtml(src) + '"';
        const alt = node.getAttribute('alt');
        if (alt) attrs += ' alt="' + escapeHtml(alt) + '"';
        return '<img' + attrs + '>';
      }
      if (tag === 'th' || tag === 'td') {
        for (const a of ['colspan', 'rowspan']) {
          const v = parseInt(node.getAttribute(a), 10);
          if (v > 1) attrs += ' ' + a + '="' + v + '"';
        }
      }
      if (tag === 'br') return '<br>';
      return '<' + tag + attrs + '>' + childHtml + '</' + tag + '>';
    }
    const html = ser(el);
    return html || null;
  }

  /* ------------------------------------------------------------------ *
   * Entry point
   * ------------------------------------------------------------------ */

  function joinBlocks(blocks) {
    return blocks.map((b) => b.md).filter((s) => s && s.trim()).join('\n\n');
  }

  function convert(nodes, options) {
    const opts = options || {};
    const ctx = {
      settings: Object.assign({ bullet: '-', images: 'keep' }, opts.settings || {}),
      articleMode: !!opts.articleMode,
      rootIsBody: !!opts.rootIsBody,
      detached: !!opts.detached,
      inDetails: false,
      inCell: false,
      warnings: [],
      guard: { n: 0 },
    };
    const list = Array.isArray(nodes) ? nodes : [nodes];
    const expanded = [];
    for (const n of list) {
      if (n.nodeType === 9) expanded.push(n.documentElement); // Document
      else expanded.push(n);
    }
    const blocks = renderBlocks(expanded, ctx);
    let md = joinBlocks(blocks);
    md = md.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').replace(/\s+$/, '');
    return { markdown: md, warnings: ctx.warnings };
  }

  root.__downright = Object.assign(root.__downright || {}, {
    convert,
    _internals: {
      escapeInlineText, guardLineStart, normalizeLang, detectLang,
      pickFromSrcset, cleanTex, tidyTex, fenceFor, effectiveChildren,
    },
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeInlineText, guardLineStart, normalizeLang, pickFromSrcset,
      cleanTex, tidyTex, fenceFor,
    };
  }
})(globalThis);
