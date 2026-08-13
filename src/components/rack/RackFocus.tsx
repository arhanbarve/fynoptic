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
 * The rack needs vertical room, not just horizontal. The pinned block is
 * the viewport under the header, and it has to hold the section heading,
 * four 62px names and the panel. Measured, the four names' last baseline
 * falls 18px below the pin on a 600px-tall window and clears it with room
 * to spare at 700 — so under 700 the pin cannot show its own content and
 * `overflow: hidden` shears the bottom off "Practice" and the card. A
 * pinned scroll sequence in 540px of usable height is a bad experience
 * even when it does fit, so short windows take the same static tablist
 * that narrow ones do.
 */
const SHORT_BREAKPOINT_PX = 700;

/**
 * Height of the block that stays on screen. Two constraints, and it has to
 * satisfy both:
 *
 *  - It can never exceed the viewport under the fixed header, or the pinned
 *    block doesn't fit on screen and the bottom of it is cut off.
 *  - It must not exceed what the content inside it actually needs. Pinning
 *    the *full* viewport height (what this was) means that on any tall
 *    display the block is far bigger than the lead + names + panel inside
 *    it, and `items-center` splits the difference into two equal bands of
 *    nothing. Measured at 1440x1345 that was ~580px of dead space, and the
 *    same slack shows up again as a ~500px void between the last panel and
 *    the footer once the track releases (the pin is parked at the track's
 *    bottom with its content still centred inside it).
 *
 * 760px is the content's real ceiling: RackLead (~200px) + the 460px panel
 * + the 40-64px of air above the lead. `min()` keeps the viewport clamp for
 * short windows.
 */
const PIN_H = 'min(calc(100vh - var(--header-h, 56px)), 760px)';
/**
 * Scroll distance spent on each rack transition. Track length is
 * PIN_H + STEP*segments = 760 + 3*243 = 1489px. Roughly the same total
 * scroll cost as the old 1982px track, except none of it is now spent on
 * dead space: every pixel advances the focus.
 *
 * 0.32 rather than the old 0.18: with PIN_H capped the absolute step would
 * otherwise have shrunk with it, and `dwellEase` only spends half a segment
 * travelling — 0.18 * 760 would have racked a whole item in 68px of scroll,
 * which reads as a snap rather than a rack.
 */
const STEP = `calc(${PIN_H} * 0.32)`;
const DEFAULT_HEADER_H_PX = 56; // matches --header-h in redesign.css; re-read live below.
/** 3.4px smeared the defocused names into unreadable ghosts rather than reading as depth-of-field. */
const NAME_BLUR_CAP_PX = 2.4;
const PANEL_BLUR_CAP_PX = 4;

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
  /** 0 = fully resolved/focused, 1 = fully defocused (mid rack). */
  d: number;
}

/**
 * The panel's *content*. The card shell around it (border, ground, radius)
 * is a separate, permanently mounted box — see RackTrack.
 *
 * This used to be the whole card, and two of them were mounted at once and
 * cross-dissolved. That produced the section's worst artefact: at the tails
 * of a transition the arriving panel sat at ~5% opacity under 4.75px of
 * blur, directly on top of the departing one, so "Articles" rendered as
 * "Articles" with a smeared "Flashcards" bleeding through it. It read as a
 * rendering fault, not a transition. Only one panel is mounted now — it
 * racks out of focus, the content swaps at the midpoint, and it racks back
 * in — so there is never a frame with two texts stacked on each other, and
 * the card outline never double-draws or wobbles between two scales.
 */
function RackPanel({ item, d }: PanelProps) {
  const style: React.CSSProperties =
    d <= 0
      ? {} // fully resolved: no live filter, static end-state
      : {
          filter: `blur(${d * PANEL_BLUR_CAP_PX}px)`,
          opacity: 1 - d,
          transform: `scale(${1 - d * 0.02})`,
        };

  return (
    <div
      data-rack-panel={item.id}
      className="flex flex-col justify-center gap-4"
      style={style}
    >
      <PanelHead item={item} statColor={mixColor(item.accent, 1 - d)} />
      <p className="max-w-[40ch] text-lg text-muted-foreground sm:text-[1.3125rem]">
        {item.description}
      </p>
      <a
        href={item.href}
        className="mt-1 inline-flex w-fit items-center gap-1 text-[1.125rem] font-medium text-primary underline-offset-4 hover:underline"
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

  // One panel, racked out and back in, rather than two cross-dissolving —
  // see RackPanel. The swap happens at the midpoint of the travel, where
  // the content is fully defocused and nothing legible is on screen to
  // pop. `panelD` runs 0 -> 1 -> 0 across the segment.
  const pastMidpoint = crossFrac >= 0.5;
  const panelIndex = pastMidpoint ? highIndex : lowIndex;
  const panelD = pastMidpoint ? (1 - crossFrac) / 0.5 : crossFrac / 0.5;
  const panelItem = items[panelIndex];

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

        {/* Full container width, not the 980px cap this used to carry. The
            cap was meant to stop the names and the panel drifting to
            opposite ends of the screen, but with the panel column allowed to
            grow (`flex-1`) it did that by leaving a dead ~300px gutter to the
            right of the card instead — the section's heading ran to the
            container's right edge and the content under it stopped ~25%
            short of it. Capping the *panel* (max-w below) does the same job
            without breaking the section's own rail. */}
        <div className="flex min-h-0 flex-1 items-center gap-8 lg:gap-12">
        <div
          role="group"
          aria-label="Fynoptic — Courses, Articles, Flashcards, Practice"
          className="relative flex min-w-0 flex-none flex-col justify-center gap-3 pl-7"
        >
          {/* Barrel scale: hairline + one tick per name, fill tracks focus.
              It used to be a sibling column with `self-stretch`, so it ran
              the full height of this row (~520px) while the four names
              occupy ~300px of it — the ticks, spaced evenly down the rail,
              lined up with nothing at all and the rail read as a stray line
              in the margin. Living inside the names column, with each tick
              rendered by its own name row (below), pins tick i to name i's
              optical centre by construction. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-[3px] top-0 w-px bg-border"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[3px] top-0 w-px bg-primary"
            style={{ height: `${(focus / Math.max(1, segments)) * 100}%` }}
          />
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
                className="relative w-fit cursor-pointer rounded-md px-1 py-1 text-left transition-[filter] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{
                  filter: `blur(${blur}px)`,
                  opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: 'left center',
                  color: mixColor(item.accent, 1 - d),
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-[-28px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                  style={{
                    background: d < 0.5 ? 'currentColor' : 'var(--border, rgba(255,255,255,.14))',
                  }}
                />
                <span className="text-[3.25rem] font-semibold leading-[1.05] [font-family:var(--display-face)] lg:text-[3.875rem]">
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* The card shell is permanently mounted and never animated: only
            its contents rack. Fixed height (rather than stretching with the
            row) so the box doesn't resize under the swap; `max-w` caps the
            measure without leaving a dead gutter, since `mr-auto` is not
            used — the column still reaches the container's right edge on
            narrower screens and the text inside carries its own 40ch. */}
        <div
          className="flex min-w-0 flex-1 flex-col justify-center self-center rounded-lg border border-border bg-card p-6 sm:p-7"
          style={{
            // `min(460px, 100%)` looked like it adapted and didn't: a
            // percentage height only resolves against a definite parent
            // height, and inside a centred flex row it isn't one, so the
            // card fell back to a flat 460px. On a 600px-tall window that
            // is taller than the whole row, and the pin's `overflow-hidden`
            // sheared the bottom off the card and the last two names.
            // Viewport units are always definite: 260px is the lead plus
            // the pin's top padding, so this is "whatever is left under the
            // heading", floored so the card never collapses.
            height: 'clamp(280px, calc(100vh - var(--header-h, 56px) - 260px), 460px)',
          }}
        >
          {panelItem && <RackPanel key={panelItem.id} item={panelItem} d={panelD} />}
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
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${NARROW_BREAKPOINT_PX - 1}px), (max-height: ${SHORT_BREAKPOINT_PX - 1}px)`,
    );
    const update = () => setTooSmall(mq.matches);
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
  const useRack = mounted && !prefersReducedMotion && !tooSmall;

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
