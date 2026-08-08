import { test, expect } from '@playwright/test';

// The shadcn Button (`asChild`) merges `data-slot="button"` onto the
// rendered <a> (see src/components/ui/button.tsx + the legacy.css commit
// that keys off this same attribute). The homepage header nav also has an
// `<a href="/courses">Start the free course</a>` (desktop AND mobile menu
// copies, in src/components/shell/Nav.tsx), so `a[href="/courses"]` alone is
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

  test('rotates through all five words, exactly one visible at a time', async ({ page }) => {
    // Rewritten for the odometer rewrite (Phase 6, F11): the old locator did
    // `page.locator('#hero-heading span').filter(...).first()`, which read
    // DOM presence rather than rendered visibility. That was already
    // fragile — it happened to work because the live word's span preceded
    // the odometer's other spans in document order — but the odometer now
    // measures every word from a set of `aria-hidden`, `invisible` clone
    // spans that stay mounted at all times (so widths can be measured
    // without a layout flash), so a DOM-presence check on '#hero-heading
    // span' would trivially find text for every word simultaneously and
    // prove nothing. This asserts the actual guarantee: at any instant, at
    // most one span whose own text is a candidate word is *visible*
    // (`:visible` — Playwright's pseudo-class, which honors
    // `visibility: hidden`, i.e. Tailwind's `invisible` utility on the
    // clones). The `hasNot: locator('span')` filter keeps only leaf
    // word-spans, excluding the odometer's own wrapping container (which
    // also carries the live word's text as a descendant and would
    // otherwise double-count alongside its inner span).
    await page.goto('/');
    const words = ['scam', 'setup', 'lie', 'con', 'trap'];
    const seen = new Set<string>();
    const wordRegex = new RegExp(`^(${words.join('|')})$`);

    const visibleWordSpans = page
      .locator('#hero-heading span:visible')
      .filter({ hasText: wordRegex })
      .filter({ hasNot: page.locator('span') });

    // Same widened polling cadence as before (see the flakiness note this
    // test used to carry): a fixed cadence timed to the 2200ms rotation
    // boundary was flaky under Playwright's parallel workers. 14s (one
    // full 5-word, 2200ms cycle is 11s) gives ~3s of margin against the
    // whole-machine CPU contention the full suite's ~9 concurrent browser
    // workers introduce — observed to occasionally starve this test's own
    // page enough to slip a full cycle at a 12s deadline.
    const deadline = Date.now() + 14_000;
    while (Date.now() < deadline && seen.size < words.length) {
      const visibleTexts = await visibleWordSpans.allTextContents();

      // Never more than one word actually visible — the odometer's
      // AnimatePresence briefly has zero mounted (mode="wait", between an
      // exit finishing and the next entrance starting), but never two.
      expect(visibleTexts.length).toBeLessThanOrEqual(1);

      if (visibleTexts.length === 1) {
        seen.add(visibleTexts[0]!.trim());
      }
      await page.waitForTimeout(300);
    }

    for (const word of words) {
      expect(seen.has(word)).toBe(true);
    }
  });

  test('trailing period stays flush against the live word, at every word in the cycle', async ({ page }) => {
    // RotatingWord.tsx used to reserve a spacer sized to the widest word
    // ("setup"), which pinned the trailing period (rendered by Hero.tsx
    // immediately after <RotatingWord/>, as a plain "." text node) to that
    // spacer's fixed edge — short words like "lie" left a visible gap
    // before the period while long words sat flush. The fix sizes the
    // RotatingWord's own container to the live word's measured width, so
    // the period (its next sibling text node) should sit within 2px of
    // that container's right edge for every word, not just the longest.
    await page.goto('/');
    const words = ['scam', 'setup', 'lie', 'con', 'trap'];
    const seen = new Set<string>();

    // Same widened 400ms polling cadence as the rotation test above, for
    // the same reason: a fixed cadence timed to the 2200ms boundary was
    // flaky under Playwright's parallel workers.
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && seen.size < words.length) {
      const sample = await page.evaluate(() => {
        const heading = document.querySelector('#hero-heading');
        const container = heading?.querySelector('.text-primary');
        if (!container) return null;

        // The live word is always the container's first child — either a
        // bare text node (pre-measurement / reduced-motion) or the visible
        // inner span (once the measured/animated version has taken over).
        // Either way, the hidden measurement clones are appended after it.
        const word = container.childNodes[0]?.textContent?.trim() ?? '';

        const period = container.nextSibling;
        if (!period || period.nodeType !== Node.TEXT_NODE) return null;

        const range = document.createRange();
        range.setStart(period, 0);
        range.setEnd(period, 1);

        const periodLeft = range.getBoundingClientRect().left;
        const wordRight = container.getBoundingClientRect().right;
        return { word, gap: periodLeft - wordRight };
      });

      if (sample && words.includes(sample.word) && !seen.has(sample.word)) {
        expect(Math.abs(sample.gap)).toBeLessThanOrEqual(2);
        seen.add(sample.word);
      }
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

// Checkout ticket — spec §6.2 / D16. Phase 6 gate: "scroll advances focus,
// click takes over, each row shows its own note, arrow keys traverse."
test.describe('hero checkout ticket', () => {
  test('scroll advances the active row, click pins it, and arrow keys traverse from the pin', async ({
    page,
  }) => {
    await page.goto('/');
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(7);

    const activeIndex = async () => {
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        if ((await tabs.nth(i).getAttribute('aria-selected')) === 'true') return i;
      }
      return -1;
    };

    const initialIndex = await activeIndex();
    expect(initialIndex).toBeGreaterThanOrEqual(0);

    // Hero.tsx's scroll-progress hook is scoped to the hero's own height
    // (getBoundingClientRect on the hero grid root), not the whole page, so
    // scrolling roughly one hero-height is enough to walk the active row
    // forward without needing to know the page's total scroll length.
    await page.evaluate(() => {
      const hero = document.querySelector('section.hero');
      window.scrollBy(0, hero?.clientHeight ?? 900);
    });
    await page.waitForTimeout(300);
    const scrolledIndex = await activeIndex();
    expect(scrolledIndex).toBeGreaterThan(initialIndex);

    // Click takes over: pins a row and stops the scroll-driven advance.
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');

    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(300);
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true'); // unmoved — pinned

    // Arrow keys traverse from the pinned row.
    await tabs.nth(2).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(3)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(2)).toBeFocused();
  });

  test('each row shows its own distinct note in the panel', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('[role="tab"]');
    const panel = page.locator('#ticket-panel');
    const count = await tabs.count();
    const notes = new Set<string>();

    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      const tabId = await tabs.nth(i).getAttribute('id');
      // The tab's own `aria-selected` and the panel's `aria-labelledby`
      // update synchronously with the click; the panel's *text* is wrapped
      // in an `AnimatePresence mode="wait"` swap (Ticket.tsx), so it lags
      // by up to its 200ms exit+enter transition. Wait for the
      // (unanimated) `aria-labelledby` link first, via Playwright's
      // auto-retrying `expect`, then give the animated text a fixed margin
      // to finish catching up before reading it — a plain read-after-click
      // caught the previous row's note mid-transition.
      await expect(panel).toHaveAttribute('aria-labelledby', tabId ?? '');
      await page.waitForTimeout(300);
      const text = (await panel.textContent())?.trim() ?? '';
      expect(text.length).toBeGreaterThan(0);
      notes.add(text);
    }

    expect(notes.size).toBe(count);
  });
});
