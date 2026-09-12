# Chrome Web Store listing — paste-and-submit package

Every field the Developer Dashboard asks for, in the order it asks. Three tabs gate
publication: **Store listing**, **Privacy practices**, **Distribution**.

## Store listing

- **Title** — prefilled from the package: `Downright — Copy Any Page as Markdown for AI`
  (44 of the manifest's 45-character limit; the dashboard shows it read-only)
- **Summary** — prefilled from the package (120/132):
  `Copy any page as clean Markdown in one keystroke — correct tables, code fences, and math. No tracking. No network. Ever.`
- **Category**: **Workflow & Planning** — where the clippers people compare us to
  (Evernote, Notion, Obsidian) sit, so we surface in their "related" rails. `Tools` is
  the fallback if the dropdown has changed.
- **Language**: English

**Description** (16,000-character field; this is ~2,000). Chrome has **no keyword
field** — the description is the only place search terms land, which is why "markdown
clipper", "web to markdown", and the app names are written into the prose.

```text
Press Alt+M and the page you're reading becomes clean, correct Markdown on your clipboard — ready to paste into ChatGPT, Claude, Copilot, Obsidian, Notion, or a doc.

Downright is a markdown clipper built around one idea: the Markdown must be RIGHT.

WHAT COMES OUT CORRECT

• Tables — real Markdown pipe tables, including merged cells (colspan/rowspan), alignment, and pipes inside cells. The thing most converters silently mangle.
• Code — fenced blocks that keep their language (Prism, Shiki, highlight.js, GitHub markup all recognized), with line-number gutters stripped.
• Math — KaTeX and MathJax equations come back as their original LaTeX, not garbled symbols. Wikipedia formulas extract perfectly.
• Links & images — every URL resolved to an absolute address, including lazy-loaded images. Clips work outside the page they came from.
• Modern sites — Downright reads the rendered page, so single-page apps, logged-in pages, and web components (Shadow DOM) all clip correctly.

THREE WAYS TO CLIP

• Alt+M (Option+M on Mac) — copy the article as Markdown. Select text first and the same keystroke clips just the selection, keeping list numbering and table headers.
• Right-click — copy the selection or page, or save the page as a .md file.
• Toolbar popup — preview the Markdown before you copy, switch between Article and Full-page capture, and see a token estimate for AI context windows.

You always find out what happened: every clip raises a toast with the token count, or the reason it couldn't run. Pages extensions aren't allowed to touch — browser settings, the extension gallery, the PDF viewer, local files without file access — say so by name instead of failing silently.

Optional YAML front matter (title, source URL, author, date) makes clips land in Obsidian and Notion ready to file.

PRIVATE BY CONSTRUCTION

• No network requests, ever — verified by an automated audit on every release.
• No host permissions — Downright cannot read any page until the moment you invoke it, and never in the background.
• No accounts, no analytics, no tracking. Free, and open source on GitHub so you can check all of the above.
• Text a page hides from you — off-screen, zero-opacity, or written in invisible Unicode — is dropped, not clipped. What you can read is what you get.

Source code: https://github.com/jayasankarmr/Downright
```

## Graphic assets

| Field | File | Notes |
| --- | --- | --- |
| Store icon 128×128 | `store-assets/store-icon-128.png` | Required. The mark at 96×96 inside a 128×128 canvas with transparent padding, per Chrome's icon guidelines — **not** the same file as the packaged `icons/icon-128.png`, which fills its canvas edge to edge. |
| Screenshots 1280×800 | `screenshot-1-hero.png`, `-2-tables.png`, `-3-fidelity.png`, `-4-private.png` | At least one required; upload all four, hero first — the first is the one that shows in search results. |
| Small promo tile 440×280 | `promo-tile-440x280.png` | Optional, but it's what renders on the store's category and "related" rails. `promo-tile-440x280-dark.png` is the alternate. |
| Marquee promo tile 1400×560 | — | Optional; only used if Google features the extension editorially. Skip for launch. |
| Promo video | — | Leave blank. |

All screenshots and tiles are 24-bit PNG with no alpha, as the store requires; the icon
keeps its alpha, which is correct for that field only. Regenerate every one of them with
`bash scripts/make-screenshots.sh`.

## Additional fields

- **Official URL**: leave as `None`. Selecting one requires verifying domain ownership in
  Google Search Console first, and nothing in the listing depends on it.
- **Homepage URL**: `https://github.com/jayasankarmr/Downright`
- **Support URL**: `https://github.com/jayasankarmr/Downright/issues`
- **Mature content**: No.
- **Item support**: **on** — this is what makes the support URL visible to users.

## Privacy practices tab (this is what gates review)

- **Single purpose description**:
  > Converts the current page or selection to Markdown on the user's clipboard or into
  > a local .md file.
- **Permission justifications** (one box each — an empty box blocks submission):
  - `activeTab` — grants one-time access to the page the user explicitly invokes the
    extension on; nothing runs before that.
  - `scripting` — injects the local converter into that page at invocation time to read
    its DOM and produce Markdown.
  - `clipboardWrite` — places the resulting Markdown on the clipboard.
  - `storage` — saves the user's formatting preferences (mode, front matter, filename).
  - `contextMenus` — provides the right-click "Copy selection/page as Markdown" items.
- **Remote code**: No, all code is packaged.
- **Data usage**: check **nothing** — the extension collects no user data. Settings held
  in `storage.sync` are the browser's own profile sync, not collection by us. Then
  certify all three disclosures (no sale, no unrelated transfer, no creditworthiness use).
- **Privacy policy URL**:
  `https://github.com/jayasankarmr/Downright/blob/main/PRIVACY.md`

### Test instructions

Shared only with the review team. There is no login, so **leave Username and Password
empty** — a placeholder like "N/A" reads as noise, and the fields are optional. Fill the
instructions box (500-character limit; this is 469) so a reviewer never has to guess how
to trigger the extension:

```text
No account, login, or setup required.

1. Open any article, e.g. https://en.wikipedia.org/wiki/Ant
2. Press Alt+M (Option+M on Mac). A toast confirms the copy. Paste anywhere to see the Markdown.
3. Select text first, then Alt+M: only the selection is clipped.
4. Right-click the page for the copy/save menu items.
5. Click the toolbar icon to preview the Markdown, switch Article/Full-page, or save a .md file.

If Alt+M is taken by another extension, use step 4 or 5.
```

The last line matters: `Alt+M` is only a *suggested* binding, and Chrome silently drops
it when another installed extension already claims it. A reviewer whose profile has that
conflict would otherwise conclude the extension does nothing.

## Distribution

- **Visibility**: Public. **Pricing**: Free. **Regions**: all.

## Package

- Upload `dist/downright-1.0.1-chromium.zip` (`bash scripts/build.sh` to refresh).

## Review notes

> All conversion is local. The extension contains zero network-capable API calls
> (mechanically audited in CI: scripts/check-no-network.sh) and requests no host
> permissions. Injection happens only on user gesture via activeTab. Public source:
> https://github.com/jayasankarmr/Downright
