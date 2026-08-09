// Converts src/islands/articles-browser.ts to React, replacing it wholesale.
//
// Hard constraint: all 244 cards are server-rendered by articles.astro today,
// and the only thing the old script did to them was toggle `hidden` and
// reorder existing nodes. That's what keeps the article grid fully readable
// with JavaScript disabled. This component preserves that exactly — it
// renders no JSX of its own (see the `null` return), never re-renders a
// card, and never touches the search input / sort select / result count /
// empty state / load-more button's markup, all of which Astro still emits
// unchanged. It only ever reads those existing DOM nodes (once, on mount)
// and toggles `hidden` / reorders them, driven by React state instead of
// closure variables. That's also why it needs no props: the DOM already
// carries every card's title/blurb/read-time as data-* attributes, so
// reading it once is simpler than re-serializing the same data as a prop.
//
// client:load, not client:visible: the grid must be paged down to 12 cards
// immediately on load, before the user has any chance to see all 244
// unpaginated. Deferring hydration until this component scrolls into view
// (it renders nothing, so it never would) would leave the page unpaginated
// indefinitely.
//
// Fix while converting (Phase 10b): the original's onSearch ran the full
// filter+sort pass twice per keystroke batch — once inside render() to
// decide what's hidden, and again just to count results for track(). Here
// `matching` is a single useMemo; both the DOM sync effect and the
// search-tracking effect below read its `.length` from that one array.
//
// 10b-2: read-marking (O4). ff_articles_read is checked once on mount (the
// same pass that builds `entries`) and each card's article id is derived
// from its own `href` — no new data-* attribute was worth adding just for
// this. The DOM sync effect below toggles an `.is-read` class per card
// (same category of change as the `hidden` toggle it already does) and
// articles.astro's CSS shows the badge from that class. #unread-toggle is a
// button articles.astro now renders next to the sort select; this file only
// reads/toggles it, the same way it already treats every other control.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getArticlesRead } from '@/lib/storage';
import { track } from '@/lib/track';

const PAGE_SIZE = 12;

type SortKey = 'featured' | 'az' | 'za' | 'short' | 'long';

// No `el` handle here — this is plain data for the useMemo to filter/sort.
// The corresponding DOM node lives in cardElsRef, indexed by `id`.
interface Entry {
  id: number;
  articleId: string;
  haystack: string;
  title: string;
  read: number;
  order: number;
  // Whether this article id was already in ff_articles_read as of mount.
  // Named distinctly from `read` (reading-time minutes, unrelated field).
  wasRead: boolean;
}

const SORTS: Record<SortKey, (a: Entry, b: Entry) => number> = {
  featured: (a, b) => a.order - b.order,
  az: (a, b) => a.title.localeCompare(b.title),
  za: (a, b) => b.title.localeCompare(a.title),
  short: (a, b) => a.read - b.read || a.order - b.order,
  long: (a, b) => b.read - a.read || a.order - b.order,
};

function isSortKey(v: string): v is SortKey {
  return v in SORTS;
}

export function ArticlesBrowser(): null {
  const gridElRef = useRef<HTMLElement | null>(null);
  const cardElsRef = useRef<HTMLElement[]>([]);
  const justLoadedMoreRef = useRef(false);
  const searchTrackPendingRef = useRef(false);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('featured');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Wire up once: read the existing DOM (grid, cards, and every control
  // Astro already renders) and attach the handlers that used to live in
  // initArticlesBrowser(). Nothing here creates or removes a card node.
  useEffect(() => {
    const grid = document.getElementById('articles-grid');
    if (!grid) return;

    const searchInput = document.querySelector<HTMLInputElement>('#search-input');
    const sortSelect = document.querySelector<HTMLSelectElement>('#sort-select');
    const loadMoreBtn = document.querySelector<HTMLButtonElement>('#load-more');
    const clearBtn = document.querySelector<HTMLButtonElement>('#clear-filters');
    const unreadToggleBtn = document.querySelector<HTMLButtonElement>('#unread-toggle');

    gridElRef.current = grid;

    // The read affordance and unread filter both key off the article id, not
    // the card's DOM index — that id isn't in a data-* attribute, but every
    // card is `<a href="/articles/{id}">`, so it's read off the href instead
    // of adding a new attribute to cards that were already server-rendered.
    const readIds = new Set(getArticlesRead());
    const els = [...grid.querySelectorAll<HTMLElement>('.article-card')];
    cardElsRef.current = els;
    setEntries(
      els.map((el, i) => {
        const articleId = (el.getAttribute('href') ?? '').split('/').filter(Boolean).pop() ?? '';
        return {
          id: i,
          articleId,
          haystack: `${el.dataset.title ?? ''} ${el.dataset.blurb ?? ''}`.toLowerCase(),
          title: el.dataset.title ?? '',
          read: Number(el.dataset.read ?? '0'),
          order: i,
          wasRead: readIds.has(articleId),
        };
      }),
    );

    let debounceTimer: ReturnType<typeof setTimeout>;
    const onSearchInput = (e: Event): void => {
      const value = (e.target as HTMLInputElement).value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchTrackPendingRef.current = true;
        setQuery(value);
        setVisible(PAGE_SIZE);
      }, 200);
    };
    searchInput?.addEventListener('input', onSearchInput);

    const onSortChange = (): void => {
      const v = sortSelect?.value ?? 'featured';
      setSort(isSortKey(v) ? v : 'featured');
      setVisible(PAGE_SIZE);
    };
    sortSelect?.addEventListener('change', onSortChange);

    const onLoadMore = (): void => {
      justLoadedMoreRef.current = true;
      setVisible((v) => v + PAGE_SIZE);
    };
    loadMoreBtn?.addEventListener('click', onLoadMore);

    const onClear = (): void => {
      setQuery('');
      setSort('featured');
      setVisible(PAGE_SIZE);
      setUnreadOnly(false);
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'featured';
      if (unreadToggleBtn) {
        unreadToggleBtn.classList.remove('is-active');
        unreadToggleBtn.setAttribute('aria-pressed', 'false');
      }
      searchInput?.focus();
    };
    clearBtn?.addEventListener('click', onClear);

    const onUnreadToggle = (): void => {
      setUnreadOnly((prev) => {
        const next = !prev;
        unreadToggleBtn?.classList.toggle('is-active', next);
        unreadToggleBtn?.setAttribute('aria-pressed', String(next));
        return next;
      });
      setVisible(PAGE_SIZE);
    };
    unreadToggleBtn?.addEventListener('click', onUnreadToggle);

    // "/" jumps to search, matching the hint rendered next to the field.
    // Arrow keys move focus between currently visible cards. Both read live
    // refs/DOM rather than closed-over state, so this never goes stale even
    // though it's attached exactly once.
    const onKeydown = (e: KeyboardEvent): void => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);

      if (e.key === '/' && !typing && searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }
      if (typing) return;

      if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
        const cards = cardElsRef.current.filter((el) => !el.hidden);
        if (!cards.length) return;
        const current = cards.indexOf(document.activeElement as HTMLElement);
        const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const next = current === -1 ? 0 : Math.min(Math.max(current + delta, 0), cards.length - 1);
        e.preventDefault();
        cards[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKeydown);

    return () => {
      clearTimeout(debounceTimer);
      searchInput?.removeEventListener('input', onSearchInput);
      sortSelect?.removeEventListener('change', onSortChange);
      loadMoreBtn?.removeEventListener('click', onLoadMore);
      clearBtn?.removeEventListener('click', onClear);
      unreadToggleBtn?.removeEventListener('click', onUnreadToggle);
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  // Collapse-on-stick (spec §2.3): `.controls` is `position: sticky` (see
  // redesign.css). #controls-sentinel is a zero-height marker articles.astro
  // renders immediately above it. When the sentinel scrolls past the sticky
  // offset, `.controls` has started sticking, so flip data-stuck="true" for
  // the CSS collapse transition; remove it once the sentinel is back in
  // view. rootMargin mirrors `.controls`'s own `top` (--header-h + 8px),
  // read from computed style rather than hardcoded so this can't drift from
  // the CSS if --header-h ever changes again.
  useEffect(() => {
    const sentinel = document.getElementById('controls-sentinel');
    const controls = document.querySelector<HTMLElement>('.controls');
    if (!sentinel || !controls) return;

    const headerH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
    const offset = headerH + 8;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          controls.removeAttribute('data-stuck');
        } else {
          controls.setAttribute('data-stuck', 'true');
        }
      },
      { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  // Single filter+sort pass, shared by the DOM sync effect and the
  // search-tracking effect below.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? entries.filter((e) => e.haystack.includes(q)) : entries.slice();
    if (unreadOnly) list = list.filter((e) => !e.wasRead);
    return list.sort(SORTS[sort]);
  }, [entries, query, sort, unreadOnly]);

  // Reorder the existing card nodes into sorted order, toggle `hidden` for
  // the current page/filter, and update the count / empty-state /
  // load-more affordances. Guarded on entries.length so this does nothing
  // until the mount effect above has actually populated entries — otherwise
  // a one-tick empty `entries` would flash "0 results" / "No results".
  useEffect(() => {
    const grid = gridElRef.current;
    if (!grid || entries.length === 0) return;
    const els = cardElsRef.current;

    for (const e of matching) {
      const el = els[e.id];
      if (el) grid.appendChild(el);
    }

    const shown = new Set(matching.slice(0, visible).map((e) => e.id));
    for (const e of entries) {
      const el = els[e.id];
      if (!el) continue;
      el.hidden = !shown.has(e.id);
      el.classList.toggle('is-read', e.wasRead);
    }

    const resultCount = document.getElementById('result-count');
    if (resultCount) {
      resultCount.textContent = `${matching.length} ${matching.length === 1 ? 'result' : 'results'}`;
    }
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.hidden = matching.length > 0;
    const loadMoreBtn = document.querySelector<HTMLButtonElement>('#load-more');
    if (loadMoreBtn) loadMoreBtn.hidden = visible >= matching.length;

    if (justLoadedMoreRef.current) {
      justLoadedMoreRef.current = false;
      const focusEntry = matching[visible - PAGE_SIZE];
      if (focusEntry) els[focusEntry.id]?.focus();
    }
  }, [matching, visible, entries]);

  // Fires only when the debounced search handler actually set `query` —
  // never on mount, and never on a sort or clear-filters change (both also
  // set `query`/recompute `matching`, but the original never tracked those
  // either). Reads the same `matching` the DOM sync effect above just
  // computed — the fix for the double-computation described up top: no
  // second filter+sort pass just to get a count for track().
  useEffect(() => {
    if (!searchTrackPendingRef.current) return;
    searchTrackPendingRef.current = false;
    track('search_articles', { query, results: matching.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // keyed on `query` only; `matching` also changes on sort, which must not
    // re-fire this.
  }, [query]);

  return null;
}
