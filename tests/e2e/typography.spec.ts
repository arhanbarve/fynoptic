import { test, expect } from '@playwright/test';

// Phase 3 (type system) split the old single --display-face (Spectral) into
// --display-face (Helvetica, sans headings/titles), --editorial-face
// (Spectral, long-form reading content), --wordmark-face (an alias of
// --editorial-face, for the logo), and --mono-face. This spec pins the
// computed font-family each token-consuming selector resolves to, and
// confirms the retired @fontsource-variable/sora package never gets
// requested by any page.

test.describe('Phase 3 type system', () => {
  test('logo wordmark renders in Spectral', async ({ page }) => {
    await page.goto('/');
    const fontFamily = await page
      .locator('.logo-text')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Spectral');
  });

  test('a nav link renders in Inter', async ({ page }) => {
    await page.goto('/');
    const fontFamily = await page
      .locator('#desktop-nav a')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Inter');
  });

  test('article browse card title (.art-title) renders in Helvetica, not the editorial serif', async ({
    page,
  }) => {
    await page.goto('/articles');
    const fontFamily = await page
      .locator('.art-title')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Helvetica');
  });

  test('article reader title and body subheads render in Spectral', async ({ page }) => {
    // account-lifecycle-hygiene is one of the articles whose body markdown
    // contains an <h3>, needed to exercise the `.reader-body h3` rule.
    await page.goto('/articles/account-lifecycle-hygiene');

    const titleFont = await page
      .locator('.reader-title')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(titleFont).toContain('Spectral');

    const h3Font = await page
      .locator('.reader-body h3')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h3Font).toContain('Spectral');
  });

  test('never requests the retired Sora font on any page', async ({ page }) => {
    const soraRequests: string[] = [];
    page.on('request', (req) => {
      if (/sora/i.test(req.url())) soraRequests.push(req.url());
    });

    const routes = [
      '/',
      '/articles',
      '/articles/account-lifecycle-hygiene',
      '/flashcard',
      '/practice',
      '/courses',
      '/courseone',
      '/about',
      '/bot',
    ];
    for (const route of routes) {
      await page.goto(route);
    }

    expect(soraRequests).toEqual([]);
  });
});
