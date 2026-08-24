# Downright — Copy Any Page as Markdown for AI

One keystroke turns the page you're reading into clean, **correct** Markdown on your
clipboard — ready to paste into ChatGPT, Claude, Obsidian, Notion, or a doc.

- **`Alt+M`** (`Option+M` on Mac): copy the article as Markdown. Select text first and the
  same keystroke clips just the selection.
- **Right-click** → *Copy selection as Markdown* / *Copy page as Markdown* / *Save page as .md*.
- **Toolbar popup**: preview the Markdown before copying, switch Article ↔ Full-page,
  save as a `.md` file, see a token estimate.

## Why another Markdown clipper

Because the existing ones get the hard parts wrong, and the hard parts are the point:

| The hard part | What Downright does |
| --- | --- |
| Tables | Real GFM pipe tables, including `colspan`/`rowspan` (grid-placed, not dropped), alignment, and pipes in cells. Tables GFM genuinely can't express fall back to sanitized HTML instead of silently corrupting. |
| Code | Fences with the language inferred from Prism, Shiki, highlight.js, and GitHub markup. Line-number gutters stripped. Fence length grows past embedded backticks. |
| Math | KaTeX and MathJax come back as their original LaTeX (`$…$` / `$$…$$`). MediaWiki math (both the modern hidden-MathML form and the legacy image form) extracts from the source annotations. Raw MathML gets a best-effort TeX translation. |
| URLs | Every link and image resolved to an absolute URL — including lazy-loaded `data-src` images and `srcset` (largest candidate wins). |
| Modern pages | Reads the **rendered** DOM, so single-page apps and logged-in pages work. Traverses Shadow DOM (open roots everywhere; closed roots too when the browser exposes them to extensions) with correct `<slot>` flattening. |
| Selections | A selection that starts mid-list keeps its numbering; selected table rows keep their header; code stays fenced. |

## The trust story

- **No network requests. Ever.** There is no `fetch`, no XHR, no beacon anywhere in the
  code — enforced mechanically by [`scripts/check-no-network.sh`](scripts/check-no-network.sh)
  in CI on every push.
- **No host permissions.** Downright cannot read any page in the background. It runs only
  on the tab you invoke it on, at the moment you invoke it (`activeTab`).
- **Full permission list**: `activeTab`, `scripting`, `clipboardWrite`, `storage`,
  `contextMenus`. That's it.
- Token estimates are computed locally (`≈ chars/4`, CJK-weighted). No tokenizer API calls.

## Install

**From a store** — Edge first, then Chrome and Firefox (links land here as each listing
goes live).

**From source (2 minutes):**

1. `bash scripts/build.sh` (or just use `src/` directly)
2. Chrome/Edge: open `chrome://extensions` (`edge://extensions`), enable *Developer mode*,
   *Load unpacked*, pick the `src/` folder (or `dist/chromium/`).
3. Firefox: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → pick
   `dist/firefox/manifest.json`.

## Development

Zero dependencies — no npm install, no bundler, no framework. Plain, readable source.

```bash
bash scripts/run-tests.sh        # conversion suite in headless Chrome (20 fixture pages)
node --test tests/unit.test.mjs  # pure-helper unit tests
bash scripts/check-no-network.sh # the no-network audit
bash scripts/build.sh            # store zips → dist/
node scripts/make-icons.js       # regenerate icons (procedural, no image tools)
bash scripts/make-screenshots.sh # regenerate store screenshots (headless Chrome)
```

The conversion suite (`tests/`) runs the real converter against fixture pages in a real
browser engine — including a Wikipedia-style page with infobox spans and math, a docs
page with tabbed code samples, and a Shadow-DOM dashboard — and diffs the output against
hand-written expected Markdown. `tests/harness.html` shows the same suite interactively
with side-by-side diffs.

### Architecture, briefly

```
background.js          thin: context menus, keyboard command, badge
popup/                 preview UI; injects and calls the converter itself
content/convert.js     the engine: DOM → GFM (tables, code, math, shadow DOM)
content/extract.js     Readability-style main-content extraction + metadata
content/clip.js        orchestrator: capture → convert → copy/save/toast
```

There are **no persistent content scripts and no message ports** — everything is
inject-on-demand and returns its result from the injection call. The classic MV3
"Could not establish connection. Receiving end does not exist" bug that plagues this
category cannot happen here, because nothing ever listens.

## License

[MIT](LICENSE). If you build something on this, a link back is appreciated.
