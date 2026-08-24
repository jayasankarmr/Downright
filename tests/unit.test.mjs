/* Downright — Node unit tests for the pure (DOM-free) helpers.
 * The full conversion suite runs in a real browser (scripts/run-tests.sh);
 * these cover the string-level building blocks.
 * Run: node --test tests/unit.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const convert = require('../src/content/convert.js');
const clip = require('../src/content/clip.js');
const blocked = require('../src/common/blocked.js');

test('escapeInlineText: emphasis-forming asterisks only', () => {
  assert.equal(convert.escapeInlineText('*bold*'), '\\*bold\\*');
  assert.equal(convert.escapeInlineText('2 * 3 = 6'), '2 * 3 = 6');
});

test('escapeInlineText: intra-word underscores untouched', () => {
  assert.equal(convert.escapeInlineText('snake_case'), 'snake_case');
  assert.equal(convert.escapeInlineText('_lead'), '\\_lead');
});

test('escapeInlineText: brackets and backticks always escaped', () => {
  assert.equal(convert.escapeInlineText('a [b] `c`'), 'a \\[b\\] \\`c\\`');
});

test('escapeInlineText: entity-like ampersands', () => {
  assert.equal(convert.escapeInlineText('&copy; but a & b'), '\\&copy; but a & b');
});

test('guardLineStart: list, heading, quote, table, break lookalikes', () => {
  assert.equal(convert.guardLineStart('- not a list'), '\\- not a list');
  assert.equal(convert.guardLineStart('1. not a list'), '1\\. not a list');
  assert.equal(convert.guardLineStart('# not a heading'), '\\# not a heading');
  assert.equal(convert.guardLineStart('> not a quote'), '\\> not a quote');
  assert.equal(convert.guardLineStart('---'), '\\---');
  assert.equal(convert.guardLineStart('| not a table'), '\\| not a table');
  assert.equal(convert.guardLineStart('normal text'), 'normal text');
  assert.equal(convert.guardLineStart('#hashtag stays'), '#hashtag stays');
});

test('normalizeLang: aliases and passthrough', () => {
  assert.equal(convert.normalizeLang('C++'), 'cpp');
  assert.equal(convert.normalizeLang('c#'), 'csharp');
  assert.equal(convert.normalizeLang('sh'), 'bash');
  assert.equal(convert.normalizeLang('plaintext'), '');
  assert.equal(convert.normalizeLang('python'), 'python');
});

test('pickFromSrcset: largest width descriptor wins', () => {
  assert.equal(convert.pickFromSrcset('/s.jpg 480w, /b.jpg 1200w'), '/b.jpg');
  assert.equal(convert.pickFromSrcset('/one.jpg 1x, /two.jpg 2x'), '/two.jpg');
  assert.equal(convert.pickFromSrcset(''), null);
});

test('cleanTex: strips the MediaWiki displaystyle wrapper', () => {
  assert.equal(convert.cleanTex('{\\displaystyle E=mc^{2}}'), 'E=mc^{2}');
  assert.equal(convert.cleanTex('  x^2  '), 'x^2');
  assert.equal(convert.cleanTex(''), null);
});

test('fenceFor: grows past embedded backtick runs', () => {
  assert.equal(convert.fenceFor('plain'), '```');
  assert.equal(convert.fenceFor('has ``` inside'), '````');
});

test('estimateTokens: rough chars/4 with CJK weighting', () => {
  assert.equal(clip.estimateTokens(''), 0);
  assert.equal(clip.estimateTokens('abcdefgh'), 2);
  assert.ok(clip.estimateTokens('日本語のテキスト') >= 7);
});

test('sanitizeFilename: strips path separators and control chars', () => {
  assert.equal(clip.sanitizeFilename('a/b\\c:d*e'), 'a-b-c-d-e');
  assert.equal(clip.sanitizeFilename('  .hidden.  '), 'hidden');
  assert.equal(clip.sanitizeFilename(''), 'clip');
});

test('sanitizeFilename: bidi overrides cannot spoof the download name', () => {
  assert.equal(clip.sanitizeFilename('report‮gnp.md'), 'reportgnp.md');
  assert.equal(clip.sanitizeFilename('⁦a⁩b'), 'ab');
});

test('sanitizeFilename: Windows reserved device names are defused', () => {
  assert.equal(clip.sanitizeFilename('CON'), 'CON-clip');
  assert.equal(clip.sanitizeFilename('com1'), 'com1-clip');
  assert.equal(clip.sanitizeFilename('lpt9'), 'lpt9-clip');
  assert.equal(clip.sanitizeFilename('console'), 'console'); // not reserved
});

test('cleanText: invisible carriers are stripped', () => {
  // Unicode Tag block — plain ASCII in codepoints nothing paints.
  assert.equal(convert.cleanText('keep\u{E0048}\u{E0049}this'), 'keepthis');
  assert.equal(convert.cleanText('a‍b⁠c⁤d'), 'abcd');
  assert.equal(convert.cleanText('start‮mid‬end'), 'startmidend');
  assert.equal(convert.cleanText('‎‏plain'), 'plain');
});

test('cleanText: visible text and the existing normalisations survive', () => {
  assert.equal(convert.cleanText('ordinary text'), 'ordinary text');
  assert.equal(convert.cleanText('a b'), 'a b');   // nbsp → space
  assert.equal(convert.cleanText('so­ft'), 'soft'); // soft hyphen
  assert.equal(convert.cleanText('emoji 👍 and 日本語'), 'emoji 👍 and 日本語');
});

test('buildFilename: template placeholders', () => {
  const name = clip.buildFilename('{title} ({domain})', {
    title: 'My Page', url: 'https://www.example.com/x',
  });
  assert.equal(name, 'My Page (example.com).md');
});

test('yamlValue: quotes and escapes', () => {
  assert.equal(clip.yamlValue('plain'), '"plain"');
  assert.equal(clip.yamlValue('say "hi"'), '"say \\"hi\\""');
});

test('wrapEmphasis: italic around bold keeps both', () => {
  assert.equal(convert.wrapEmphasis('**x**', '*'), '***x***');
  assert.equal(convert.wrapEmphasis('*x*', '**'), '***x***');
});

test('wrapEmphasis: redundant same-marker wrap is dropped', () => {
  assert.equal(convert.wrapEmphasis('*x*', '*'), '*x*');
  assert.equal(convert.wrapEmphasis('**x**', '**'), '**x**');
  assert.equal(convert.wrapEmphasis('***x***', '*'), '***x***');
  assert.equal(convert.wrapEmphasis('~~x~~', '~~'), '~~x~~');
});

test('wrapEmphasis: flush same-kind boundary skips the wrap', () => {
  assert.equal(convert.wrapEmphasis('*Shokaku* under attack', '*'), '*Shokaku* under attack');
  assert.equal(convert.wrapEmphasis('ends with *italic*', '*'), 'ends with *italic*');
  assert.equal(convert.wrapEmphasis('**bold** rest', '**'), '**bold** rest');
});

test('wrapEmphasis: different-kind flush boundary still wraps', () => {
  assert.equal(convert.wrapEmphasis('*a* rest', '**'), '***a* rest**');
  assert.equal(convert.wrapEmphasis('plain', '*'), '*plain*');
});

test('decorate: skipped when content already carries emphasis', () => {
  assert.equal(convert.decorate('*Shokaku* under attack', '*'), '*Shokaku* under attack');
  assert.equal(convert.decorate('A static test firing', '*'), '*A static test firing*');
  assert.equal(convert.decorate('has **bold** inside', '**'), 'has **bold** inside');
  assert.equal(convert.decorate('has *italic* inside', '**'), '**has *italic* inside**');
  assert.equal(convert.decorate('escaped 2\\*3', '*'), '*escaped 2\\*3*');
});

/* ------------------------------------------------------------------ *
 * Why a clip didn't happen
 * ------------------------------------------------------------------ */

test('classifyUrl: browser-reserved schemes', () => {
  assert.equal(blocked.classifyUrl('chrome://extensions'), 'browser-page');
  assert.equal(blocked.classifyUrl('edge://settings/privacy'), 'browser-page');
  assert.equal(blocked.classifyUrl('about:preferences'), 'browser-page');
  assert.equal(blocked.classifyUrl('devtools://devtools/bundled/inspector.html'), 'browser-page');
  assert.equal(blocked.classifyUrl('view-source:https://example.com/'), 'browser-page');
});

test('classifyUrl: extension pages and empty tabs', () => {
  assert.equal(blocked.classifyUrl('chrome-extension://abcd/popup.html'), 'extension-page');
  assert.equal(blocked.classifyUrl('moz-extension://abcd/popup.html'), 'extension-page');
  assert.equal(blocked.classifyUrl('about:blank'), 'blank-page');
  assert.equal(blocked.classifyUrl('about:blank#x'), 'blank-page');
});

test('classifyUrl: the add-on galleries', () => {
  assert.equal(blocked.classifyUrl('https://chromewebstore.google.com/detail/x'), 'web-store');
  assert.equal(blocked.classifyUrl('https://addons.mozilla.org/en-US/firefox/'), 'web-store');
  assert.equal(blocked.classifyUrl('https://chrome.google.com/webstore/detail/x'), 'web-store');
  assert.equal(blocked.classifyUrl('https://microsoftedge.microsoft.com/addons/detail/x'), 'web-store');
  // Same hosts, ordinary pages — not blocked.
  assert.equal(blocked.classifyUrl('https://chrome.google.com/'), null);
  assert.equal(blocked.classifyUrl('https://microsoftedge.microsoft.com/'), null);
});

test('classifyUrl: file URLs and PDFs', () => {
  assert.equal(blocked.classifyUrl('file:///Users/me/notes.html'), 'local-file');
  assert.equal(blocked.classifyUrl('https://example.com/paper.PDF'), 'pdf-viewer');
  // A ".pdf" in the query is not a PDF.
  assert.equal(blocked.classifyUrl('https://example.com/view?doc=paper.pdf'), null);
});

test('classifyUrl: ordinary and unreadable URLs stay unclassified', () => {
  assert.equal(blocked.classifyUrl('https://en.wikipedia.org/wiki/Markdown'), null);
  assert.equal(blocked.classifyUrl('http://localhost:8631/tests/harness.html'), null);
  assert.equal(blocked.classifyUrl(''), null);
  assert.equal(blocked.classifyUrl(undefined), null);
  assert.equal(blocked.classifyUrl('not a url at all'), null);
});

test('describe: every reason has a title and an actionable detail', () => {
  for (const code of Object.keys(blocked.REASONS)) {
    const info = blocked.describe(code);
    assert.equal(info.code, code);
    assert.ok(info.title.length > 0, code + ' has no title');
    assert.ok(info.detail.length > 20, code + ' has no detail');
  }
});

test('describe: an unknown code still says something', () => {
  const info = blocked.describe('who-knows');
  assert.equal(info.code, 'who-knows');
  assert.ok(info.title.length > 0);
});
