# Changelog

## Unreleased

Every clip now answers, and says why when it can't:

- **A toast at the top of the page on every invocation.** The keyboard shortcut and the
  right-click menu used to report only through a 1.8-second badge on the toolbar icon —
  easy to miss, and it never said anything. Now a card drops in at the top centre of the
  page with a drawn checkmark and the token count, or a drawn cross and a sentence
  explaining the failure. It lives in a closed shadow root whose geometry is pinned with
  `!important`, so a page cannot restyle it out of existence, and it dismisses on click.
- **Blocked sites are named, not shrugged at.** `common/blocked.js` maps each way a clip
  can fail to a title and an actionable sentence: browser pages and extension pages
  (sealed off from every extension), the Chrome/Edge/Firefox add-on stores, `file:` URLs
  without *Allow access to file URLs*, PDFs in the built-in viewer, pages with no
  readable text, a page whose permissions policy refuses the clipboard, a page that is
  merely unfocused, and a blocked download. The same catalogue feeds the toast, the
  popup, and the toolbar tooltip, so all three tell one story.
- **When no toast is possible, the popup says it instead.** On a browser page there is no
  document an extension may draw on, so nothing in the page can ever appear. The reason
  is stashed in session storage and the extension's own popup is opened
  (`action.openPopup()`, Chrome 127+/Firefox 127+), landing under the toolbar icon with
  the explanation already on screen. Older browsers fall back to the badge and tooltip.
- **Failures always speak.** The "show the Copied toast" preference now governs the
  confirmation only — a clip that quietly does nothing is worse than one that says why.
- **The popup reports its own copy and save failures** in a status bar under the header,
  rather than leaving the button silent, and its error card fills the window so the
  footer stays put.
- Empty clips are no longer silent successes: a PDF viewer or a page with no readable
  text is reported as such instead of putting an empty document on the clipboard.
- Entry animations are additive everywhere — every rule states the finished look and
  animates only the arrival, with the stagger inside the keyframe percentages rather
  than an `animation-delay` held by a fill mode. Reduced motion, and any timeline that
  never advances, leaves a fully drawn toast rather than an invisible one.

Conversion fixes, found by clipping dense Wikipedia articles:

- Emphasis nesting: `<i><b>…</b></i>` now yields `***…***` instead of silently
  dropping the italic, and the decorative emphasis on captions, `<dt>` terms, and
  `<summary>` lines is skipped when the content already carries emphasis of its
  own — previously an italic-leading caption produced broken pairs like
  `**Shōkaku* under attack…*`.
- `<cite>`/`<dfn>` follow the page's rendered font style. Wikipedia resets
  citations upright, so bibliography entries are no longer italicized whole;
  only the inner book title stays italic.
- Tables nested inside table cells are flattened into the outer cell (one line
  per row), so Wikipedia infoboxes convert to real GFM tables instead of falling
  back to sanitized HTML. The HTML fallback remains only for code blocks in cells.
- Navigation boxes (`role="navigation"`, `navbox` classes) are pruned in article
  mode — collapsed navboxes no longer leave behind empty header-only tables.
- `utm_*` analytics parameters are stripped from every resolved URL; Wikipedia's
  Parsoid HTML stamps them onto each thumbnail and they carried into clips.

Hardening, from a security review of the 1.0.0 code:

- **Hidden text is no longer clipped.** A clip is bound for an AI chat, so text a page
  hides from the reader is a way to smuggle instructions past them. Elements hidden by
  `opacity:0`, `font-size:0` (on a leaf), off-screen absolute/fixed positioning,
  `text-indent`, `clip-path: inset(50%)`, or the 1×1 `clip: rect(0,0,0,0)` recipe are
  pruned alongside the existing `display:none` and `visibility:hidden`. Gradient text
  (`color: transparent` + `background-clip: text`) is deliberately kept — it is real
  content, and pruning it would eat headings all over the web.
- **Invisible Unicode carriers are stripped** from every text node, code block, alt
  text, and title: the Tag block (`U+E0000`–`U+E007F`), which encodes plain ASCII in
  codepoints nothing paints, plus zero-width joiners, word joiners, invisible
  operators, and bidi overrides.
- **Link schemes are an allowlist**: `http`, `https`, `mailto`, `tel`. `file:`,
  `intent:`, `ms-msdt:`, `search-ms:` and other custom protocol handlers no longer
  reach a clip, where one click in a downstream renderer could act on them.
- **The save no longer touches the page.** The download anchor is never appended to the
  document, so page script can neither read the clip back out of its `blob:` URL nor
  cancel the click from a capturing listener.
- **The clipboard fallback can't be hijacked.** When `navigator.clipboard` is
  unavailable, the `execCommand` path now writes the payload from its own capturing
  `copy` listener and stops the event there, instead of letting a page listener
  substitute its own content — and it restores the user's selection afterwards.
- **Filenames**: bidi overrides stripped (no reversed-name spoofing in the download
  shelf), and Windows reserved device names (`CON`, `COM1`, `LPT1`…) defused.
- **Work budgets**: conversion stops with a warning after 200k nodes or 5 seconds
  rather than freezing the tab, and a `rowspan` can no longer allocate grid slots past
  the end of its own table.
- `scripts/check-no-network.sh` now catches constructed `Image`/`Audio`/`WebSocket`
  objects, dynamic `import()`, `navigator.sendBeacon`/`serviceWorker`, `window.open`,
  absolute URL string literals, off-device markup references, and preload hints — not
  just the literal word `fetch`.

## 1.0.0 — 25 August 2026

First release.

- One-keystroke clip (`Alt+M`): article → clean GFM on the clipboard; selection-aware.
- Right-click menu: copy selection, copy page, save page as `.md`.
- Popup with live preview, Article/Full-page toggle, token estimate, copy & save.
- Converter: GFM tables with colspan/rowspan grid placement; code fences with language
  inference (Prism/Shiki/highlight.js/GitHub); KaTeX/MathJax/MediaWiki/MathML → LaTeX;
  absolute URLs (lazy images and srcset included); Shadow DOM + `<slot>` flattening;
  selection context re-wrapping (list numbering, table headers, code fencing).
- Readability-style article extraction with metadata (title, author, published, site).
- Optional YAML front matter; download filename templates.
- Zero dependencies, no network access, no host permissions.
