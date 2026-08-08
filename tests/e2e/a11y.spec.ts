import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Characterization of current accessibility state across the site, before
// Phase 2's fixes. Two specs are deliberately written to FAIL and marked
// test.fixme (per the plan's 1g) because they encode Phase 2's target
// behavior, not today's:
//   - a real skip link (no such element exists in the DOM at all today)
//   - .sr-only content reachable in the accessibility tree (currently
//     display:none, which removes it from the tree for everyone, sighted
//     or not — legacy.css:1827-1828)
// Do not un-fixme these here; that's Phase 2's job.

const PAGES = ['/', '/about', '/articles', '/courses', '/courseone', '/flashcard', '/practice', '/bot'];
// '/profile' is excluded: signed-out it immediately redirects to '/', so
// scanning it is really just re-scanning the homepage mid-navigation.
const THEMES = ['dark', 'light'] as const;
const VIEWPORTS = [390, 768, 1024, 1280, 1440];

// Known, pre-existing axe violations as of this characterization (run
// against the unmodified site — see the Phase 1 plan). None of these are
// fixed here; Phase 2 only addresses the skip-link/.sr-only issue (F1/F10)
// above, so this baseline exists to catch REGRESSIONS (a new violation
// appearing) without failing the suite on debt this phase doesn't own.
const KNOWN_VIOLATIONS_BASE: Record<string, string[]> = {
  'dark:/': [],
  'dark:/about': ['heading-order'],
  'dark:/articles': ['heading-order', 'label-title-only'],
  'dark:/courses': ['aria-progressbar-name'],
  'dark:/courseone': [],
  'dark:/flashcard': ['heading-order'],
  'dark:/practice': [],
  'dark:/bot': [],
  'light:/': [],
  'light:/about': ['heading-order'],
  'light:/articles': ['heading-order', 'label-title-only'],
  'light:/courses': ['aria-progressbar-name'],
  'light:/courseone': [],
  'light:/flashcard': ['heading-order'],
  'light:/practice': [],
  'light:/bot': [],
};

// `color-contrast` shows up intermittently on every page in both themes —
// `.btn { transition: all 0.3s ease }` and the hero's rotating-word/partner-
// marquee animations mean axe's sampling can land mid-transition. It is a
// real, pre-existing issue (confirmed present on every page at least once),
// just not a deterministic one, and fixing it is out of scope here (F1/F10
// are Phase 2's only accessibility fixes) — allow it everywhere so this
// spec pins new regressions, not animation-timing noise.
const KNOWN_VIOLATIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(KNOWN_VIOLATIONS_BASE).map(([key, ids]) => [key, [...ids, 'color-contrast']]),
);

for (const theme of THEMES) {
  for (const path of PAGES) {
    test(`axe: ${path} (${theme}) has no violations beyond the known baseline`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('fynoptic-theme', t), theme);
      await page.goto(path);

      const results = await new AxeBuilder({ page }).analyze();
      const foundIds = [...new Set(results.violations.map((v) => v.id))].sort();
      const known = (KNOWN_VIOLATIONS[`${theme}:${path}`] ?? []).slice().sort();

      const unexpected = foundIds.filter((id) => !known.includes(id));
      expect(unexpected, `unexpected new axe violations on ${path} (${theme})`).toEqual([]);
    });
  }
}

test.describe('no horizontal scroll at any of the 5 standard widths, both themes', () => {
  for (const theme of THEMES) {
    for (const width of VIEWPORTS) {
      test(`${width}px, ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((t) => localStorage.setItem('fynoptic-theme', t), theme);
        await page.goto('/');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.fixme('the skip link is present and focusable from a cold load', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.locator('.skip-link, a[href="#main"]');
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();
});

test.fixme('.sr-only content is reachable in the accessibility tree', async ({ page }) => {
  // articles.astro's search-sort <label class="sr-only"> — currently
  // display:none via legacy.css:1827-1828, which removes it from the tree
  // for assistive tech too, not just sighted users.
  await page.goto('/articles');
  const label = page.locator('label.sr-only', { hasText: 'Sort' });
  await expect(label).toBeVisible(); // fails today: display:none
});
