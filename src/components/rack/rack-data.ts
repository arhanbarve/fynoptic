/**
 * Content for the Phase 7 rack-focus section (spec §6.3): "One skill. Four
 * places to build it." — courses / articles / flashcards / practice.
 *
 * Copy and the primary stat numbers are copied verbatim from `index.astro`'s
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
 *
 * `statSecondary` is the two-part panel-head stat added in Phase 8 (spec
 * §6.5 S3: "611 TERMS · 12 UNITS" style separator). Per the same D10
 * convention — marketing figure stays as `statPrimary`, real figure goes
 * alongside it — `statSecondary` is a REAL, measured number, not another
 * rounded claim:
 *
 *   Courses:    6 sections — the flagship (and only live) course's own
 *               structure: pre-quiz + Module 1-4 + post-quiz, exactly as
 *               `courses.astro`'s progress UI already labels it
 *               ("<strong>0</strong>/6 sections", aria-label "Course
 *               sections" on `.course-stepper`).
 *   Articles:   244 published — `ARTICLE_META.length` in
 *               `src/data/articles.ts` (also noted in
 *               `articles-browser.ts`: "Astro renders all 244 cards").
 *               Articles carry no category/tag field (deliberately not
 *               invented, see `article-summary.ts`'s header comment), so
 *               there's no organizational count to use here the way the
 *               other three items have one — the real *total* is the next
 *               most honest thing to show next to the rounded "240+".
 *   Flashcards: 12 units — `Object.keys(FLASHCARD_UNITS).length` in
 *               `src/data/flashcard-units.ts`. Matches finding F7 in the
 *               spec doc (611 cards / 12 units).
 *   Practice:   16 topics — the sum of both banks' topic keys:
 *               `pf_bank_modules_1of6.json`'s "Personal Finance" (6 topics)
 *               + `econ_grouped_by_module_unit_with_choices.json`'s
 *               "Economics" (10 topics).
 *
 * Courses/Articles/Practice secondary values are this pass's own inference
 * (no exact secondary-stat copy in the spec doc for those three); Flashcards'
 * "12 units" is the one directly corroborated by the spec doc's F7 finding.
 */
export interface RackItem {
  id: string;
  title: string;
  description: string;
  statPrimary: string;
  statSecondary: string;
  href: string;
  /** Accent color this item desaturates from/to via `color-mix()` as focus moves away. */
  accent: string;
}

export const RACK_ITEMS: readonly RackItem[] = [
  {
    id: 'courses',
    title: 'Courses',
    description: 'Explore 4 hands on courses designed to help you learn step by step.',
    statPrimary: '4 courses',
    statSecondary: '6 sections',
    href: '/courses',
    accent: '#7C9EFF',
  },
  {
    id: 'articles',
    title: 'Articles',
    description: 'Access a library of over 240 insightful articles on different topics.',
    statPrimary: '240+ articles',
    statSecondary: '244 published',
    href: '/articles',
    accent: '#FF9F6E',
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Review and master 3,000+ vocabulary words with easy to use flashcards.',
    statPrimary: '3,000+ terms',
    statSecondary: '12 units',
    href: '/flashcards',
    accent: '#6FE0B8',
  },
  {
    id: 'practice',
    title: 'Practice',
    description: 'Sharpen your skills with 10,000+ challenging practice questions.',
    statPrimary: '10,000+ questions',
    statSecondary: '16 topics',
    href: '/practice',
    accent: '#F17EA0',
  },
] as const;
