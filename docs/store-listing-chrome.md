# Chrome Web Store listing — paste-and-submit package

Fill the Developer Dashboard with the fields below. The Chrome dashboard has three tabs
that matter: **Store listing**, **Privacy**, and **Distribution**.

## Store listing

- **Title** (from manifest): Downright — Copy Any Page as Markdown for AI
- **Summary** (from manifest, ≤132 chars): Copy any page as clean Markdown in one
  keystroke — correct tables, code fences, and math. No tracking. No network. Ever.
- **Category**: Productivity → Tools
- **Language**: English

**Description** — use the "Detailed description" text from
[store-listing-edge.md](store-listing-edge.md) verbatim (same product, same story).

**Graphics**

- Icon 128×128: taken from the package automatically.
- Screenshots (1280×800): the four `store-assets/screenshot-*.png`, hero first.
- Small promo tile (440×280): `store-assets/promo-tile-440x280.png`.

## Privacy tab (the questionnaire that gates review)

- **Single purpose description**:
  > Converts the current page or selection to Markdown on the user's clipboard or into
  > a local .md file.
- **Permission justifications**:
  - `activeTab` — grants one-time access to the page the user explicitly invokes the
    extension on; nothing runs before that.
  - `scripting` — injects the local converter into that page at invocation time to read
    its DOM and produce Markdown.
  - `clipboardWrite` — places the resulting Markdown on the clipboard.
  - `storage` — saves the user's formatting preferences (mode, front matter, filename).
  - `contextMenus` — provides the right-click "Copy selection/page as Markdown" items.
- **Remote code**: No, all code is packaged.
- **Data usage**: check **nothing** — the extension collects no user data. Certify the
  three disclosures (no sale, no unrelated transfer, no creditworthiness use).

## Distribution

- **Visibility**: Public. **Pricing**: Free. **Regions**: all.

## Package

- Upload `dist/downright-1.0.0-chromium.zip`.

## Review notes

> All conversion is local. The extension contains zero network-capable API calls
> (mechanically audited in CI: scripts/check-no-network.sh) and requests no host
> permissions. Injection happens only on user gesture via activeTab. Public source:
> https://github.com/jayasankarmr/Downright
