import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const ROTATE_INTERVAL_MS = 2200;

// The word-swap crossfade's own timing. The container width below animates
// on this exact same curve so the whole unit — word plus the trailing
// period the parent renders immediately after this component in the h1's
// text flow — moves together instead of the period snapping to a new
// position mid-fade.
const SWAP_TRANSITION = { duration: 0.32, ease: 'easeOut' } as const;

interface RotatingWordProps {
  words: readonly string[];
  className?: string;
}

export function RotatingWord({ words, className }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  // Pixel width of each word, measured from hidden clones once real DOM
  // exists (`null` until the first measurement lands).
  const [widths, setWidths] = useState<number[] | null>(null);
  const measureRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  // SSR always renders the animated branch (matchMedia doesn't exist server-side).
  // Consulting prefersReducedMotion before mount would make the client's first
  // render diverge from that server output and trigger a hydration mismatch, so
  // the reduced-motion branch is only allowed to kick in post-mount.
  const reduceMotion = mounted && prefersReducedMotion;

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % words.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [words.length, reduceMotion]);

  // Measure every word's real rendered width from hidden clones instead of
  // sizing a spacer off the single widest candidate. The old spacer
  // reserved a box the width of "setup" and left the trailing period
  // pinned to that box's edge, so short words like "lie" stranded a gap
  // before the period while long words sat flush against it. Re-measures
  // on resize because the h1's font-size is viewport-relative
  // (`clamp(2rem,3.4vw,3.15rem)`), and again once webfonts finish loading
  // since a late font swap can shift glyph widths after the first pass.
  useEffect(() => {
    if (!mounted) return;

    const measure = () => {
      setWidths(measureRefs.current.map((el) => el?.getBoundingClientRect().width ?? 0));
    };

    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);

    return () => window.removeEventListener('resize', measure);
  }, [mounted, words]);

  const current = words[index];

  // Hidden clones of every word, used only to measure widths above.
  // Absolutely positioned and invisible so they never affect visible
  // layout or get announced to assistive tech.
  const measureNodes = words.map((word, i) => (
    <span
      key={word}
      aria-hidden="true"
      ref={(el) => {
        measureRefs.current[i] = el;
      }}
      className="invisible absolute left-0 top-0 whitespace-nowrap"
    >
      {word}
    </span>
  ));

  if (reduceMotion) {
    // Static correctness, not just an animation nicety: even frozen on word
    // one, the period the parent renders right after this component must
    // sit hard against it. Plain inline text sizes to its own content, so
    // there is no spacer-induced gap to fix here.
    return <span className={className}>{words[0]}</span>;
  }

  // Before mount (SSR and the first client paint) there is no real DOM to
  // measure from. Render the live word as plain, naturally-sized inline
  // text — the same shape as the reduced-motion branch above, so the
  // server and first client render match exactly (no hydration warning).
  // Since no spacer is involved, this is already gap-free. Only once
  // mounted and widths are measured does the animated, explicit-width
  // version below take over.
  if (!mounted || widths === null) {
    return (
      <span className={cn('relative inline-block', className)}>
        {current}
        {mounted ? measureNodes : null}
      </span>
    );
  }

  return (
    <motion.span
      className={cn('relative inline-block overflow-hidden whitespace-nowrap align-bottom', className)}
      animate={{ width: widths[index] }}
      transition={SWAP_TRANSITION}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={current}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={SWAP_TRANSITION}
          className="inline-block whitespace-nowrap"
        >
          {current}
        </motion.span>
      </AnimatePresence>
      {measureNodes}
    </motion.span>
  );
}
