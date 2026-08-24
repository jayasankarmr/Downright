# Edge Add-ons listing — paste-and-submit package

Everything below maps 1:1 onto the Partner Center submission form. Where a field has a
character limit, the text is already inside it.

## Availability & pricing

- **Markets**: all markets.
- **Visibility**: Public.
- **Pricing**: Free.

## Properties

- **Category**: Productivity
- **Privacy policy URL**: `https://github.com/jayasankarmr/Downright/blob/main/PRIVACY.md`
  (or your GitHub Pages URL once set up — any public URL to PRIVACY.md works)
- **Website**: the GitHub repository URL
- **Support contact**: your email or the repo's Issues URL
- **Mature content**: No

## Store listing (English)

**Display name**

> Downright — Copy Any Page as Markdown for AI

**Short description** (≤ 132 chars — this is the search snippet)

> Copy any page as clean Markdown in one keystroke — correct tables, code fences, and math. No tracking. No network. Ever.

**Detailed description**

> Press Alt+M and the page you're reading becomes clean, correct Markdown on your
> clipboard — ready to paste into ChatGPT, Claude, Copilot, Obsidian, Notion, or a doc.
>
> Downright is a markdown clipper built around one idea: the Markdown must be RIGHT.
>
> WHAT COMES OUT CORRECT
>
> • Tables — real Markdown pipe tables, including merged cells (colspan/rowspan),
>   alignment, and pipes inside cells. The thing most converters silently mangle.
> • Code — fenced blocks that keep their language (Prism, Shiki, highlight.js, GitHub
>   markup all recognized), with line-number gutters stripped.
> • Math — KaTeX and MathJax equations come back as their original LaTeX, not garbled
>   symbols. Wikipedia formulas extract perfectly.
> • Links & images — every URL resolved to an absolute address, including lazy-loaded
>   images. Clips work outside the page they came from.
> • Modern sites — Downright reads the rendered page, so single-page apps, logged-in
>   pages, and web components (Shadow DOM) all clip correctly.
>
> THREE WAYS TO CLIP
>
> • Alt+M (Option+M on Mac) — copy the article as Markdown. Select text first and the
>   same keystroke clips just the selection, keeping list numbering and table headers.
> • Right-click — copy the selection or page, or save the page as a .md file.
> • Toolbar popup — preview the Markdown before you copy, switch between Article and
>   Full-page capture, and see a token estimate for AI context windows.
>
> Optional YAML front matter (title, source URL, author, date) makes clips land in
> Obsidian and Notion ready to file.
>
> PRIVATE BY CONSTRUCTION
>
> • No network requests, ever — verified by an automated audit on every release.
> • No host permissions — Downright cannot read any page until the moment you invoke
>   it, and never in the background.
> • No accounts, no analytics, no tracking. Free, and open source on GitHub so you can
>   check all of the above.
> • Text a page hides from you — off-screen, zero-opacity, or written in invisible
>   Unicode — is dropped, not clipped. What you can read is what you get.

**Search terms** (Partner Center allows up to 7)

> markdown clipper; copy as markdown; markdown for AI; web to markdown; markdown converter; markdown for obsidian; save page as markdown

> [!NOTE]
> Deliberately **not** used as a search term: "obsidian clipper". Obsidian ships an
> official *Obsidian Web Clipper*, and bidding on another product's name as a store
> keyword is the standard trigger for a trademark complaint and a listing takedown.
> "markdown for obsidian" describes compatibility, which is fair use.

## Media

- **Store logo (300×300)**: `store-assets/logo-300.png`
- **Screenshots (1280×800)**, in this order:
  1. `store-assets/screenshot-1-hero.png`
  2. `store-assets/screenshot-2-tables.png`
  3. `store-assets/screenshot-3-fidelity.png`
  4. `store-assets/screenshot-4-private.png`

## Package

- Upload `dist/downright-1.0.0-chromium.zip` (run `bash scripts/build.sh` first).

## Certification notes (the "Notes for certification" box)

> Single purpose: converts the current page or selection to Markdown on the user's
> clipboard (or a local .md download). All conversion is local; the extension contains
> no network calls of any kind and requests no host permissions. Content scripts are
> injected only on user invocation via activeTab. Source code:
> https://github.com/jayasankarmr/Downright
