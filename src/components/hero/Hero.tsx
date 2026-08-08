import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { RotatingWord } from './RotatingWord';
import { PartnerStrip } from './PartnerStrip';
import { Ticket } from './Ticket';

const ROTATING_WORDS = ['scam', 'setup', 'lie', 'con', 'trap'] as const;

/**
 * Scroll progress scoped to the hero's own height, for Ticket's scroll-driven
 * row focus (spec §6.2, D16: "Focus walks the rows as the hero scrolls,
 * driven by the hero's own scroll progress. No pinning, no added page
 * length."). 0 when the hero's top is at the viewport top (page-load
 * position); 1 once the hero has scrolled a full hero-height further, i.e.
 * its bottom has reached the viewport top and it's about to hand off to the
 * next section. Deliberately not the Phase 7 rack-focus mechanism (spec
 * §6.3) — that pins the section and synthesizes a much taller scroll track
 * (`pinH + step*3`) to hold a fixed viewport in place, which doesn't exist
 * yet and is the wrong shape for a hero that scrolls past normally. This is
 * just a rAF-throttled `getBoundingClientRect` read against the hero's own
 * root, i.e. exactly the "hero section's own scroll-through distance" this
 * phase calls for.
 */
function useHeroScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      const p = -rect.top / rect.height;
      setProgress(Math.min(1, Math.max(0, p)));
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
  }, []);

  return { ref, progress };
}

export function Hero() {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { ref: heroRef, progress: scrollProgress } = useHeroScrollProgress();

  useEffect(() => {
    setMounted(true);
  }, []);

  // SSR always renders the animated branch (matchMedia doesn't exist server-side).
  // Consulting prefersReducedMotion before mount would make the client's first
  // render diverge from that server output and trigger a hydration mismatch, so
  // the reduced-motion branch is only allowed to kick in post-mount.
  const reduceMotion = mounted && Boolean(prefersReducedMotion);

  /* Two-column grid per spec §6.2 (1.04fr left / .96fr right), single
     column below `md` — at 390px viewport each column would be ~165px, too
     narrow for the CTA buttons' nowrap text without forcing page-level
     horizontal scroll (I2), so the grid collapses to one column there and
     the ticket falls below instead of beside the headline.
     `min-w-0` on BOTH children is required: a grid item's default
     `min-width: auto` sizes it to its content's min-content width, and the
     partner track's non-shrinking logo cards (`flex: 0 0 auto`,
     `min-width: 176px` each) have a min-content width far wider than the
     column — without this, that drags the left column past the container
     and crushes the ticket column to a few px. (Found and fixed in this
     session's prototype work.) */
  return (
    <div
      ref={heroRef}
      className="grid grid-cols-1 items-start gap-10 md:grid-cols-[1.04fr_.96fr] md:gap-8 lg:gap-12"
    >
      <motion.div
        className="min-w-0"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* redesign.css's sitewide `h1 { font-family: var(--display-face) !important;
          font-weight: 600 !important; letter-spacing: -.018em !important }` outranks
          plain, non-important Tailwind utilities on ANY of those three properties, not
          just font-family — font-bold/tracking-[-0.02em] were silently losing the same
          way the font-family override did before it got the `!` treatment. All three now
          carry the trailing `!` (Tailwind's !important marker): Tailwind's
          utilities live in globals.css's `@layer utilities` while redesign.css is
          unlayered, and for !important declarations, layered rules always outrank
          unlayered ones regardless of selector specificity, so these reliably win
          without touching that file. (As of Phase 3, --display-face is Helvetica
          Neue too, the same stack as --font-hero below, so the font-family override
          is now redundant in value — kept for the weight/letter-spacing overrides
          it travels with, and to decouple the hero from any future site-wide
          type change.) `id="hero-heading"` is required separately:
          index.astro's hero section reads it via aria-labelledby. */}
        <h1
          id="hero-heading"
          className="max-w-[22ch] text-[clamp(2rem,3.4vw,3.15rem)] font-bold! leading-[1.06] tracking-[-0.02em]! text-foreground [font-family:var(--font-hero)]!"
        >
          See through the{' '}
          <RotatingWord
            words={ROTATING_WORDS}
            className="text-primary"
          />
          .
        </h1>

        {/* No `hero-sub` legacy classname here on purpose: redesign.css's
            `.hero-sub { color: var(--text-300) !important }` is unlayered, so it
            would silently beat this Tailwind `text-muted-foreground` utility the
            same way it beat the h1's utilities above — dropping the legacy class
            (rather than adding another `!`) means there's no competing rule to
            fight in the first place. */}
        <p className="mt-4 max-w-[54ch] text-[clamp(1rem,1.15vw,1.12rem)] text-muted-foreground">
          Fynoptic is the ultimate free learning platform for consumer awareness.
          Interactive lessons, informative articles, and practice questions.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="hero" data-track="cta_click">
            <a href="/courses">Start the free course</a>
          </Button>
          <Button asChild size="hero" variant="outline">
            <a href="/practice">Try Practice mode</a>
          </Button>
        </div>

        <PartnerStrip />
      </motion.div>

      <motion.div
        className="min-w-0"
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <Ticket scrollProgress={scrollProgress} reducedMotion={reduceMotion} />
      </motion.div>
    </div>
  );
}

export default Hero;
