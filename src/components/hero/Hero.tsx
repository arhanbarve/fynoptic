import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { RotatingWord } from './RotatingWord';

const ROTATING_WORDS = ['scam', 'setup', 'lie', 'con', 'trap'] as const;

export function Hero() {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  // SSR always renders the animated branch (matchMedia doesn't exist server-side).
  // Consulting prefersReducedMotion before mount would make the client's first
  // render diverge from that server output and trigger a hydration mismatch, so
  // the reduced-motion branch is only allowed to kick in post-mount.
  const reduceMotion = mounted && prefersReducedMotion;

  return (
    <motion.div
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
    </motion.div>
  );
}

export default Hero;
