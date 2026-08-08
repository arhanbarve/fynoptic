import { test, expect, type Page } from '@playwright/test';

// Requires the Firebase Auth emulator, same as auth.spec.ts. Characterizes
// islands/profile.ts against the current profile.astro markup — which per
// the plan's F-findings is "mostly dead code": no <form>/<input> exist on
// this page yet, so the settings-panel wiring in profile.ts is defensive
// no-ops. This spec pins what's actually reachable today.

function uniqueEmail(): string {
  return `profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correct-password-123';

async function signUpFromHome(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.locator('#user-btn').click();
  await page.locator('[data-modal-switch="signup-modal"]').click();
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#signup-submit').click();
  await expect(page.locator('#signup-modal')).toBeHidden();
}

// profile.ts navigates via `window.location.replace('/')` (a script-driven
// hard navigation, not a link), and #logout-btn's handler does the same
// after signing out. Polling for the resulting DOM state is more robust
// under parallel load than page.waitForURL, which can throw
// "net::ERR_ABORTED; maybe frame was detached?" if it starts right as the
// old frame tears down.
async function expectRedirectedHome(page: Page): Promise<void> {
  // expect(...).toPass retries the whole callback, including a rejected
  // page.evaluate() from an in-flight navigation — more resilient here
  // than expect.poll, which surfaces that rejection instead of retrying
  // past it under heavy parallel load.
  await expect(async () => {
    const path = await page.evaluate(() => location.pathname).catch(() => null);
    expect(path).toMatch(/^\/(index\.html)?$/);
  }).toPass({ timeout: 10_000 });
}

test('redirects to / when signed out', async ({ page }) => {
  await page.goto('/profile');
  await expectRedirectedHome(page);
});

test('renders name, email, provider chip, joined/last-login, and a progress ring/bar', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFromHome(page, email);

  await page.goto('/profile');
  await expect(page.locator('#prof-name')).not.toHaveText('Friend');
  await expect(page.locator('#prof-email')).toHaveText(email);
  await expect(page.locator('#chip-row')).toContainText('Email not verified');
  await expect(page.locator('#chip-row')).toContainText('Provider: password');
  await expect(page.locator('#joined-at')).not.toHaveText('—');
  await expect(page.locator('#last-login')).not.toHaveText('—');

  await expect(page.locator('#mods-done')).toHaveText('0');
  await expect(page.locator('#mods-total')).toHaveText(/4|6/); // dp-fallback (4) or legacy6 (6) depending on prior state
  await expect(page.locator('#pct-text')).toHaveText('0%');

  // #prov is a known dead element — never written by profile.ts (Appendix
  // E). Pinning the current, unhelpful state so a future fix (O5) is
  // visible as an intentional change, not a silent one.
  await expect(page.locator('#prov')).toHaveText('—');
});

test('sign out redirects to /', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFromHome(page, email);
  await page.goto('/profile');

  await page.locator('#logout-btn').click();
  await expectRedirectedHome(page);
});
