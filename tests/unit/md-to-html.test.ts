import { describe, expect, it } from 'vitest';

// `mdToHtml` (and its `slugify` helper) live as unexported functions inside
// `src/islands/course-one.ts:182-235`. They are pure string transforms with
// zero DOM access, so per the Phase 1 plan (1c) they're pinned here via a
// byte-for-byte copy rather than a real import, since Phase 1 may not
// export anything from that file (the plan reserves the one production
// edit for src/lib/auth.ts). When course-one.ts is split up in Phase 10f
// and `mdToHtml` gets a real export, replace this copy with an import and
// these assertions should still pass unchanged.
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function mdToHtml(md: string): string {
  if (!md) return '';

  md = md.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_m, lang: string | undefined, code: string) =>
      `<pre><code class="lang-${lang || 'text'}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`,
  );

  md = md.replace(
    /^\s*\[!(TIP|NOTE|WARNING)]\s*(?:\**([^\n*]+)\**)?\s*\n([\s\S]*?)(?=\n{2,}|\n\[!|$)/gim,
    (_m, kind: string, title: string | undefined, body: string) => {
      const classByKind: Record<string, string> = { TIP: 'co-tip', NOTE: 'co-note', WARNING: 'co-warn' };
      const iconByKind: Record<string, string> = { TIP: '💡', NOTE: '📝', WARNING: '⚠️' };
      const head = title ? `<strong>${title.trim()}</strong>` : '';
      return `<div class="callout ${classByKind[kind] ?? 'co-note'}"><div class="co-ico" aria-hidden="true">${iconByKind[kind] ?? 'ℹ️'}</div><div>${head}${body.trim()}</div></div>`;
    },
  );

  md = md.replace(/^(>\s?.+)(\n(>\s?.+))*$/gm, (m) => `<blockquote>${m.replace(/^>\s?/gm, '').trim()}</blockquote>`);

  md = md.replace(/^\s*---\s*$/gm, '<hr/>');

  md = md
    .replace(/^###\s+(.*)$/gim, (_m, t: string) => {
      const id = slugify(t);
      return `<h3 id="${id}">${t}<a class="anchor" href="#${id}" aria-label="Link to section">#</a></h3>`;
    })
    .replace(/^##\s+(.*)$/gim, (_m, t: string) => {
      const id = slugify(t);
      return `<h2 id="${id}">${t}<a class="anchor" href="#${id}" aria-label="Link to section">#</a></h2>`;
    })
    .replace(/^#\s+(.*)$/gim, (_m, t: string) => `<h1>${t}</h1>`);

  md = md
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    .replace(/(?:^<li>.*<\/li>\n?)+/gm, (run) => `<ul>${run.trim()}</ul>`);

  md = md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  md = md.replace(/\n{2,}/g, '</p><p>').replace(/^\s*<p><\/p>/, '');
  return `<p>${md}</p>`;
}

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
