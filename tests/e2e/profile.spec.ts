import { test, expect, type Page } from '@playwright/test';

// Requires the Firebase Auth emulator, same as auth.spec.ts. Characterizes
// components/profile/Profile.tsx (formerly islands/profile.ts) against
// profile.astro, which now just mounts it. Ids and class names the base
// shell owns are unchanged by the React conversion, so those selectors
// still target the same DOM shape. The settings panel (ProfileSettings,
// O5) is a separate component wired in by the Phase 10c integration step —
// this file covers only the base shell: redirect, info display, progress,
// sign-out.

function uniqueEmail(): string {
  return `profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correct-password-123';

async function signUpFromHome(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.locator('#user-btn').click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#signup-submit').click();
  await expect(page.locator('#auth-modal')).toBeHidden();
}

// profile.ts navigates via `window.location.replace('/')` (a script-driven
// hard navigation, not a link), and #logout-btn's handler does the same
// after signing out. Polling for the resulting DOM state is more robust
// under parallel load than page.waitForURL, which can throw
// "net::ERR_ABORTED; maybe frame was detached?" if it starts right as the
// old frame tears down.
async function expectRedirectedHome(page: Page): Promise<void> {
  // page.url() is a synchronous, Playwright-tracked getter — unlike
  // page.evaluate(), it can't reject with "execution context destroyed"
  // mid-navigation, so it's safe to poll directly via toPass.
  await expect(async () => {
    expect(page.url()).not.toContain('/profile');
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

  // #prov was a known dead element under the old islands/profile.ts —
  // never written (Appendix E). O5 fixes it: Profile.tsx binds it to the
  // same provider label the chip row shows.
  await expect(page.locator('#prov')).toHaveText('password');
});

test('sign out redirects to /', async ({ page }) => {
  const email = uniqueEmail();
  await signUpFromHome(page, email);
  await page.goto('/profile');

  await page.locator('#logout-btn').click();
  await expectRedirectedHome(page);
});
