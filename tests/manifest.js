/* Downright test cases. Each entry: page under tests/pages/, expected
 * Markdown under tests/expected/ (defaults to <id>.md), the clip mode, and
 * optional settings overrides / selection setup. */
window.TEST_CASES = [
  { id: '01-basic-inline', page: '01-basic-inline.html', mode: 'full' },
  { id: '02-headings', page: '02-headings.html', mode: 'full' },
  { id: '03-lists', page: '03-lists.html', mode: 'full' },
  { id: '04-blockquote', page: '04-blockquote.html', mode: 'full' },
  { id: '05-code', page: '05-code.html', mode: 'full' },
  { id: '06-tables-basic', page: '06-tables-basic.html', mode: 'full' },
  { id: '07-tables-spans', page: '07-tables-spans.html', mode: 'full' },
  { id: '08-tables-nested', page: '08-tables-nested.html', mode: 'full' },
  { id: '09-media', page: '09-media.html', mode: 'full' },
  { id: '10-math', page: '10-math.html', mode: 'full' },
  { id: '11-shadow-dom', page: '11-shadow-dom.html', mode: 'full' },
  { id: '12-details-dl', page: '12-details-dl.html', mode: 'full' },
  {
    id: '13-extract-article', page: '13-extract-article.html', mode: 'article',
    settings: { frontmatter: true, fmClipped: false },
  },
  {
    id: '14a-selection-list', page: '14-selection.html', mode: 'selection',
    expected: '14a-selection-list.md',
    select: { type: 'text', start: '#li-b', startOffset: 0, end: '#li-c', endOffset: 5 },
  },
  {
    id: '14b-selection-table', page: '14-selection.html', mode: 'selection',
    expected: '14b-selection-table.md',
    select: { type: 'node', start: '#r2', end: '#r2' },
  },
  { id: '15-links-edge', page: '15-links-edge.html', mode: 'full' },
  { id: '16-whitespace', page: '16-whitespace.html', mode: 'full' },
  { id: '18-hidden-text', page: '18-hidden-text.html', mode: 'full' },
  {
    id: '17-wikipedia-polish', page: '17-wikipedia-polish.html', mode: 'article',
    settings: { titleHeading: true },
  },
  {
    id: 'composite-a-wikipedia', page: 'composite-a-wikipedia.html', mode: 'article',
    settings: { titleHeading: true },
  },
  {
    id: 'composite-b-docs', page: 'composite-b-docs.html', mode: 'article',
    settings: { titleHeading: true },
  },
  { id: 'composite-c-dashboard', page: 'composite-c-dashboard.html', mode: 'full' },
];
