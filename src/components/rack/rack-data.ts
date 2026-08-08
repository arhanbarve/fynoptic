/**
 * Content for the Phase 7 rack-focus section (spec §6.3): "One skill. Four
 * places to build it." — courses / articles / flashcards / practice.
 *
 * Copy and the stat numbers are copied verbatim from `index.astro`'s
 * `.why-slab` section ("Why use Fynoptic?", deleted in this same phase by a
 * parallel agent). Per the implementation plan's Appendix G (O1) / D10: the
 * site's real practice (1,286) and flashcard (611) counts are lower than
 * these copy figures, but the plan is explicit that copy keeps the site's
 * existing claimed numbers rather than the freshly-audited real ones — this
 * file does not invent anything new, it just relocates what `.why-slab`
 * already said:
 *
 *   Courses:    "Explore 4 hands on courses designed to help you learn
 *                step by step."
 *   Articles:   "Access a library of over 240 insightful articles on
 *                different topics."
 *   Flashcards: "Review and master 3,000+ vocabulary words with easy to
 *                use flashcards."
 *   Practice:   "Sharpen your skills with 10,000+ challenging practice
 *                questions."
 */
export interface RackItem {
  id: string;
  title: string;
  description: string;
  stat: string;
  href: string;
  /** Accent color this item desaturates from/to via `color-mix()` as focus moves away. */
  accent: string;
}

export const RACK_ITEMS: readonly RackItem[] = [
  {
    id: 'courses',
    title: 'Courses',
    description: 'Explore 4 hands on courses designed to help you learn step by step.',
    stat: '4 courses',
    href: '/courses',
    accent: '#7C9EFF',
  },
  {
    id: 'articles',
    title: 'Articles',
    description: 'Access a library of over 240 insightful articles on different topics.',
    stat: '240+ articles',
    href: '/articles',
    accent: '#FF9F6E',
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Review and master 3,000+ vocabulary words with easy to use flashcards.',
    stat: '3,000+ terms',
    href: '/flashcards',
    accent: '#6FE0B8',
  },
  {
    id: 'practice',
    title: 'Practice',
    description: 'Sharpen your skills with 10,000+ challenging practice questions.',
    stat: '10,000+ questions',
    href: '/practice',
    accent: '#F17EA0',
  },
] as const;
