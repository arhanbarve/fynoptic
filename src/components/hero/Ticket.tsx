import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Checkout ticket — spec §6.2 (docs/superpowers/plans/2026-08-08-direction-b-react-rebuild.md).
 * Seven fee-breakdown rows, each a `role="tab"` button. Amounts and per-row
 * notes are taken verbatim from the spec's ticket table; arithmetic checked
 * there sums to the $109.96 total (84.00 + 9.60 + 4.99 + 6.00 + 2.50 + 2.87).
 */
interface TicketRow {
  id: string;
  label: string;
  amount: string;
  note: string;
  isTotal?: boolean;
}

const TICKET_ROWS: readonly TicketRow[] = [
  {
    id: 'advertised',
    label: 'Advertised — 2 × $42.00',
    amount: '$84.00',
    note: 'The number you actually compared against.',
  },
  {
    id: 'service-fee',
    label: 'Service fee',
    amount: '$9.60',
    note: 'A percentage of the price, charged per ticket, for no nameable service.',
  },
  {
    id: 'processing-fee',
    label: 'Order processing fee',
    amount: '$4.99',
    note: 'Charged per order, not per ticket — it vanishes from any per-ticket comparison.',
  },
  {
    id: 'facility-charge',
    label: 'Facility charge',
    amount: '$6.00',
    note: 'Paid to the venue, collected by the seller, and shown only once you reach checkout.',
  },
  {
    id: 'delivery',
    label: 'Delivery — mobile ticket',
    amount: '$2.50',
    note: 'A delivery fee for a barcode. Nothing is printed or shipped.',
  },
  {
    id: 'sales-tax',
    label: 'Sales tax',
    amount: '$2.87',
    note: "The only line actually set by law — and it's calculated on the fees too.",
  },
  {
    id: 'total',
    label: 'Total charged',
    amount: '$109.96',
    note: '$25.96 over the advertised price.',
    isTotal: true,
  },
] as const;

/**
 * Props designed for the parent (Hero.tsx) to own scroll geometry and hand
 * this leaf component only a normalized position:
 *
 * - `scrollProgress` is 0..1 — 0 at the top of whatever scroll range the
 *   parent ties to the hero, 1 at the bottom of it. This component divides
 *   that range into 7 equal steps (one per row) and never reads the DOM or
 *   `window` itself.
 * - `reducedMotion` lets the parent forward an already-computed preference
 *   (e.g. the same `mounted && prefersReducedMotion` pattern used in
 *   Hero.tsx/RotatingWord.tsx). When omitted, this component falls back to
 *   framer-motion's own `useReducedMotion()` so it still works stand-alone.
 */
export interface TicketProps {
  /** Hero scroll progress, normalized 0..1. Values outside that range are clamped. */
  scrollProgress: number;
  /** Prefers-reduced-motion override; falls back to `useReducedMotion()` if omitted. */
  reducedMotion?: boolean;
}

type FocusMode = 'scan' | 'all-sharp';

function rowIndexFromProgress(progress: number, count: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(count - 1, Math.floor(clamped * count));
}

export function Ticket({ scrollProgress, reducedMotion }: TicketProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);

  // Manual-control state machine:
  // - `pinnedIndex === null` → auto mode: the active row tracks `scrollProgress`.
  // - Clicking a row, or moving with arrow keys, sets `pinnedIndex` and the
  //   active row stops tracking scroll.
  // - Clicking the row that is ALREADY the pinned+active one releases the pin
  //   back to auto mode. There is no scroll-position reset and no timeout —
  //   a pin lasts until that explicit toggle-off click.
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>('scan');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const autoIndex = useMemo(
    () => rowIndexFromProgress(scrollProgress, TICKET_ROWS.length),
    [scrollProgress],
  );

  const activeIndex = pinnedIndex ?? autoIndex;
  // `activeIndex` is always clamped into range by `rowIndexFromProgress` /
  // the modulo arithmetic in `handleKeyDown`, so this index access can't
  // actually miss — the fallback just satisfies noUncheckedIndexedAccess.
  const activeRow: TicketRow = TICKET_ROWS[activeIndex] ?? TICKET_ROWS[0]!;

  // Reduced motion always renders at ALL SHARP-equivalent static clarity —
  // no animated defocus — while tab/click/keyboard selection keeps working.
  const effectiveFocusMode: FocusMode = reduceMotion ? 'all-sharp' : focusMode;

  function selectAndPin(index: number) {
    setPinnedIndex(index);
    tabRefs.current[index]?.focus();
  }

  function handleRowClick(index: number) {
    if (pinnedIndex === index) {
      setPinnedIndex(null); // release back to scroll-driven auto mode
    } else {
      setPinnedIndex(index);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = TICKET_ROWS.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectAndPin((index + 1) % count);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectAndPin((index - 1 + count) % count);
    }
  }

  return (
    <div className="w-full rounded-[var(--radius)] border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground [font-family:var(--mono-face)]">
          Checkout
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Row focus mode">
          <button
            type="button"
            onClick={() => setFocusMode('scan')}
            aria-pressed={effectiveFocusMode === 'scan'}
            disabled={reduceMotion}
            title={reduceMotion ? 'Unavailable — reduced motion is on' : undefined}
            className={cn(
              'rounded-[var(--radius)] px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
              effectiveFocusMode === 'scan'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              reduceMotion && 'opacity-50',
            )}
          >
            Scan
          </button>
          <button
            type="button"
            onClick={() => setFocusMode('all-sharp')}
            aria-pressed={effectiveFocusMode === 'all-sharp'}
            className={cn(
              'rounded-[var(--radius)] px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
              effectiveFocusMode === 'all-sharp'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            All sharp
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Ticket fee breakdown"
        aria-orientation="vertical"
        className="divide-y divide-border"
      >
        {TICKET_ROWS.map((row, index) => {
          const isActive = index === activeIndex;
          const defocused = effectiveFocusMode === 'scan' && !isActive;
          return (
            <button
              key={row.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`ticket-tab-${row.id}`}
              aria-selected={isActive}
              aria-controls="ticket-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleRowClick(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm transition-[opacity,filter] duration-200',
                row.isTotal && 'font-semibold',
                isActive && 'bg-accent/40',
                defocused && 'opacity-50 blur-[1px]',
              )}
            >
              <span>{row.label}</span>
              <span className="tabular-nums">{row.amount}</span>
            </button>
          );
        })}
      </div>

      <div
        id="ticket-panel"
        role="tabpanel"
        aria-labelledby={`ticket-tab-${activeRow.id}`}
        className="px-4 py-3 text-sm text-muted-foreground"
      >
        {reduceMotion ? (
          <p>{activeRow.note}</p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.p
              key={activeRow.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {activeRow.note}
            </motion.p>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

export default Ticket;
