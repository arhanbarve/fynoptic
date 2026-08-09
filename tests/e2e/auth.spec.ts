import { test, expect, type Page } from '@playwright/test';

// Requires the Firebase Auth emulator running (`firebase emulators:start
// --only auth`) and the site built/served with PUBLIC_AUTH_EMULATOR set to
// the emulator's URL — see src/lib/auth.ts's guard and firebase.json.
// Characterizes lib/auth.ts against AuthDialog.tsx's three Radix-modal auth
// forms (Phase 5 replaced auth-ui.ts's template-literal markup + modal.ts's
// `data-modal-switch` delegation with openAuthDialog()-driven React state —
// the switch links below are now plain buttons, matched by their text
// rather than a data attribute that no longer exists).

function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correct-password-123';

async function signUp(page: Page, email: string): Promise<void> {
  await page.locator('#user-btn').click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#signup-submit').click();
  await expect(page.locator('#auth-modal')).toBeHidden();
}

// Both #user-btn's onclick ('/profile') and #logout-btn's handler
// (logout() then location.replace('/')) navigate via script, not a plain
// <a href>. #user-btn's markup is shared across every page (Nav.tsx),
// so checking its DOM state ALONE is not enough proof the navigation
// actually landed: auth.ts's onAuthStateChanged watcher updates
// data-modal-open on whichever page is current the instant the auth SDK
// fires, which can be the OLD page, a beat before location.replace() has
// actually swapped the frame. Waiting on page.url() (a synchronous
// Playwright-tracked getter that can't throw mid-navigation, unlike
// page.evaluate) in addition to the DOM state avoids clicking into a
// frame that's mid-teardown.
async function goToProfile(page: Page): Promise<void> {
  await page.locator('#user-btn').click();
  await expect(async () => {
    expect(page.url()).toContain('/profile');
    await expect(page.locator('#logout-btn')).toBeVisible();
  }).toPass({ timeout: 10_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.locator('#logout-btn').click();
  await expect(async () => {
    expect(page.url()).not.toContain('/profile');
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
    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.locator('#auth-tab-login')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.locator('#auth-tab-signup')).toHaveAttribute('aria-selected', 'true');

    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-password').fill(PASSWORD);
    await page.locator('#signup-confirm').fill(PASSWORD);
    await page.locator('#signup-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Account created!');
    await expect(page.locator('#auth-modal')).toBeHidden();

    await expect(userBtn).not.toHaveAttribute('data-modal-open', /.*/);
    await expect(userBtn).toHaveAttribute('aria-label', 'Your Profile');
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
    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.locator('#auth-tab-login')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(PASSWORD);
    await page.locator('#login-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Signed in!');
    await expect(page.locator('#auth-modal')).toBeHidden();
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
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(page.locator('#reset-modal')).toBeVisible();

    await page.locator('#reset-email').fill(`no-such-account-${Date.now()}@example.com`);
    await page.locator('#reset-submit').click();

    await expect(page.locator('.toast-container .toast')).toHaveText('Password reset link sent. Check your inbox.');
    await expect(page.locator('#reset-modal')).toBeHidden();
    await expect(page.locator('#reset-error')).toBeHidden();
  });
});

test.describe('auth dialog tabs (commit 6 merge: #login-modal/#signup-modal -> #auth-modal)', () => {
  test('switching tabs swaps the visible panel and moves aria-selected', async ({ page }) => {
    await page.goto('/');
    await page.locator('#user-btn').click();

    await expect(page.locator('#auth-tab-login')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#auth-tab-signup')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#auth-panel-login')).toBeVisible();
    await expect(page.locator('#auth-panel-signup')).toBeHidden();

    await page.locator('#auth-tab-signup').click();

    await expect(page.locator('#auth-tab-signup')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#auth-tab-login')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#auth-panel-signup')).toBeVisible();
    await expect(page.locator('#auth-panel-login')).toBeHidden();
  });

  test('switching tabs clears a displayed error', async ({ page }) => {
    await page.goto('/');
    await page.locator('#user-btn').click();

    // Client-side validation only — no network/emulator round trip needed
    // to produce this error.
    await page.locator('#login-submit').click();
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toHaveText('Please enter your email and password.');

    await page.locator('#auth-tab-signup').click();
    await page.locator('#auth-tab-login').click();

    await expect(page.locator('#login-error')).toBeHidden();
  });

  test('the password show/hide toggle flips input[type] between password and text', async ({ page }) => {
    await page.goto('/');
    await page.locator('#user-btn').click();

    const passwordInput = page.locator('#login-password');
    const toggle = page.getByRole('button', { name: 'Show password' });

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('#login-submit and #signup-submit are horizontally centred within .dialog (AC-6.4)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#user-btn').click();

    const dialog = page.locator('#auth-modal .dialog');

    const dialogBox1 = await dialog.boundingBox();
    const loginSubmitBox = await page.locator('#login-submit').boundingBox();
    if (!dialogBox1 || !loginSubmitBox) throw new Error('missing bounding box');
    const dialogCenter1 = dialogBox1.x + dialogBox1.width / 2;
    const loginCenter = loginSubmitBox.x + loginSubmitBox.width / 2;
    expect(Math.abs(dialogCenter1 - loginCenter)).toBeLessThanOrEqual(2);

    await page.locator('#auth-tab-signup').click();

    const dialogBox2 = await dialog.boundingBox();
    const signupSubmitBox = await page.locator('#signup-submit').boundingBox();
    if (!dialogBox2 || !signupSubmitBox) throw new Error('missing bounding box');
    const dialogCenter2 = dialogBox2.x + dialogBox2.width / 2;
    const signupCenter = signupSubmitBox.x + signupSubmitBox.width / 2;
    expect(Math.abs(dialogCenter2 - signupCenter)).toBeLessThanOrEqual(2);
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
    // Radix unmounts Dialog.Content on close (unlike the old modal.ts,
    // which only ever toggled `hidden` and left the node — and its
    // aria-busy — in the DOM), so #login-submit itself is gone by now, not
    // just un-busied. Asserting the modal is closed is the stronger, still-
    // accurate check.
    await expect(page.locator('#auth-modal')).toBeHidden();
  });
});
