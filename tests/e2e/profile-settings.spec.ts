import { test, expect, type Page, type Route } from '@playwright/test';

// Requires the Firebase Auth emulator, same as auth.spec.ts and profile.spec.ts.
// Characterizes the Phase 10c integration: ProfileSettings.tsx mounted inside
// Profile.tsx, and specifically the authStore-push contract documented in
// both files — updateProfile() doesn't fire onAuthStateChanged, so
// ProfileSettings must push the refreshed user into authStore itself or
// Nav.tsx (via useAuth()) won't reflect a same-session edit.
//
// IMPORTANT — what's real vs. mocked here:
//   - Auth (sign-up, sign-in, email verification via oobCodes) runs against
//     the real Firebase Auth emulator (`firebase emulators:exec --only auth`).
//     That emulator is pure Node and needs no JVM.
//   - Client-side validation (non-image rejection, >3MB rejection) never
//     touches the network at all — it's real, exercised end-to-end.
//   - The name-save and photo-URL-save propagation tests exercise the exact
//     same updateProfile() + authStore.set() code path a real avatar upload
//     uses, but avoid Storage entirely by using the "Photo URL" text field
//     instead of a file upload — so they're real against Auth, and simply
//     don't touch Storage.
//   - The avatar FILE upload tests (progress advancing, cancel-mid-upload)
//     are the one piece that cannot be verified against a real backend in
//     this environment: firebase.json only configures the `auth` emulator,
//     and confirmed by hand here, `firebase emulators:exec --only storage`
//     fails immediately with "Unable to locate a Java Runtime" — the Storage
//     emulator (unlike Auth) is JVM-backed, and no JVM exists in this sandbox.
//     Hitting real production Firebase Storage from CI isn't an option either
//     (no deterministic state, and the Auth emulator's ID tokens aren't
//     accepted by a real bucket's security rules). Those two tests instead
//     intercept the exact wire protocol firebase/storage's resumable upload
//     uses (X-Goog-Upload-Command start/upload/finalize) via page.route, so
//     the real uploadBytesResumable()/progress-event code in
//     ProfileSettings.tsx runs unmodified — only the HTTP responses are
//     fabricated. This is explicitly a mocked-backend test, not a real one.

function uniqueEmail(): string {
  return `settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'correct-password-123';
const PROJECT_ID = 'financefirst-ee059';
const EMULATOR_HOST = 'http://127.0.0.1:9099';
// Same 1x1 transparent PNG mockStorageUpload fulfills for real decodable-image
// responses below, as a data: URI so it decodes with no network round-trip.
const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function signUpFromHome(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.locator('#user-btn').click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#signup-submit').click();
  await expect(page.locator('#signup-modal')).toBeHidden();
}

// Real Firebase Auth emulator REST API (not mocked): every pending
// out-of-band action (email verification, password reset) is retrievable
// here. This is how the emulator's own test suites confirm an email
// without a real mailbox.
async function fetchLatestVerifyOobCode(email: string): Promise<string> {
  const res = await fetch(`${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> };
  const match = oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  if (!match) throw new Error(`No VERIFY_EMAIL oobCode found for ${email}`);
  return match.oobCode;
}

// Confirms the email the same way applyActionCode() does under the hood —
// a real call into the Auth emulator's identitytoolkit REST surface, not a
// stub of our own.
async function confirmEmail(oobCode: string): Promise<void> {
  const res = await fetch(`${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode }),
  });
  if (!res.ok) throw new Error(`confirmEmail failed: ${res.status} ${await res.text()}`);
}

// Fabricates the wire protocol firebase/storage's resumable upload uses
// (see @firebase/storage's createResumableUpload/continueResumableUpload):
//   1. POST .../o?name=... with X-Goog-Upload-Command: start
//      -> 200, X-Goog-Upload-Status: active, X-Goog-Upload-URL: <session url>
//   2. POST <session url> with X-Goog-Upload-Command: upload[, finalize]
//      -> 200, X-Goog-Upload-Status: active|final, metadata JSON when final
//   3. GET .../o/<path> (getDownloadURL's own metadata fetch)
//      -> 200, metadata JSON including downloadTokens
// All three legs are cross-origin from localhost, so OPTIONS preflights and
// Access-Control-Expose-Headers (Firebase reads its custom X-Goog-Upload-*
// response headers via getResponseHeader, which CORS hides unless exposed)
// are handled explicitly. chunkDelayMs lets a test observe an intermediate
// progress value before the upload completes.
async function mockStorageUpload(page: Page, opts: { chunkDelayMs?: number } = {}): Promise<void> {
  const chunkDelayMs = opts.chunkDelayMs ?? 0;
  const sessionUrl = 'https://firebasestorage.googleapis.com/mock-session/abc123';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'X-Goog-Upload-Status,X-Goog-Upload-URL,X-Goog-Upload-Size-Received',
  };

  await page.route('https://firebasestorage.googleapis.com/**', async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const headers = req.headers();
    const command = headers['x-goog-upload-command'];

    if (command === 'start') {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'X-Goog-Upload-Status': 'active', 'X-Goog-Upload-URL': sessionUrl },
        body: '',
      });
      return;
    }

    if (command && command.includes('upload')) {
      const isFinal = command.includes('finalize');
      if (isFinal && chunkDelayMs > 0) await new Promise((r) => setTimeout(r, chunkDelayMs));
      const metadata = {
        bucket: 'financefirst-ee059.appspot.com',
        name: 'avatars/mock-uid/mock-avatar.png',
        generation: '1',
        metageneration: '1',
        size: '307200',
        timeCreated: new Date().toISOString(),
        updated: new Date().toISOString(),
        downloadTokens: 'mock-download-token',
      };
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'X-Goog-Upload-Status': isFinal ? 'final' : 'active' },
        body: isFinal ? JSON.stringify(metadata) : '',
      });
      return;
    }

    if (req.method() === 'GET') {
      if (req.url().includes('alt=media')) {
        // The browser's own <img src> fetch of the "download URL" — a
        // different GET than getDownloadURL()'s metadata lookup below, and
        // it needs to be an actual decodable image or Nav's <img onError>
        // fires and hides it (a 1x1 transparent PNG, not the JSON body).
        const onePixelPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        );
        await route.fulfill({ status: 200, headers: { ...corsHeaders, 'Content-Type': 'image/png' }, body: onePixelPng });
        return;
      }
      // getDownloadURL()'s own metadata fetch.
      const metadata = {
        bucket: 'financefirst-ee059.appspot.com',
        name: 'avatars/mock-uid/mock-avatar.png',
        generation: '1',
        metageneration: '1',
        size: '307200',
        timeCreated: new Date().toISOString(),
        updated: new Date().toISOString(),
        downloadTokens: 'mock-download-token',
      };
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      return;
    }

    await route.continue();
  });
}

test.describe('name save propagates to nav (authStore push)', () => {
  test('saving a display name updates nav initials immediately, no reload', async ({ page }) => {
    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    // Before the save, initials derive from the email (no displayName yet).
    const initialsBefore = await page.locator('#nav-initials').textContent();

    await page.locator('#input-name').fill('Zelda Analyst');
    await page.locator('#settings-submit').click();
    await expect(page.locator('.toast-container .toast')).toHaveText('Profile updated');

    // Nav.tsx reads useAuth() -> authStore, same store ProfileSettings just
    // pushed into. If the push didn't happen, this would still show the old
    // email-derived initials until the next full onAuthStateChanged (e.g. a
    // reload) — which we deliberately never trigger here.
    await expect(page.locator('#nav-initials')).toHaveText('ZA');
    expect(await page.locator('#nav-initials').textContent()).not.toBe(initialsBefore);

    // And the header's own #prof-name updates in the same render, off the
    // same store.
    await expect(page.locator('#prof-name')).toHaveText('Zelda Analyst');
  });

  test('saving a photo URL updates the nav avatar immediately, no reload', async ({ page }) => {
    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    await expect(page.locator('#nav-avatar')).toBeHidden();
    await expect(page.locator('#nav-initials')).toBeVisible();

    // A data: URI, not a real host: Nav.tsx's <img onError> hides the avatar
    // and falls back to initials if the photo URL doesn't actually decode as
    // an image (see the mocked-upload tests below, which fulfill a real
    // decodable PNG for exactly this reason) — a live http(s) URL here would
    // 404 against a real network and make this assertion fail for a reason
    // unrelated to what this test is characterizing (the authStore-push
    // propagation, not image-loading). A data: URI loads with no network
    // round-trip at all and always decodes.
    await page.locator('#input-photo').fill(ONE_PIXEL_PNG_DATA_URL);
    await page.locator('#settings-submit').click();
    await expect(page.locator('.toast-container .toast')).toHaveText('Profile updated');

    await expect(page.locator('#nav-avatar')).toBeVisible();
    await expect(page.locator('#nav-avatar')).toHaveAttribute('src', ONE_PIXEL_PNG_DATA_URL);
    await expect(page.locator('#nav-initials')).toBeHidden();
  });
});

test.describe('avatar file validation (client-side, no network)', () => {
  test('rejects a non-image file', async ({ page }) => {
    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    await page.locator('#input-photo-file').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });

    await expect(page.locator('.form-error')).toHaveText('Please choose an image file.');
    await expect(page.locator('#input-photo-file')).toHaveValue('');
  });

  test('rejects a file over 3MB', async ({ page }) => {
    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    await page.locator('#input-photo-file').setInputFiles({
      name: 'big.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(3 * 1024 * 1024 + 1, 1),
    });

    await expect(page.locator('.form-error')).toHaveText('Image must be under 3 MB.');
    await expect(page.locator('#input-photo-file')).toHaveValue('');
  });
});

test.describe('avatar upload — mocked Storage backend (see file header)', () => {
  test('progress bar advances across chunks then the avatar updates', async ({ page }) => {
    await mockStorageUpload(page, { chunkDelayMs: 400 });

    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    // 300KB: > the SDK's 256KB resumable threshold, so this uploads as two
    // chunks (256KB, then the remaining 44KB with the finalize command) —
    // two distinct, observable progress values rather than one instant jump.
    await page.locator('#input-photo-file').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(300 * 1024, 1),
    });
    await page.locator('#settings-submit').click();

    const bar = page.locator('[role="progressbar"][aria-label="Avatar upload progress"]');
    await expect(bar).toBeVisible();

    // First chunk lands (~83% of 300KB) before the delayed finalize response
    // comes back, so this catches a real intermediate value, not just 0/100.
    await expect(async () => {
      const value = Number(await bar.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(100);
    }).toPass({ timeout: 3000 });

    await expect(page.locator('.toast-container .toast')).toHaveText('Profile updated', { timeout: 5000 });
    await expect(bar).toBeHidden();
    await expect(page.locator('#nav-avatar')).toBeVisible();
    await expect(page.locator('#nav-avatar')).toHaveAttribute(
      'src',
      /firebasestorage\.googleapis\.com.*mock-download-token/,
    );
  });

  test('canceling mid-upload stops it and surfaces an error, not a completed avatar', async ({ page }) => {
    // The chunk request is left pending forever (never fulfilled) — task.cancel()
    // rejects the SDK's own upload promise locally with storage/canceled,
    // independent of whatever the network eventually does, so no response
    // needs to ever arrive for this to be a valid assertion.
    await page.route('https://firebasestorage.googleapis.com/**', async (route: Route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Expose-Headers': 'X-Goog-Upload-Status,X-Goog-Upload-URL',
          },
          body: '',
        });
        return;
      }
      const command = req.headers()['x-goog-upload-command'];
      if (command === 'start') {
        await route.fulfill({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-Goog-Upload-Status,X-Goog-Upload-URL',
            'X-Goog-Upload-Status': 'active',
            'X-Goog-Upload-URL': 'https://firebasestorage.googleapis.com/mock-session/never-finishes',
          },
          body: '',
        });
        return;
      }
      // Chunk upload: never respond. route is left open.
    });

    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    await page.locator('#input-photo-file').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(300 * 1024, 1),
    });
    await page.locator('#settings-submit').click();

    const bar = page.locator('[role="progressbar"][aria-label="Avatar upload progress"]');
    await expect(bar).toBeVisible();

    await page.getByRole('button', { name: 'Cancel Upload' }).click();

    await expect(page.locator('.form-error')).toHaveText('Upload canceled.');
    await expect(bar).toBeHidden();
    // No avatar was ever set — nav still shows initials, not a broken/mocked image.
    await expect(page.locator('#nav-avatar')).toBeHidden();
  });
});

test.describe('verify-email button (real Auth emulator)', () => {
  test('hides once the account is verified', async ({ page }) => {
    const email = uniqueEmail();
    await signUpFromHome(page, email);
    await page.goto('/profile');

    const verifyBtn = page.getByRole('button', { name: 'Verify Email' });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();
    await expect(page.locator('.toast-container .toast')).toHaveText('Verification email sent.');

    const oobCode = await fetchLatestVerifyOobCode(email);
    await confirmEmail(oobCode);

    // ProfileSettings.tsx calls user.reload() once on mount, not on a live
    // subscription (a deliberate choice — see its comment) — so a fresh
    // mount is what picks the just-confirmed state up.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Verify Email' })).toBeHidden();
    await expect(page.locator('.settings .chip-row')).toContainText('Email verified');
  });
});
