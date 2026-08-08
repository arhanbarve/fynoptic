import { test, expect } from '@playwright/test';

// Characterization of islands/articles-browser.ts against the current
// server-rendered card grid in articles.astro, before any React conversion.

test.beforeEach(async ({ page }) => {
  await page.goto('/articles');
});

test('search filters the grid and debounces (result count updates once typing settles)', async ({ page }) => {
  const totalBefore = await page.locator('.article-card').count();
  expect(totalBefore).toBeGreaterThan(100);

  await page.locator('#search-input').fill('overdraft');
  // Debounced at 200ms — immediately after typing, the pre-filter count is
  // still showing (it hasn't had time to re-render yet).
  expect(await page.locator('#result-count').textContent()).toContain(String(totalBefore));

  // After the debounce settles, exactly one article matches this query.
  await expect(page.locator('#result-count')).toHaveText('1 result', { timeout: 1000 });

  const visibleCount = await page.locator('.article-card:not([hidden])').count();
  expect(visibleCount).toBe(1);

  // The query matches against title + blurb combined, so check both —
  // a hit can come from the blurb alone.
  const first = page.locator('.article-card:not([hidden])').first();
  const title = (await first.getAttribute('data-title')) ?? '';
  const blurb = (await first.getAttribute('data-blurb')) ?? '';
  expect(`${title} ${blurb}`.toLowerCase()).toContain('overdraft');
});

test('an empty search shows the empty state and Clear search resets it', async ({ page }) => {
  await page.locator('#search-input').fill('zzzznonexistentquery');
  await page.waitForTimeout(300);
  await expect(page.locator('#empty-state')).toBeVisible();

  await page.locator('#clear-filters').click();
  await expect(page.locator('#empty-state')).toBeHidden();
  await expect(page.locator('#search-input')).toHaveValue('');
  await expect(page.locator('#sort-select')).toHaveValue('featured');
});

test.describe('sorting', () => {
  const cases: { value: string; label: string }[] = [
    { value: 'featured', label: 'Featured order' },
    { value: 'az', label: 'Title A–Z' },
    { value: 'za', label: 'Title Z–A' },
    { value: 'short', label: 'Shortest read' },
    { value: 'long', label: 'Longest read' },
  ];

  for (const { value } of cases) {
    test(`"${value}" reorders the visible cards`, async ({ page }) => {
      const featuredFirst = await page.locator('.article-card').first().getAttribute('data-title');
      await page.selectOption('#sort-select', value);
      const afterFirst = await page.locator('.article-card').first().getAttribute('data-title');
      if (value !== 'featured') {
        // az/za/short/long should not coincidentally match featured order's
        // first card for this dataset — if they do, the sort silently no-op'd.
        expect(afterFirst).not.toBe(featuredFirst);
      } else {
        expect(afterFirst).toBe(featuredFirst);
      }
    });
  }

  test('az and za are exact reverses of each other by title', async ({ page }) => {
    await page.selectOption('#sort-select', 'az');
    const azTitles = await page.locator('.article-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-title')));

    await page.selectOption('#sort-select', 'za');
    const zaTitles = await page.locator('.article-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-title')));

    expect(zaTitles).toEqual([...azTitles].reverse());
  });
});

test('load more reveals 12 additional cards and focuses the first new one', async ({ page }) => {
  const initiallyVisible = await page.locator('.article-card:not([hidden])').count();
  expect(initiallyVisible).toBe(12);

  await page.locator('#load-more').click();
  const afterLoadMore = await page.locator('.article-card:not([hidden])').count();
  expect(afterLoadMore).toBe(24);

  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-title'));
  const thirteenthCardTitle = await page.locator('.article-card:not([hidden])').nth(12).getAttribute('data-title');
  expect(focused).toBe(thirteenthCardTitle);
});

test('"/" focuses the search input when not already typing', async ({ page }) => {
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.locator('#search-input')).toBeFocused();
});

test('arrow keys move focus between visible cards', async ({ page }) => {
  const first = page.locator('.article-card:not([hidden])').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  const second = page.locator('.article-card:not([hidden])').nth(1);
  await expect(second).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(first).toBeFocused();
});
