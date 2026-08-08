import { test, expect } from '@playwright/test';

// Characterization of the read-marking feature (O4, Phase 10b-2): visiting
// an article records its id in ff_articles_read, the browse grid reflects
// that with an .is-read class + visible "Read" badge, and the unread-only
// filter uses the same state.

const STORAGE_KEY = 'ff_articles_read';
// First article in ARTICLE_META (src/data/articles.ts), so it's always on
// the browse grid's first page under the default "featured order" sort.
const ARTICLE_ID = 'bnpl-real-rules';
const ARTICLE_URL = `/articles/${ARTICLE_ID}`;

async function getReadIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), STORAGE_KEY);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/articles');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
});

test('visiting an article marks it as read', async ({ page }) => {
  await page.goto(ARTICLE_URL);
  await expect.poll(() => getReadIds(page)).toEqual([ARTICLE_ID]);
});

test('the mark survives a reload and is never duplicated', async ({ page }) => {
  await page.goto(ARTICLE_URL);
  await expect.poll(() => getReadIds(page)).toEqual([ARTICLE_ID]);

  await page.reload();
  await expect.poll(() => getReadIds(page)).toEqual([ARTICLE_ID]);
});

test('the browse page shows a Read marker for a visited article', async ({ page }) => {
  await page.goto(ARTICLE_URL);
  await expect.poll(() => getReadIds(page)).toContain(ARTICLE_ID);

  await page.goto('/articles');
  const card = page.locator(`.article-card[href="${ARTICLE_URL}"]`);
  await expect(card).toHaveClass(/is-read/);
  await expect(card.locator('.art-read-badge')).toBeVisible();

  // An article never visited this session gets no marker.
  const unread = page.locator('.article-card').nth(1);
  await expect(unread).not.toHaveClass(/is-read/);
  await expect(unread.locator('.art-read-badge')).toBeHidden();
});

test('the unread-only filter hides read articles and keeps unread ones', async ({ page }) => {
  await page.goto(ARTICLE_URL);
  await page.goto('/articles');

  const unreadToggle = page.locator('#unread-toggle');
  await unreadToggle.click();
  await expect(unreadToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(unreadToggle).toHaveClass(/is-active/);

  // The grid pages via the `hidden` IDL property (see ArticlesBrowser.tsx),
  // not actual paint visibility — a page-wide `.article-card { display:
  // block }` rule outranks the UA's `[hidden] { display: none }` in the
  // cascade (author beats user-agent regardless of specificity), so the
  // existing suite also asserts on the property/attribute rather than
  // toBeHidden()/toBeVisible().
  const readCard = page.locator(`.article-card[href="${ARTICLE_URL}"]`);
  await expect(readCard).toHaveJSProperty('hidden', true);

  const visibleHrefs = await page
    .locator('.article-card:not([hidden])')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(visibleHrefs.length).toBeGreaterThan(0);
  expect(visibleHrefs).not.toContain(ARTICLE_URL);

  // Toggling back off restores the read article to the grid.
  await unreadToggle.click();
  await expect(unreadToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(readCard).toHaveJSProperty('hidden', false);
});

test('clearing storage resets the read state back to nothing', async ({ page }) => {
  await page.goto(ARTICLE_URL);
  await expect.poll(() => getReadIds(page)).toEqual([ARTICLE_ID]);

  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.goto('/articles');

  const card = page.locator(`.article-card[href="${ARTICLE_URL}"]`);
  await expect(card).not.toHaveClass(/is-read/);
  await expect(card.locator('.art-read-badge')).toBeHidden();
});
