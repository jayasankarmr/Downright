/* Downright — shared default settings.
 * Loaded by the background worker, popup, options page, and injected with the
 * content scripts so every surface agrees on defaults. */
(function (root) {
  'use strict';

  const DOWNRIGHT_DEFAULTS = Object.freeze({
    // 'article' extracts the main content; 'full' converts the whole page.
    mode: 'article',
    // YAML front matter block at the top of every clip.
    frontmatter: true,
    fmTitle: true,
    fmSource: true,
    fmAuthor: true,
    fmPublished: true,
    fmDescription: false,
    fmClipped: true,
    // When front matter is off, prepend "# Title" instead (unless the page
    // content already starts with the same heading).
    titleHeading: true,
    // Bullet marker for unordered lists.
    bullet: '-',
    // 'keep' emits ![alt](url); 'skip' emits the alt text only.
    images: 'keep',
    // Show the in-page confirmation toast after keyboard/context-menu clips.
    toast: true,
    // Download filename. Placeholders: {title} {date} {domain}
    filenameTemplate: '{title}',
  });

  root.DOWNRIGHT_DEFAULTS = DOWNRIGHT_DEFAULTS;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOWNRIGHT_DEFAULTS };
  }
})(globalThis);
