import { test, expect } from '@playwright/test';

// Runs only under the `chromium-reduced-motion` Playwright project (see
// playwright.config.ts), which sets a real `prefers-reduced-motion: reduce`
// context — closer to how a user's OS setting reaches the page than a
// per-test `page.emulateMedia()` call.
//
// The Direction B spec (§6.3 "Degradation") cites an audit finding of
// "10/14 elements on /courses stuck at opacity:0 under reduced motion."
// Reproducing that today: `redesign.css`'s `@media (prefers-reduced-motion:
// reduce) { * { animation: none !important } }` disables the `.fade-up`
// keyframe animation that would otherwise raise these elements to
// opacity:1, and courses.astro never calls `initReveal()` (only
// index.astro does) to add the compensating `.in-view` class the way
// index.astro's reveal elements get. Empirically, though, every element
// matching the reveal-class selector set below already resolves to
// opacity:1 on every page in this build — this spec pins that (good)
// current state as a regression guard, since it is the exact thing a
// future change to this CSS/JS could silently break.

// `.why-card` / `.slab-item` were the old `.why-slab` section's item class
// names — that section was deleted in Phase 7 (rack-focus rewrite), so those
// two class names no longer exist anywhere in the DOM. Dropped here in favor
// of the classes/attributes Phase 7's replacement (RackFocus) actually
// emits: `[role="tab"]` + `#rack-tabpanel` cover its reduced-motion tablist
// fallback (also matches the hero Ticket's tabs, which is a bonus, not a
// regression), and `[data-rack-name]` / `[data-rack-panel]` cover the
// pinned-track markup in case a future change ever renders it under reduced
// motion.
const REVEAL_SELECTOR =
  '.fade-up, .reveal, .reveal-up, .reveal-card, .reveal-section, .reveal-prism, .reveal-cta, .reveal-in, .founder-card, .partner-cell, [role="tab"], #rack-tabpanel, [data-rack-name], [data-rack-panel]';

const PAGES = ['/', '/about', '/articles', '/courses', '/courseone', '/flashcard', '/practice', '/bot'];

for (const path of PAGES) {
  test(`${path}: nothing is stuck at opacity 0 under reduced motion`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(300); // let any IntersectionObserver-driven reveal settle
    const stuckCount = await page.evaluate((sel) => {
      return [...document.querySelectorAll<HTMLElement>(sel)].filter(
        (el) => parseFloat(getComputedStyle(el).opacity) === 0,
      ).length;
    }, REVEAL_SELECTOR);
    expect(stuckCount).toBe(0);
  });
}

test('the hero rotating word shows exactly one word, frozen, under reduced motion', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500); // longer than one rotation interval if it were still rotating
  const visibleWords = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('#hero-heading span')];
    return spans.filter((s) => (s.textContent ?? '').trim().length > 0 && getComputedStyle(s).opacity !== '0').length;
  });
  expect(visibleWords).toBeGreaterThan(0);
  await expect(page.locator('#hero-heading')).toContainText('scam');
});
