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
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/track';

const PAGE_SIZE = 12;

type SortKey = 'featured' | 'az' | 'za' | 'short' | 'long';

// No `el` handle here — this is plain data for the useMemo to filter/sort.
// The corresponding DOM node lives in cardElsRef, indexed by `id`.
interface Entry {
  id: number;
  haystack: string;
  title: string;
  read: number;
  order: number;
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

    gridElRef.current = grid;

    const els = [...grid.querySelectorAll<HTMLElement>('.article-card')];
    cardElsRef.current = els;
    setEntries(
      els.map((el, i) => ({
        id: i,
        haystack: `${el.dataset.title ?? ''} ${el.dataset.blurb ?? ''}`.toLowerCase(),
        title: el.dataset.title ?? '',
        read: Number(el.dataset.read ?? '0'),
        order: i,
      })),
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
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'featured';
      searchInput?.focus();
    };
    clearBtn?.addEventListener('click', onClear);

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
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  // Single filter+sort pass, shared by the DOM sync effect and the
  // search-tracking effect below.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? entries.filter((e) => e.haystack.includes(q)) : entries.slice();
    return list.sort(SORTS[sort]);
  }, [entries, query, sort]);

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
      if (el) el.hidden = !shown.has(e.id);
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
