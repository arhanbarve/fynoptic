// The flip-card itself — `.fc-card` / `#term-side` / `#def-side` from
// flashcard.astro:103-112. flashcard.ts never animated this with a timer;
// legacy.css (:5510-5537) already drives a pure-CSS 3D flip off the
// `is-front` class via `transition: transform .5s ease, opacity .5s ease`.
// Per the plan this becomes a real framer-motion component instead of a
// class-toggle-and-let-the-stylesheet-animate-it approach: each side is a
// `motion.div` animating the same rotateY/opacity values, with the legacy
// CSS transition explicitly disabled (`transition: 'none'` inline — inline
// style beats any external stylesheet rule) so framer-motion is the sole
// animator and there's no double-easing between two competing transition
// systems. `is-front` is still applied to both sides regardless, satisfying
// Appendix D's "keep emitting this class name" requirement independent of
// who drives the animation.
import { motion, useReducedMotion } from 'framer-motion';

export interface FlashcardCardProps {
  term: string;
  definition: string;
  /** True when the term side is currently the front. Single derived value from useFlashcardDeck — see its module comment on the is-front duplication fix. */
  isFront: boolean;
}

const FLIP_TRANSITION = { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as const };

export function FlashcardCard({ term, definition, isFront }: FlashcardCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const transition = prefersReducedMotion ? { duration: 0 } : FLIP_TRANSITION;

  return (
    <div className="fc-card" role="group" aria-label="Flashcard">
      <motion.div
        id="term-side"
        className={isFront ? 'side is-front' : 'side'}
        style={{ transition: 'none' }}
        animate={{ rotateY: isFront ? 0 : 180, opacity: isFront ? 1 : 0 }}
        transition={transition}
      >
        <p className="prompt-label">Term</p>
        <div id="term-text" className="prompt-text">
          {term || '—'}
        </div>
      </motion.div>
      <motion.div
        id="def-side"
        className={!isFront ? 'side is-front' : 'side'}
        style={{ transition: 'none' }}
        animate={{ rotateY: !isFront ? 0 : 180, opacity: !isFront ? 1 : 0 }}
        transition={transition}
      >
        <p className="prompt-label">Definition</p>
        <div id="def-text" className="prompt-text">
          {definition || '—'}
        </div>
      </motion.div>
    </div>
  );
}
