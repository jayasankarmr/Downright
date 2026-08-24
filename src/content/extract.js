/* Downright — main-content extraction (Readability-style, compact).
 *
 * Finds the element most likely to hold the article: semantic landmarks
 * first, then paragraph-density scoring with link-density and class-name
 * penalties. Falls back to <body> when nothing scores well enough, so a
 * clip never comes back empty. Also collects page metadata for the
 * front matter block. */
(function (root) {
  'use strict';

  const POSITIVE_RE = /article|post|entry|content|main|body|text|story|blog|prose|markdown/i;
  const NEGATIVE_RE = /banner|combx|comment|com-|contact|foot|masthead|media-info|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget|nav|menu|breadcrumb|share|social|advert/i;

  const SEED_SELECTORS = [
    'article', 'main', '[role="main"]', '#content', '#main-content',
    '.post-content', '.entry-content', '.article-body', '.article-content',
    '.markdown-body', '#mw-content-text', '.mw-parser-output', '.post-body',
    '.story-body', '.content-body',
  ];

  function textLen(el) {
    return (el.textContent || '').trim().length;
  }

  function linkDensity(el) {
    const total = textLen(el);
    if (!total) return 0;
    let linked = 0;
    for (const a of el.querySelectorAll('a')) linked += (a.textContent || '').trim().length;
    return Math.min(linked / total, 1);
  }

  function classWeight(el) {
    let w = 0;
    const ci = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
    if (POSITIVE_RE.test(ci)) w += 25;
    if (NEGATIVE_RE.test(ci)) w -= 25;
    return w;
  }

  function pickRoot(doc) {
    const body = doc.body;
    if (!body) return { root: doc.documentElement, fallback: true };

    // 1. A single strong semantic landmark wins outright.
    for (const sel of ['article', 'main', '[role="main"]']) {
      let els;
      try { els = body.querySelectorAll(sel); } catch (e) { continue; }
      if (els.length === 1 && textLen(els[0]) >= 400 && linkDensity(els[0]) < 0.5) {
        return { root: els[0], fallback: false };
      }
    }

    // 2. Score containers by the paragraphs they hold.
    const scores = new Map();
    const bump = (el, s) => { if (el && el !== body.parentElement) scores.set(el, (scores.get(el) || 0) + s); };
    for (const p of body.querySelectorAll('p, pre, blockquote')) {
      const t = (p.textContent || '').trim();
      if (t.length < 25) continue;
      const s = 1 + Math.min(Math.floor(t.length / 100), 3) + (t.split(',').length - 1) * 0.5;
      bump(p.parentElement, s);
      if (p.parentElement) bump(p.parentElement.parentElement, s / 2);
    }

    for (const sel of SEED_SELECTORS) {
      let els;
      try { els = body.querySelectorAll(sel); } catch (e) { continue; }
      for (const el of els) if (scores.has(el)) scores.set(el, scores.get(el) * 1.2 + 10);
    }

    let best = null;
    let bestScore = 0;
    for (const [el, raw] of scores) {
      const final = (raw + classWeight(el)) * (1 - linkDensity(el));
      if (final > bestScore) { best = el; bestScore = final; }
    }

    if (best && textLen(best) >= 250) {
      // If the winner holds only part of the article (common when each
      // section sits in its own wrapper), climb while the parent roughly
      // doubles the usable text without becoming a link farm.
      let cur = best;
      while (cur.parentElement && cur.parentElement !== body &&
             textLen(cur.parentElement) > textLen(cur) * 1.6 &&
             linkDensity(cur.parentElement) < 0.35) {
        cur = cur.parentElement;
      }
      return { root: cur, fallback: false };
    }
    return { root: body, fallback: true };
  }

  function metaContent(doc, selectors) {
    for (const sel of selectors) {
      let el;
      try { el = doc.querySelector(sel); } catch (e) { continue; }
      if (!el) continue;
      const v = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent;
      if (v && v.trim()) return v.trim();
    }
    return '';
  }

  function cleanTitle(rawTitle, siteName, doc) {
    let t = (rawTitle || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const seps = [' – ', ' — ', ' | ', ' :: ', ' - ', ' · '];
    for (const sep of seps) {
      if (!t.includes(sep)) continue;
      const parts = t.split(sep);
      const last = parts[parts.length - 1].trim();
      const first = parts[0].trim();
      if (siteName && last.toLowerCase() === siteName.toLowerCase().trim()) {
        return parts.slice(0, -1).join(sep).trim();
      }
      if (siteName && first.toLowerCase() === siteName.toLowerCase().trim()) {
        return parts.slice(1).join(sep).trim();
      }
      // Heuristic: short trailing segment on a long title is a site suffix.
      if (parts.length === 2 && last.length < 20 && first.length > last.length * 2) {
        const host = ((doc.location && doc.location.hostname) || '').replace(/^www\./, '');
        if (host && last.toLowerCase().replace(/[^a-z0-9]/g, '').includes(host.split('.')[0])) {
          return first;
        }
      }
    }
    return t;
  }

  function collectMeta(doc, rootEl) {
    const site = metaContent(doc, ['meta[property="og:site_name"]']) ||
      ((doc.location && doc.location.hostname) || '');

    let title = metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    title = cleanTitle(title || doc.title, site, doc);
    if (rootEl) {
      // A lone <h1> whose text sits inside the document title is the real
      // title; what surrounds it is site-name decoration.
      const h1s = rootEl.querySelectorAll('h1');
      if (h1s.length === 1) {
        const h1t = (h1s[0].textContent || '').replace(/\s+/g, ' ').trim();
        if (h1t && h1t.length >= 3 &&
            (!title || (h1t.length < title.length && title.toLowerCase().includes(h1t.toLowerCase())))) {
          title = h1t;
        }
      }
    }

    let author = metaContent(doc, [
      'meta[name="author"]', 'meta[property="article:author" i]',
      'meta[name="parsely-author"]', 'meta[name="twitter:creator"]',
    ]);
    if (/^https?:\/\//i.test(author)) author = '';
    if (!author && rootEl) {
      const bylineEl = rootEl.querySelector('[rel="author"], .byline, .author-name, [itemprop="author"] [itemprop="name"], [itemprop="author"]');
      if (bylineEl) author = (bylineEl.textContent || '').replace(/\s+/g, ' ').replace(/^by\s+/i, '').trim();
    }
    if (author.length > 120) author = '';

    let published = metaContent(doc, [
      'meta[property="article:published_time"]', 'meta[name="date"]',
      'meta[name="dcterms.date"]', 'meta[itemprop="datePublished"]',
      'meta[name="parsely-pub-date"]',
    ]);
    if (!published && rootEl) {
      const t = rootEl.querySelector('time[datetime]');
      if (t) published = t.getAttribute('datetime') || '';
    }
    const pubMatch = /^(\d{4}-\d{2}-\d{2})/.exec(published.trim());
    published = pubMatch ? pubMatch[1] : '';

    const description = metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]'])
      .replace(/\s+/g, ' ').trim();

    return {
      title,
      author,
      published,
      site: site.replace(/\s+/g, ' ').trim(),
      description,
      url: (doc.location && doc.location.href) || doc.baseURI || '',
    };
  }

  function extract(doc) {
    const { root: rootEl, fallback } = pickRoot(doc);
    const meta = collectMeta(doc, rootEl);
    return { root: rootEl, meta, usedFallback: fallback };
  }

  root.__downright = Object.assign(root.__downright || {}, { extract, collectMeta });
})(globalThis);
