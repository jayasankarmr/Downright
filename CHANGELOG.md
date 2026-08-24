# Changelog

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
