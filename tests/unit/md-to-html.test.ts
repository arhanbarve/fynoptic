import { describe, expect, it } from 'vitest';

// Phase 10f: `mdToHtml` now has a real export — src/lib/md-to-html.ts,
// extracted byte-for-byte from src/islands/course-one.ts:193-238 (the
// Phase 1c pinned copy previously lived here instead, since course-one.ts
// exported nothing but initCourseOne()). Every assertion below is
// unchanged from that copy; only the import changed.
import { mdToHtml } from '../../src/lib/md-to-html';

describe('mdToHtml — supported syntax', () => {
  it('fenced code blocks keep a language class and escape < / >', () => {
    expect(mdToHtml('```js\nconst x = 1 < 2;\n```')).toBe(
      '<p><pre><code class="lang-js">const x = 1 &lt; 2;\n</code></pre></p>',
    );
  });

  it('fenced code with no language falls back to lang-text', () => {
    expect(mdToHtml('```\nplain\n```')).toBe('<p><pre><code class="lang-text">plain\n</code></pre></p>');
  });

  it.each(['TIP', 'NOTE', 'WARNING'] as const)('%s callout with a bold title', (kind) => {
    const iconByKind = { TIP: '💡', NOTE: '📝', WARNING: '⚠️' };
    const classByKind = { TIP: 'co-tip', NOTE: 'co-note', WARNING: 'co-warn' };
    expect(mdToHtml(`[!${kind}] **Heads up**\nBody text.`)).toBe(
      `<p><div class="callout ${classByKind[kind]}"><div class="co-ico" aria-hidden="true">${iconByKind[kind]}</div><div><strong>Heads up</strong>Body text.</div></div></p>`,
    );
  });

  it('callout title is optional', () => {
    expect(mdToHtml('[!NOTE]\nJust a note.')).toBe(
      '<p><div class="callout co-note"><div class="co-ico" aria-hidden="true">📝</div><div>Just a note.</div></div></p>',
    );
  });

  it('blockquotes join consecutive > lines and strip the marker', () => {
    expect(mdToHtml('> line one\n> line two')).toBe('<p><blockquote>line one\nline two</blockquote></p>');
  });

  it('--- becomes <hr/> and swallows its surrounding blank lines', () => {
    // Real quirk: the hr regex's \s* eats the blank lines around it, so this
    // does NOT split into three <p> blocks the way plain double-newline
    // paragraphs would.
    expect(mdToHtml('above\n\n---\n\nbelow')).toBe('<p>above\n<hr/>\nbelow</p>');
  });

  it('h1 gets no id/anchor; h2 and h3 get a slug id and anchor link', () => {
    expect(mdToHtml('# Title')).toBe('<p><h1>Title</h1></p>');
    expect(mdToHtml('## Section One')).toBe(
      '<p><h2 id="section-one">Section One<a class="anchor" href="#section-one" aria-label="Link to section">#</a></h2></p>',
    );
    expect(mdToHtml('### Sub Section')).toBe(
      '<p><h3 id="sub-section">Sub Section<a class="anchor" href="#sub-section" aria-label="Link to section">#</a></h3></p>',
    );
  });

  it('heading slugs strip punctuation the same way slugify does elsewhere', () => {
    expect(mdToHtml("## Rock & Roll's Café")).toBe(
      '<p><h2 id="rock-rolls-caf">Rock & Roll\'s Café<a class="anchor" href="#rock-rolls-caf" aria-label="Link to section">#</a></h2></p>',
    );
  });

  it('- and * both introduce unordered list items', () => {
    expect(mdToHtml('- one\n- two\n- three')).toBe('<p><ul><li>one</li>\n<li>two</li>\n<li>three</li></ul></p>');
    expect(mdToHtml('* one\n* two')).toBe('<p><ul><li>one</li>\n<li>two</li></ul></p>');
  });

  it('bold, italic and inline code', () => {
    expect(mdToHtml('**bold** and *italic* and `code`')).toBe(
      '<p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>',
    );
  });

  it('blank lines split paragraphs', () => {
    expect(mdToHtml('first para\n\nsecond para')).toBe('<p>first para</p><p>second para</p>');
  });
});

describe('mdToHtml — unsupported syntax is left as literal text', () => {
  it('does not turn markdown links into <a>', () => {
    expect(mdToHtml('[text](https://example.com)')).toBe('<p>[text](https://example.com)</p>');
  });

  it('does not turn markdown images into <img>', () => {
    expect(mdToHtml('![alt](https://example.com/x.png)')).toBe('<p>![alt](https://example.com/x.png)</p>');
  });

  it('does not render tables', () => {
    expect(mdToHtml('| a | b |\n| - | - |\n| 1 | 2 |')).toBe('<p>| a | b |\n| - | - |\n| 1 | 2 |</p>');
  });

  it('does not render ordered lists', () => {
    expect(mdToHtml('1. one\n2. two')).toBe('<p>1. one\n2. two</p>');
  });

  it('does not support h4 or deeper', () => {
    expect(mdToHtml('#### Too deep')).toBe('<p>#### Too deep</p>');
  });

  it('does not support strikethrough', () => {
    expect(mdToHtml('~~gone~~')).toBe('<p>~~gone~~</p>');
  });

  it('does not support footnotes', () => {
    expect(mdToHtml('text[^1]\n\n[^1]: note')).toBe('<p>text[^1]</p><p>[^1]: note</p>');
  });
});
