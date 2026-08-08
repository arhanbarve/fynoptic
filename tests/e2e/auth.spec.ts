import { test, expect, type Page } from '@playwright/test';

// Requires the Firebase Auth emulator running (`firebase emulators:start
// --only auth`) and the site built/served with PUBLIC_AUTH_EMULATOR set to
// the emulator's URL — see src/lib/auth.ts's guard and firebase.json.
// Characterizes lib/auth.ts + lib/auth-ui.ts against the current vanilla
// modal markup, before any React conversion.

function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correct-password-123';

async function signUp(page: Page, email: string): Promise<void> {
  await page.locator('#user-btn').click();
  await page.locator('[data-modal-switch="signup-modal"]').click();
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#signup-submit').click();
  await expect(page.locator('#signup-modal')).toBeHidden();
}

// Both #user-btn's onclick ('/profile') and #logout-btn's handler
// (logout() then location.replace('/')) navigate via script, not a plain
// <a href>. Waiting on the resulting DOM state (rather than
// page.waitForURL) survives the hard navigation without racing Playwright's
// own frame-lifecycle tracking, which under heavy parallel load can throw
// "net::ERR_ABORTED; maybe frame was detached?" on a waitForURL that starts
// right as the old frame tears down.
async function goToProfile(page: Page): Promise<void> {
  await page.locator('#user-btn').click();
  // expect(...).toPass rather than a plain assertion: a locator query mid
  // hard-navigation can reject with "execution context destroyed" under
  // heavy parallel load, and toPass retries past that instead of failing.
  await expect(async () => {
    await expect(page.locator('#logout-btn')).toBeVisible();
  }).toPass({ timeout: 10_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.locator('#logout-btn').click();
  await expect(async () => {
    await expect(page.locator('#user-btn')).toHaveAttribute('data-modal-open', 'login-modal');
  }).toPass({ timeout: 10_000 });
}

test.describe('sign up, sign in, sign out', () => {
  test('sign up creates an account and swaps the nav to initials, clearing data-modal-open', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');

    const userBtn = page.locator('#user-btn');
    await expect(userBtn).toHaveAttribute('data-modal-open', 'login-modal');

    await userBtn.click();
    await expect(page.locator('#login-modal')).toBeVisible();
    await page.locator('[data-modal-switch="signup-modal"]').click();
    await expect(page.locator('#signup-modal')).toBeVisible();

    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-password').fill(PASSWORD);
    await page.locator('#signup-confirm').fill(PASSWORD);
    await page.locator('#signup-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Account created!');
    await expect(page.locator('#signup-modal')).toBeHidden();

    await expect(userBtn).not.toHaveAttribute('data-modal-open', /.*/);
    await expect(userBtn).toHaveAttribute('aria-label', 'Your profile');
    await expect(page.locator('#nav-initials')).toBeVisible();
  });

  test('sign out from /profile redirects to / and restores the sign-in button', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await signUp(page, email);

    await goToProfile(page);
    await signOut(page);

    await expect(page.locator('#user-btn')).toHaveAttribute('data-modal-open', 'login-modal');
  });

  test('sign in with the correct password succeeds', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await signUp(page, email);
    // signUp leaves us signed in on '/'; sign out via profile, then sign back in.
    await goToProfile(page);
    await signOut(page);

    await page.locator('#user-btn').click();
    await expect(page.locator('#login-modal')).toBeVisible();
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(PASSWORD);
    await page.locator('#login-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Signed in!');
    await expect(page.locator('#login-modal')).toBeHidden();
    await expect(page.locator('#nav-initials')).toBeVisible();
  });
});

test.describe('error surfaces', () => {
  test('wrong password shows the shared credential-failure message', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await signUp(page, email);
    await goToProfile(page);
    await signOut(page);

    await page.locator('#user-btn').click();
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('totally-wrong-password');
    await page.locator('#login-submit').click();

    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toHaveText("That email or password isn't right.");
  });

  test('password reset for an unknown email still reports success (enumeration guard)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#user-btn').click();
    await page.locator('[data-modal-switch="reset-modal"]').click();
    await expect(page.locator('#reset-modal')).toBeVisible();

    await page.locator('#reset-email').fill(`no-such-account-${Date.now()}@example.com`);
    await page.locator('#reset-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Password reset link sent. Check your inbox.');
    await expect(page.locator('#reset-modal')).toBeHidden();
    await expect(page.locator('#reset-error')).toBeHidden();
  });
});

test.describe('submit locking', () => {
  test('the submit button is disabled and aria-busy while a sign-in request is in flight', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/');
    await signUp(page, email);
    await goToProfile(page);
    await signOut(page);

    // Hold the emulator's sign-in response open until this test explicitly
    // releases it, so the busy-state assertions below are never a race
    // against a fixed timeout (which flaked under heavy parallel load: a
    // real wall-clock delay competes with however long the rest of this
    // test's setup took on a loaded machine).
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      await responseGate;
      await route.continue();
    });

    await page.locator('#user-btn').click();
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(PASSWORD);

    const submit = page.locator('#login-submit');
    await submit.click();

    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toHaveText('Signing in…');

    releaseResponse();
    await expect(page.locator('.toast-container .toast')).toHaveText('Signed in!', { timeout: 5000 });
    await expect(submit).not.toHaveAttribute('aria-busy', /.*/);
  });
});
