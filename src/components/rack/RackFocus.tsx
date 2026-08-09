import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { RACK_ITEMS, type RackItem } from './rack-data';

/**
 * Rack-focus section — spec §6.3. A rack-focus scroll experience: courses →
 * articles → flashcards → practice, with a continuous focus position driving
 * blur/opacity/scale/color as the user scrolls, plus dwell plateaus so each
 * item sits sharp for a while before racking to the next. Verified headlessly
 * as a standalone prototype earlier in this session; this is the production
 * port into the real (window-scrolled) document.
 *
 * Three render modes:
 *  1. Rack (default, ≥900px, motion allowed) — the pinned scroll-focus grid.
 *  2. Reduced-motion — static tablist, nothing blurred/opacity-0, no pin.
 *  3. Narrow (<900px) — same static tablist; the pin/blur experience doesn't
 *     work on small screens.
 *
 * The lead (heading + intro) is INSIDE the pinned block. It used to sit
 * outside it, which meant the section's own heading scrolled away the instant
 * the lock began and the reader spent the whole sequence looking at four
 * unlabelled words. The earlier objection to pinning it — that the pin
 * overflowed on short viewports — is handled by PIN_H's `min()` below rather
 * than by evicting the heading.
 */

const NARROW_BREAKPOINT_PX = 900;

/**
 * Height of the block that stays on screen: the viewport under the fixed
 * header, exactly. A shorter pin (68vh before, and briefly 520px during this
 * pass) leaves the rest of the scroll track showing as empty page below the
 * panel for the whole locked sequence — the section reads as a small card
 * floating over a void. Filling the viewport means the only thing on screen
 * while the section is locked is the section.
 */
const PIN_H = 'calc(100vh - var(--header-h, 56px))';
/**
 * Scroll distance spent on each rack transition. Track length is
 * PIN_H + STEP*segments = 842 + 3*152 = 1298px against a 900px viewport:
 * 1.44 screens, down from 2.15.
 *
 * Two things made the old one feel far longer than its 2.15 screens. It was
 * genuinely taller, and it wasted its own tail: progress was divided by
 * (trackHeight - viewportHeight) while the pinned block was only 68vh, so
 * focus arrived at the last item ~290px before the track released and the
 * remainder was dead scroll with nothing moving. useTrackProgress now
 * measures the pinned block itself, so every pixel of this track advances
 * the focus.
 */
const STEP = `calc(${PIN_H} * 0.18)`;
const DEFAULT_HEADER_H_PX = 56; // matches --header-h in redesign.css; re-read live below.
const NAME_BLUR_CAP_PX = 3.4;
const PANEL_BLUR_CAP_PX = 5;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Segmented ease with dwell plateaus, within one unit interval's fractional
 * position `t` (0..1). Holds at 0 through t<=0.30 (dwell on the item this
 * segment starts from), holds at 1 from t>=0.80 (dwell on the item it's
 * about to land on), and cubic-eases between — roughly half the segment is
 * travel, half is settle, so focus is never mid-transition for long.
 */
function dwellEase(t: number): number {
  if (t <= 0.3) return 0;
  if (t >= 0.8) return 1;
  const u = (t - 0.3) / 0.5;
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
}

/** Maps scroll progress p∈[0,1] to a continuous focus position f∈[0, segments]. */
function focusFromProgress(p: number, segments: number): number {
  if (segments <= 0) return 0;
  const scaled = clamp01(p) * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - i;
  return i + dwellEase(t);
}

/**
 * Inverse-ish: a scroll progress value that lands focus robustly inside item
 * i's dwell plateau, for click-to-jump. Nudged slightly off the segment
 * boundary (rather than sitting exactly on it) so it's still inside the
 * plateau under real-world floating point / pixel rounding.
 */
function progressForItem(i: number, segments: number): number {
  if (segments <= 0) return 0;
  if (i <= 0) return 0;
  if (i >= segments) return 1;
  return (i + 0.12) / segments;
}

function readHeaderHeightPx(): number {
  if (typeof window === 'undefined') return DEFAULT_HEADER_H_PX;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-h');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : DEFAULT_HEADER_H_PX;
}

/**
 * Scroll-driven progress for the pinned track, computed from
 * `getBoundingClientRect` each frame (rAF-throttled) rather than cached
 * absolute offsets, so it stays correct across resizes/layout shifts —
 * same approach as Hero.tsx's `useHeroScrollProgress`.
 *
 * progress = clamp((scrolledIntoTrack) / (trackHeight - pinnedHeight), 0, 1)
 * where scrolledIntoTrack = headerHeight - rect.top (0 right as the track's
 * top clears the fixed nav, growing as the user scrolls further into it).
 *
 * The denominator is the distance the sticky block can actually travel inside
 * the track — trackHeight minus the sticky block's own height — not
 * trackHeight minus the viewport. Those are the same number only if the
 * pinned block fills the viewport, which it never did; using the viewport
 * made progress saturate before the track ended, leaving dead scroll at the
 * bottom of the section with focus already parked on the last item.
 */
function useTrackProgress(
  trackRef: React.RefObject<HTMLDivElement | null>,
  pinRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const el = trackRef.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const pinH = pinRef.current?.offsetHeight ?? window.innerHeight;
      const headerH = readHeaderHeightPx();
      const scrolledIntoTrack = headerH - rect.top;
      const denom = Math.max(1, rect.height - pinH);
      setProgress(clamp01(scrolledIntoTrack / denom));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, trackRef, pinRef]);

  return progress;
}

/** True while `ref`'s element is anywhere near the viewport — gates the scroll listener and will-change. */
function useNearViewport(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setNear(false);
      return;
    }
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setNear(entry.isIntersecting);
      },
      { rootMargin: '600px 0px 600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, ref]);

  return near;
}

function mixColor(accent: string, focusedAmount: number): string {
  const pct = Math.round(clamp01(focusedAmount) * 100);
  return `color-mix(in oklab, ${accent} ${pct}%, var(--muted-foreground, #8a8f98))`;
}

/**
 * Panel head: the two-part stat + title that sits above each panel's
 * description (spec §6.5 S3/S4). `RACK_ITEMS` has no CSS file of its own —
 * this section is inline Tailwind throughout — so there is no `.rk-phead`
 * class to retarget; this is that container's real equivalent. The stat's
 * two halves are discrete spans joined by a separator span carrying
 * `margin: 0 .5em` (S3), replacing what was a single letter-spaced string.
 * The border-bottom is the "rule under the panel head" S4 describes;
 * `paddingTop`/`paddingBottom` are its corrected values (14px bottom, 2px
 * top) rather than the prototype's too-tight 11px/0.
 */
function PanelHead({
  item,
  statColor,
  size = 'lg',
}: {
  item: RackItem;
  statColor: string;
  size?: 'lg' | 'sm';
}) {
  return (
    <div
      className="flex flex-col gap-2 border-b border-border"
      style={{ paddingTop: '2px', paddingBottom: '14px' }}
    >
      <span
        className={cn(
          'font-medium uppercase tracking-wide [font-family:var(--mono-face)]',
          size === 'lg' ? 'text-[.95rem]' : 'text-[.95rem] text-muted-foreground',
        )}
        style={size === 'lg' ? { color: statColor } : undefined}
      >
        {item.statPrimary}
        <span aria-hidden="true" style={{ margin: '0 .5em' }}>
          ·
        </span>
        {item.statSecondary}
      </span>
      <h3
        className={cn(
          'font-semibold text-foreground [font-family:var(--display-face)]',
          size === 'lg' ? 'text-[2.25rem]' : 'text-2xl',
        )}
      >
        {item.title}
      </h3>
    </div>
  );
}

interface PanelProps {
  item: RackItem;
  /** 0 = fully resolved/focused, 1 = fully defocused (mid cross-rack). */
  d: number;
  /** true while this panel is the one gaining focus (resolves from scale .97), false while losing it (scales up toward 1.03). */
  incoming: boolean;
}

function RackPanel({ item, d, incoming }: PanelProps) {
  const blur = d * PANEL_BLUR_CAP_PX;
  const opacity = 1 - d;
  const scale = incoming ? 0.97 + (1 - d) * 0.03 : 1 + d * 0.03;
  const style: React.CSSProperties =
    d <= 0
      ? {} // fully resolved: no live filter, static end-state
      : {
          filter: `blur(${blur}px)`,
          opacity,
          transform: `scale(${scale})`,
        };

  return (
    <div
      data-rack-panel={item.id}
      className="absolute inset-0 flex flex-col justify-center gap-4 rounded-lg border border-border bg-card p-6 sm:p-7"
      style={style}
      aria-hidden={d >= 1 ? true : undefined}
    >
      <PanelHead item={item} statColor={mixColor(item.accent, 1 - d)} />
      <p className="max-w-[40ch] text-lg text-muted-foreground sm:text-[1.3125rem]">
        {item.description}
      </p>
      <a
        href={item.href}
        className="mt-1 inline-flex items-center gap-1 text-[1.125rem] font-medium text-primary underline-offset-4 hover:underline"
      >
        Explore {item.title}
      </a>
    </div>
  );
}

/** The section's own heading and standfirst. Rendered inside the pinned block
 *  in rack mode and above the tablist in the fallback, so it is present in
 *  both and never scrolls out from under the thing it names. */
function RackLead() {
  return (
    <div className="pb-6">
      <h2
        id="rack-heading"
        className="text-[clamp(2.25rem,3.6vw,3.25rem)] font-semibold leading-[1.06] text-foreground [font-family:var(--display-face)]"
      >
        One skill. Four places to build it.
      </h2>
      <p className="mt-3.5 max-w-[56ch] text-lg text-muted-foreground sm:text-[1.3125rem]">
        Same core knowledge, four different ways to build it — read it, drill it, test it, or work
        through it step by step.
      </p>
    </div>
  );
}

/** The always-mounted, pinned rack experience: 4-name list + up to 2 cross-fading panels + a progress rail. */
function RackTrack({ items }: { items: readonly RackItem[] }) {
  const segments = items.length - 1;
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const nameRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const near = useNearViewport(trackRef, true);
  const progress = useTrackProgress(trackRef, pinRef, near);
  const focus = focusFromProgress(progress, segments);

  const lowIndex = Math.max(0, Math.min(items.length - 1, Math.floor(focus)));
  const highIndex = Math.min(items.length - 1, lowIndex + 1);
  const crossFrac = clamp01(focus - lowIndex);

  const scrollToItem = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const headerH = readHeaderHeightPx();
      // Document-relative top of the track is scroll-position-invariant:
      // (current scrollY + current rect.top) is the same value no matter
      // when it's measured, so this works from any scroll position.
      const pinStartDoc = window.scrollY + el.getBoundingClientRect().top - headerH;
      // Same denominator as useTrackProgress — the sticky block's travel, not
      // the viewport's. They have to agree or click-to-jump lands off-plateau.
      const pinH = pinRef.current?.offsetHeight ?? window.innerHeight;
      const denom = Math.max(1, el.offsetHeight - pinH);
      const p = progressForItem(i, segments);
      const targetY = pinStartDoc + p * denom;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      nameRefs.current[i]?.focus();
    },
    [segments],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = items.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      scrollToItem((index + 1) % count);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollToItem((index - 1 + count) % count);
    }
  }

  return (
    <div
      ref={trackRef}
      data-rack-track=""
      className="relative"
      style={{ height: `calc(${PIN_H} + ${STEP} * ${segments})` }}
    >
      <div
        ref={pinRef}
        className="sticky flex flex-col overflow-hidden"
        style={{
          top: 'var(--header-h, 56px)',
          height: PIN_H,
          // The heading used to lock flush against the navbar, with the two
          // rules touching. This is the air between them, and it's the reason
          // PIN_H is the full viewport rather than something content-sized:
          // there's room to give.
          paddingTop: 'clamp(40px, 5vh, 64px)',
          willChange: near ? 'contents' : undefined,
        }}
      >
        {/* Inside the pin, so the section keeps its own name for the whole
            locked sequence instead of handing the reader four bare words. */}
        <RackLead />

        {/* 980px, not the container's 1200: at full width the names and the
            panel sat at opposite ends of the screen and stopped reading as
            one object. `items-center` centres the row in whatever the pin has
            left under the lead, so the group sits optically in the frame
            rather than hanging off the heading. */}
        <div className="flex min-h-0 max-w-[980px] flex-1 items-center gap-8">
        {/* Barrel scale: hairline + one tick per item, fill tracks focus. */}
        <div className="relative hidden w-2 flex-shrink-0 self-stretch sm:block" aria-hidden="true">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
          <div
            className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-primary transition-[height]"
            style={{ height: `${(focus / Math.max(1, segments)) * 100}%` }}
          />
          {items.map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
              style={{ top: `${(i / Math.max(1, segments)) * 100}%` }}
            />
          ))}
        </div>

        <div
          role="group"
          aria-label="Fynoptic — Courses, Articles, Flashcards, Practice"
          className="flex min-w-0 flex-none flex-col justify-center gap-3"
        >
          {items.map((item, i) => {
            const d = Math.min(1, Math.abs(focus - i));
            const blur = d * NAME_BLUR_CAP_PX;
            const opacity = 1 - d * 0.5;
            const scale = 1 - d * 0.05;
            return (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  nameRefs.current[i] = el;
                }}
                data-rack-name={item.id}
                onClick={() => scrollToItem(i)}
                onKeyDown={(event) => handleKeyDown(event, i)}
                className="w-fit rounded-md px-1 py-1 text-left transition-[filter] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{
                  filter: `blur(${blur}px)`,
                  opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: 'left center',
                  color: mixColor(item.accent, 1 - d),
                }}
              >
                <span className="text-[3.25rem] font-semibold leading-[1.05] [font-family:var(--display-face)] lg:text-[3.875rem]">
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Fixed panel height rather than `inset-0` against a stretched
            column: the panels cross-fade on top of each other, so the box has
            to be a stable size, and sizing it to the tallest panel's content
            is what stops it reading as a mostly-empty card. */}
        <div className="relative min-w-0 flex-1 self-center" style={{ height: 'min(460px, 100%)' }}>
          {/* At most 2 panels mounted at once: the one losing focus and the
              one gaining it. While dwelling (crossFrac === 0) only one panel
              exists at all — no live filter recompute for anything else. */}
          {items[lowIndex] && (
            <RackPanel
              key={items[lowIndex].id}
              item={items[lowIndex]}
              d={crossFrac}
              incoming={false}
            />
          )}
          {crossFrac > 0 && highIndex !== lowIndex && items[highIndex] && (
            <RackPanel
              key={items[highIndex].id}
              item={items[highIndex]}
              d={1 - crossFrac}
              incoming={true}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

/** Static tablist fallback for reduced-motion and narrow (<900px) viewports — nothing blurred, nothing at opacity 0, no scroll pinning. */
function RackTabs({ items }: { items: readonly RackItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = items[activeIndex] ?? items[0];

  function select(index: number) {
    setActiveIndex(index);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = items.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      select((index + 1) % count);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      select((index - 1 + count) % count);
    }
  }

  if (!active) return null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Fynoptic — Courses, Articles, Flashcards, Practice"
        className="flex flex-wrap gap-2"
      >
        {items.map((item, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`rack-tab-${item.id}`}
              aria-selected={isActive}
              aria-controls="rack-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(event) => handleKeyDown(event, i)}
              className={cn(
                'rounded-md px-4 py-2 text-base font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {item.title}
            </button>
          );
        })}
      </div>

      <div
        id="rack-tabpanel"
        role="tabpanel"
        aria-labelledby={`rack-tab-${active.id}`}
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6"
      >
        <PanelHead item={active} statColor="var(--muted-foreground)" size="sm" />
        <p className="text-base text-muted-foreground sm:text-lg">{active.description}</p>
        <a
          href={active.href}
          className="mt-1 inline-flex items-center gap-1 text-base font-medium text-primary underline-offset-4 hover:underline"
        >
          Explore {active.title}
        </a>
      </div>
    </div>
  );
}

export function RackFocus() {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // SSR (and the first client render, pre-effect) always renders the static
  // tablist — the most capable no-JS/no-measurement-yet baseline — then
  // upgrades to the pinned rack experience post-mount once width and motion
  // preference are both known to allow it. Same "render safe default first,
  // then upgrade" shape as Hero.tsx/RotatingWord.tsx use to avoid hydration
  // mismatches (matchMedia doesn't exist during SSR).
  const useRack = mounted && !prefersReducedMotion && !isNarrow;

  const items = useMemo(() => RACK_ITEMS, []);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="rack-heading">
      {/* The lead lives inside RackTrack's sticky block in rack mode (so it
          stays put for the whole locked sequence) and above the tablist in the
          fallback — exactly one of the two renders it, so `#rack-heading` is
          never duplicated for the `aria-labelledby` above. */}
      {useRack ? (
        <RackTrack items={items} />
      ) : (
        <>
          <RackLead />
          <RackTabs items={items} />
        </>
      )}
    </section>
  );
}

export default RackFocus;
