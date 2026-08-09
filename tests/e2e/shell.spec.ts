import { test, expect } from '@playwright/test';

// Characterization of the site shell: theme toggle, mobile drawer, scroll
// lock, and toasts. Written against the current vanilla-TS shell
// (lib/theme.ts, lib/nav.ts, lib/modal.ts, lib/toast.ts) before any React
// conversion — see Phase 1g of the implementation plan.

test.describe('theme toggle', () => {
  test('persists across navigation and sets data-theme on both <html> and <body>', async ({ page }) => {
    await page.goto('/');
    const themeBtn = page.locator('#theme-btn');

    const initial = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await themeBtn.click();
    const toggled = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(toggled).not.toBe(initial);

    const bodyTheme = await page.evaluate(() => document.body.getAttribute('data-theme'));
    expect(bodyTheme).toBe(toggled);

    await page.goto('/about');
    const afterNav = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(afterNav).toBe(toggled);
    const bodyAfterNav = await page.evaluate(() => document.body.getAttribute('data-theme'));
    expect(bodyAfterNav).toBe(toggled);
  });
});

test.describe('header height', () => {
  // AC-1.1: the header's logo box and other theme-dependent children must
  // occupy an identical border box in both themes, at every width — a
  // regression test for the 61px (dark) vs 69px (light) shift caused by the
  // light-theme plate growing the logo's content box under box-sizing:
  // content-box (see redesign.css §1.1).
  for (const width of [390, 900, 1440]) {
    test(`.header height is identical in light and dark at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');

      const darkHeight = await page.locator('.header').evaluate((el) => el.getBoundingClientRect().height);

      await page.locator('#theme-btn').click();
      const lightHeight = await page.locator('.header').evaluate((el) => el.getBoundingClientRect().height);

      expect(lightHeight).toBe(darkHeight);
    });
  }
});

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens via the toggle button', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#nav-toggle');
    const drawer = page.locator('#mobile-menu');

    await expect(drawer).toBeHidden();
    await toggle.click();
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  // Real quirk, not a design choice being tested for: once open, `.mobile-menu`
  // renders as a full-viewport overlay (0,0 to the full width/height) that
  // visually covers the toggle button itself, so a second click on #nav-toggle
  // never reaches it — the drawer intercepts the click. Closing only works via
  // Escape, a link tap inside the drawer, or the drawer's own "X" (all covered
  // by the other tests below). `nav.ts`'s toggle handler still runs — it's
  // simply unreachable through normal pointer input once the drawer is open.
  test('a second click on the toggle cannot reach it once the drawer covers the viewport', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#nav-toggle');
    const drawer = page.locator('#mobile-menu');
    await toggle.click();
    await expect(drawer).toBeVisible();

    const toggleBox = await toggle.boundingBox();
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).toBeTruthy();
    expect(toggleBox).toBeTruthy();
    // The drawer's box fully contains the toggle's box.
    expect(drawerBox!.x).toBeLessThanOrEqual(toggleBox!.x);
    expect(drawerBox!.y).toBeLessThanOrEqual(toggleBox!.y);
    expect(drawerBox!.x + drawerBox!.width).toBeGreaterThanOrEqual(toggleBox!.x + toggleBox!.width);
    expect(drawerBox!.y + drawerBox!.height).toBeGreaterThanOrEqual(toggleBox!.y + toggleBox!.height);
  });

  test('closes on a link tap inside the drawer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#nav-toggle').click();
    const drawer = page.locator('#mobile-menu');
    await expect(drawer).toBeVisible();

    await drawer.locator('a[href="/about"]').click();
    await page.waitForURL('**/about');
  });

  test('closes on Escape', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#nav-toggle');
    const drawer = page.locator('#mobile-menu');
    await toggle.click();
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('closes via the drawer\'s own close (X) button', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('#nav-toggle');
    const drawer = page.locator('#mobile-menu');
    await toggle.click();
    await expect(drawer).toBeVisible();

    await drawer.locator('.menu-close').click();
    await expect(drawer).toBeHidden();
  });

  test('locks scroll with no-scroll + fixed body while open, and restores scroll position on close', async ({ page }) => {
    await page.goto('/');
    // Scroll down first so there's a position to restore.
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await page.locator('#nav-toggle').click();
    await expect(page.locator('body')).toHaveClass(/no-scroll/);
    const position = await page.evaluate(() => getComputedStyle(document.body).position);
    expect(position).toBe('fixed');

    // Close via Escape, not a second toggle click — see the note above on
    // why the toggle itself is unreachable once the drawer is open.
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
    // The point being characterized is that it restores near the original
    // position rather than snapping back to 0 — some drift is expected
    // (layout reflow/webfont shift while the body was position:fixed), so
    // poll with a generous tolerance instead of asserting an exact pixel.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 2000 })
      .toBeGreaterThan(before * 0.5);
  });
});

test.describe('toasts', () => {
  test('shows a toast and it self-removes after ~3.5s', async ({ page }) => {
    await page.goto('/practice');
    // Step 1 -> Step 2 needs no validation; Step 2 -> Step 3 requires at
    // least one topic selected, which triggers showToast().
    await page.locator('#wiz-next-1').click();
    await page.locator('#wiz-next-2').click();

    const toast = page.locator('.toast-container .toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Please select at least one unit.');

    await expect(toast).toBeHidden({ timeout: 5000 });
  });
});
