// Extracted, byte-for-byte, from src/islands/course-one.ts:185-262
// (slugify + mdToHtml + enhanceArticle) as part of Phase 10f.
//
// `mdToHtml` below is UNCHANGED from the source — same regex sequence, same
// order of operations, same output for the same input. This is what
// tests/unit/md-to-html.test.ts (Phase 1c) pins, and it now imports this
// real function instead of its own copy. Do not "improve" this function;
// Appendix C is deliberately a small, closed set of supported syntax.
//
// `enhanceArticle` (course-one.ts:240-262) is NOT ported as a second DOM
// pass. In the original, `mountEl.innerHTML = mdToHtml(text)` renders once,
// then `enhanceArticle(mountEl)` mutates that same live subtree afterwards
// (adds a `.lead` class to the first real paragraph, backfills heading ids,
// and prepends a `<nav class="article-toc">` when there are >=2 h2s). Doing
// that against a subtree React just rendered via dangerouslySetInnerHTML
// would be exactly the "second imperative pass over React-owned DOM" this
// whole rewrite exists to avoid — React has no idea the TOC nav or the
// `lead` class appeared, and the next render would stomp them right back
// out (or, worse, React and the browser would disagree about the DOM and
// diff incorrectly on the next update).
//
// `renderArticleHtml` below folds enhanceArticle's exact logic into the
// same html-string -> html-string transform mdToHtml already is. It runs
// `mdToHtml`'s output through a detached (never-attached, never-React-owned)
// <div>, applies the identical DOM mutations enhanceArticle used to apply to
// the live mount, then serializes the result back out as a string via
// `.innerHTML`. The browser's own HTML-parsing normalization (e.g. an
// engine auto-closing the outer <p> when a <h2>/<ul>/<div> appears inside
// it) happens identically here as it did on the live element, because it's
// driven by innerHTML assignment either way — only the *target* element
// changed, from a mounted node to a scratch one that's discarded the moment
// this function returns. React only ever sees the final string, exactly
// once, via dangerouslySetInnerHTML — one transform, one output.
//
// Callers (Module.tsx, per the CourseOne.tsx contract) should call
// `renderArticleHtml(md)`, not `mdToHtml(md)` directly, when rendering a
// course article body. `mdToHtml` stays exported on its own because the
// unit tests pin its raw, un-enhanced output.

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function mdToHtml(md: string): string {
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

// Faithful port of course-one.ts:240-262's DOM mutations, applied to a
// detached element instead of the live mount. See file header.
function enhanceArticleDom(mountEl: HTMLElement): void {
  const firstP = Array.from(mountEl.querySelectorAll<HTMLElement>('p')).find(
    (p) => (p.textContent ?? '').trim().length > 0 && !p.closest('.callout'),
  );
  if (firstP) firstP.classList.add('lead');

  const heads = Array.from(mountEl.querySelectorAll<HTMLElement>('h2, h3'));
  const items = heads.map((h) => {
    const id = h.id || slugify(h.textContent ?? '');
    h.id = id;
    return { id, text: (h.textContent ?? '').replace(/#\s*$/, '').trim(), level: h.tagName.toLowerCase() };
  });
  const showToc = items.filter((i) => i.level === 'h2').length >= 2;
  if (showToc) {
    const nav = document.createElement('nav');
    nav.className = 'article-toc';
    nav.setAttribute('aria-label', 'On this page');
    nav.innerHTML = `<ul>${items.map((i) => `<li class="toc-${i.level}"><a href="#${i.id}">${i.text}</a></li>`).join('')}</ul>`;
    mountEl.prepend(nav);
  }
}

// mdToHtml + enhanceArticle, composed into the single string -> string
// transform Module.tsx should call for course article bodies. `document`
// is guarded because this module has no import-time DOM access (I5); the
// guard only matters if something ever calls this outside a browser
// (it can't meaningfully enhance without one, so it degrades to plain
// mdToHtml output rather than throwing).
export function renderArticleHtml(md: string): string {
  const html = mdToHtml(md);
  if (typeof document === 'undefined') return html;
  const scratch = document.createElement('div');
  scratch.innerHTML = html;
  enhanceArticleDom(scratch);
  return scratch.innerHTML;
}
