import { test, expect, type Page } from '@playwright/test';

// Phase 7 gate (implementation plan, "Rack focus section"): the
// courses→articles→flashcards→practice scroll-focus section. RackFocus.tsx
// renders three modes — the pinned rack track (default, ≥900px, motion
// allowed), and a static tab set for reduced-motion and narrow (<900px)
// viewports. This section is scoped by `[aria-labelledby="rack-heading"]` to
// avoid colliding with the hero's own `role="tab"` checkout ticket
// (Ticket.tsx), which also lives on '/'.

const RACK_SECTION = 'section[aria-labelledby="rack-heading"]';

/**
 * Bring the rack section into view and wait for it to hydrate into the
 * pinned track. It's wired with `client:visible`, so hydration doesn't start
 * until the section is scrolled into view.
 */
async function hydrateTrack(page: Page) {
  await page.goto('/');
  await page.locator(RACK_SECTION).scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-rack-track]', { timeout: 8000 });
}

/**
 * Sets scroll position to a given fraction (0..1) of the pinned track's
 * scrollable range, mirroring RackFocus's own `useTrackProgress` /
 * `scrollToItem` math: progress = (scrollY - pinStartDoc) / (trackHeight -
 * pinnedHeight), so scrollY = pinStartDoc + fraction * (trackHeight - pinH).
 *
 * The denominator used to be `trackHeight - viewportHeight`, matching what
 * the component did at the time. That was the bug: the pinned block is
 * shorter than the viewport (it starts below the fixed header), so dividing
 * by the viewport made progress saturate before the track released and left
 * dead scroll at the bottom of the section. The component now divides by the
 * distance the pinned block can actually travel, and this helper follows it —
 * measured off the sticky element rather than hardcoded, so it can't drift
 * from the component's own sizing again.
 */
async function scrollToTrackFraction(page: Page, fraction: number) {
  await page.evaluate((f) => {
    const track = document.querySelector('[data-rack-track]') as HTMLElement | null;
    if (!track) return;
    const pin = track.firstElementChild as HTMLElement | null;
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-h');
    const headerH = parseFloat(raw) || 56;
    const rect = track.getBoundingClientRect();
    const pinStartDoc = window.scrollY + rect.top - headerH;
    const pinH = pin?.offsetHeight ?? window.innerHeight;
    const denom = Math.max(1, track.offsetHeight - pinH);
    window.scrollTo(0, pinStartDoc + f * denom);
  }, fraction);
  // rAF-throttled progress update (useTrackProgress) plus one paint.
  await page.waitForTimeout(150);
}

/** Reads each name button's computed opacity and derives its defocus amount `d`. RackTrack sets `opacity = 1 - d * 0.5`, so `d = 2 * (1 - opacity)`. */
async function readNameDefocus(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-rack-name]'));
    return buttons.map((b) => 2 * (1 - parseFloat(getComputedStyle(b).opacity)));
  });
}

test.describe('rack focus section — pinned track', () => {
  test('focus position sampled at 11 scroll fractions is monotonic 0->3 with dwell plateaus at each integer', async ({
    page,
  }) => {
    await hydrateTrack(page);

    const samples: { focusIndex: number; d: number }[] = [];
    for (let i = 0; i <= 10; i++) {
      const fraction = i / 10;
      await scrollToTrackFraction(page, fraction);
      const ds = await readNameDefocus(page);
      const minD = Math.min(...ds);
      samples.push({ focusIndex: ds.indexOf(minD), d: minD });
    }

    // Monotonic, non-decreasing.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.focusIndex).toBeGreaterThanOrEqual(samples[i - 1]!.focusIndex);
    }
    expect(samples[0]!.focusIndex).toBe(0);
    expect(samples[samples.length - 1]!.focusIndex).toBe(3);

    // Dwell plateaus: every one of the 4 items is fully in focus (d ~ 0,
    // i.e. dwellEase at rest) at some sampled fraction, not just crossed
    // through mid-transition.
    const fullyFocused = new Set(samples.filter((s) => s.d < 0.05).map((s) => s.focusIndex));
    expect(fullyFocused).toEqual(new Set([0, 1, 2, 3]));
  });

  test('click-to-jump lands inside the dwell plateau for every item', async ({ page }) => {
    await hydrateTrack(page);
    const names = page.locator(RACK_SECTION).locator('[data-rack-name]');
    await expect(names).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      await names.nth(i).click();
      await page.waitForTimeout(700); // smooth-scroll settle
      const ds = await readNameDefocus(page);
      expect(ds[i]).toBeLessThan(0.05);
    }
  });

  test('keyboard traverses names, forward, backward, and wrapping', async ({ page }) => {
    await hydrateTrack(page);
    const names = page.locator(RACK_SECTION).locator('[data-rack-name]');

    await names.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    await expect(names.nth(1)).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    await expect(names.nth(2)).toBeFocused();

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(700);
    await expect(names.nth(1)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    await expect(names.nth(0)).toBeFocused();

    // Wraps at the ends.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(700);
    await expect(names.nth(3)).toBeFocused();
  });

  test('at most 2 panels are ever mounted, and exactly 1 while dwelling', async ({ page }) => {
    await hydrateTrack(page);

    const fractions = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    for (const fraction of fractions) {
      await scrollToTrackFraction(page, fraction);
      const counts = await page.evaluate(() => ({
        names: document.querySelectorAll('[data-rack-name]').length,
        panels: document.querySelectorAll('[data-rack-panel]').length,
      }));
      expect(counts.names).toBe(4);
      expect(counts.panels).toBeLessThanOrEqual(2);
    }

    // 0.05 sits well inside item 0's dwell plateau (mathematically, focus
    // stays exactly 0 for any overall progress <= 0.1 with 3 segments) —
    // comfortably clear of the segment boundary at fraction 0 itself, where
    // real-world scroll/rAF rounding can tip `crossFrac` a hair above zero
    // and mount a second, all-but-invisible panel. Confirms the "only the
    // low panel exists while dwelling" claim without being sensitive to that
    // rounding. Polled (rather than a single fixed wait) because the
    // rAF-throttled progress update can lag further behind under the full
    // suite's ~9 concurrent workers than it does running this file alone.
    await scrollToTrackFraction(page, 0.05);
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('[data-rack-panel]').length), {
        timeout: 5000,
      })
      .toBe(1);
  });

  test('pin releases after Practice and the footer is reachable', async ({ page }) => {
    await hydrateTrack(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toBeInViewport();
  });
});

/** Nothing in the rack section is blurred (a live `filter`) or fully transparent. */
async function rackHasNoBlurOrHiddenElements(page: Page): Promise<number> {
  return page.locator(RACK_SECTION).evaluate((section) => {
    const els = Array.from(section.querySelectorAll<HTMLElement>('*'));
    return els.filter((el) => {
      const cs = getComputedStyle(el);
      const hasFilter = cs.filter !== 'none' && cs.filter !== '';
      const isHidden = parseFloat(cs.opacity) === 0;
      return hasFilter || isHidden;
    }).length;
  });
}

test.describe('rack focus section — degraded modes render the static tab set', () => {
  test('reduced motion: 4 tabs, one panel, nothing blurred or at opacity 0, no pinned track', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const rackSection = page.locator(RACK_SECTION);
    await rackSection.scrollIntoViewIfNeeded();

    const tabs = rackSection.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(rackSection.locator('#rack-tabpanel')).toBeVisible();
    await expect(rackSection.locator('[data-rack-track]')).toHaveCount(0);

    expect(await rackHasNoBlurOrHiddenElements(page)).toBe(0);
  });

  test('narrow (<900px): 4 tabs, one panel, nothing blurred or at opacity 0, no pinned track', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    const rackSection = page.locator(RACK_SECTION);
    await rackSection.scrollIntoViewIfNeeded();

    const tabs = rackSection.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(rackSection.locator('#rack-tabpanel')).toBeVisible();
    await expect(rackSection.locator('[data-rack-track]')).toHaveCount(0);

    expect(await rackHasNoBlurOrHiddenElements(page)).toBe(0);
  });

  test('narrow tab set: clicking and arrow keys switch the active tab and panel', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    const rackSection = page.locator(RACK_SECTION);
    await rackSection.scrollIntoViewIfNeeded();

    const tabs = rackSection.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);

    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(rackSection.locator('#rack-tabpanel')).toContainText('Flashcards');

    await tabs.nth(2).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(3)).toBeFocused();
  });
});
