# Firefox Add-ons (AMO) listing — paste-and-submit package

AMO's submission flow is the shortest of the three. Developer accounts are free.

## Upload

- Upload `dist/downright-1.0.0-firefox.zip` (built by `bash scripts/build.sh`).
- **Source code submission**: not required — the package ships plain, unminified
  source. If the reviewer asks anyway, point at the public GitHub repository.
- The manifest already declares `data_collection_permissions: { required: ["none"] }`,
  which fills AMO's data-collection disclosure ("This add-on collects no data").

## Listing fields

- **Name**: Downright — Copy Any Page as Markdown for AI
- **Add-on URL (slug)**: `downright`
- **Summary** (≤250 chars):
  > Copy any page as clean, correct Markdown in one keystroke — real tables, code
  > fences with languages, LaTeX math. Works on single-page apps and Shadow DOM. No
  > tracking, no network requests, ever. Free and open source.
- **Description**: the "Detailed description" from
  [store-listing-edge.md](store-listing-edge.md) verbatim.
- **Categories**: Productivity (and "Search Tools" or "Other" as secondary if offered).
- **Support email / site**: your email / the GitHub repo.
- **Privacy policy**: paste the contents of `PRIVACY.md` (AMO accepts inline text).
- **License**: MIT.
- **Tags**: markdown, clipper, copy as markdown, obsidian, notes, AI.

## Screenshots

The same four 1280×800 PNGs from `store-assets/` work on AMO.

## Version notes (first release)

> First release. One-keystroke page→Markdown with correct tables (including
> colspan/rowspan), code-fence language inference, KaTeX/MathJax→LaTeX, absolute URLs,
> and Shadow DOM support. No network access; no host permissions.
