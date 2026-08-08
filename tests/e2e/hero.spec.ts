import { test, expect } from '@playwright/test';

// The shadcn Button (`asChild`) merges `data-slot="button"` onto the
// rendered <a> (see src/components/ui/button.tsx + the legacy.css commit
// that keys off this same attribute). The homepage header nav also has an
// `<a href="/courses">Start the free course</a>` (desktop AND mobile menu
// copies, in src/components/Header.astro), so `a[href="/courses"]` alone is
// ambiguous in strict mode. Scoping to `[data-slot="button"]` selects only
// the hero's shadcn-rendered CTA.
const PRIMARY_CTA_SELECTOR = 'a[data-slot="button"][href="/courses"]';

test.describe('homepage hero', () => {
  test('renders the headline with a rotating word and correct CTAs', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('#hero-heading');
    await expect(heading).toContainText('See through the');

    // No promo pill/badge above the headline. The original 21st.dev
    // reference component had an "Anouncing our latest..." pill, but that
    // text was never actually present on this site (confirmed in Task 1's
    // ground-truth findings), so asserting its absence tests nothing real.
    // Instead, guard against ever reintroducing a pill/badge element in the
    // hero region, using the class patterns this codebase already uses for
    // pills/badges elsewhere (.badge, .pill-toggle, etc.) — this matches
    // Task 10's manual checklist item "No pill/badge above the headline."
    await expect(
      page.locator('section.hero [class*="pill"], section.hero [class*="badge"]'),
    ).toHaveCount(0);

    const primaryCta = page.locator(PRIMARY_CTA_SELECTOR, { hasText: 'Start the free course' });
    const secondaryCta = page.locator('a[href="/practice"]', { hasText: 'Try Practice mode' });
    await expect(primaryCta).toBeVisible();
    await expect(secondaryCta).toBeVisible();
  });

  test('headline renders in the Helvetica stack, not the sitewide Spectral display face', async ({ page }) => {
    // This session hit three separate cascade bugs getting this one property
    // right (redesign.css's sitewide `h1 { font-family: var(--display-face)
    // !important }` beats a plain inline style; the fix landed as a Tailwind
    // `!`-important utility instead). Guard the actual computed value so a
    // future cascade/layer change can't silently regress it back to Spectral.
    await page.goto('/');
    const fontFamily = await page
      .locator('#hero-heading')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Helvetica');
  });

  test('subhead renders in Inter, not the display face', async ({ page }) => {
    // Phase 3 gate: the hero subhead is body copy, not a heading, so it
    // should never pick up --display-face/--editorial-face regardless of
    // which font backs those tokens.
    await page.goto('/');
    const fontFamily = await page
      .locator('#hero-heading + p')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Inter');
  });

  test('subhead uses the muted-foreground token, not a stale legacy color', async ({ page }) => {
    // The subhead used to carry the legacy `.hero-sub` classname, whose
    // unlayered `!important` color rule silently beat this Tailwind
    // `text-muted-foreground` utility the same way the headline's utilities
    // were beaten before they got the `!` treatment. Fixed by dropping the
    // legacy class instead. Guard the real computed value so it can't
    // silently regress back to the old --text-300 color.
    await page.goto('/');
    const color = await page
      .locator('#hero-heading + p')
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(133, 147, 174)'); // --muted-fg (#8593AE)
  });

  test('rotates through all five words over one full cycle', async ({ page }) => {
    await page.goto('/');
    const words = ['scam', 'setup', 'lie', 'con', 'trap'];
    const seen = new Set<string>();
    const wordRegex = new RegExp(`^(${words.join('|')})$`);

    // Sample every 400ms for slightly over one full 5-word cycle (5 * 2200ms
    // rotation interval), instead of 5 samples timed to land exactly on each
    // 2200ms boundary. A fixed 2300ms poll cadence was flaky under
    // Playwright's parallel workers: CPU/scheduling jitter from concurrent
    // test processes pushed a poll past a word's window and skipped it. Each
    // word stays in the DOM for well over a second even through its
    // enter/exit transition, so 400ms sampling has a wide margin and won't
    // miss a word even under contention. Widening the margin (not deleting
    // the assertion) per this test's own flakiness note.
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && seen.size < words.length) {
      const visible = await page
        .locator('#hero-heading span')
        .filter({ hasText: wordRegex })
        .first()
        .textContent();
      if (visible) seen.add(visible.trim());
      await page.waitForTimeout(400);
    }

    for (const word of words) {
      expect(seen.has(word)).toBe(true);
    }
  });

  test('freezes on the first word when prefers-reduced-motion is set', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForTimeout(3000); // longer than one rotation interval
    await expect(page.locator('#hero-heading')).toContainText('scam');
  });

  test('CTA buttons have no gradient background', async ({ page }) => {
    await page.goto('/');
    const primaryCta = page.locator(PRIMARY_CTA_SELECTOR, { hasText: 'Start the free course' });
    const backgroundImage = await primaryCta.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(backgroundImage).toBe('none');
  });
});
