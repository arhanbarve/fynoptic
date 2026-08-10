# Firebase — manual setup steps only you can do

Everything fixable in code has been fixed. This file lists what's left, all of which lives in
the Firebase Console, your DNS, or your hosting setup — I can't reach any of it from here.

Project: `financefirst-ee059` · Site: `fynoptic.org` (**Vercel**) · SDK: Firebase JS 12.17.1

> Hosting moved from GitHub Pages to Vercel (`vercel.json` at the repo root; responses carry a
> `server: Vercel` header). Several notes below were written against GitHub Pages and said
> things were impossible that Vercel does natively — §6 in particular. Corrected inline.

Items are ordered by how badly they bite you. **1 and 2 are the ones that can leave sign-in
broken or your storage bucket wide open — do those first.**

---

## 1. Verify `fynoptic.org` is an authorized domain — REQUIRED

If your production domain isn't on this list, every Google sign-in attempt dies with
`auth/unauthorized-domain` and nothing else works. Check it even if sign-in seems fine today,
because the list is per-project and easy to lose track of.

1. [Firebase Console](https://console.firebase.google.com/) → project **financefirst-ee059**
2. **Authentication** → **Settings** tab → **Authorized domains**
3. Confirm all of these are present, and add any that are missing:
   - `fynoptic.org`
   - `www.fynoptic.org` (if you serve it)
   - `financefirst-ee059.firebaseapp.com` (leave it — it's the auth helper domain)
   - `localhost` (for local testing)

The new code maps this failure to a readable message instead of a raw Firebase string, so if
it *is* misconfigured you'll now see "This site isn't authorized for sign-in" rather than
silence. But it still won't work until you add the domain.

## 2. Lock down Cloud Storage rules — SECURITY

`js/profile.js` uploads avatars to `avatars/{uid}/{timestamp}-{filename}`. If your Storage
rules are still in test mode (`allow read, write: if true`), **anyone on the internet can write
to your bucket** and fill it at your expense.

1. Console → **Storage** → **Rules**
2. Replace with rules that scope writes to the owner and cap file size:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 3 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

3. **Publish**

The 3 MB / image-type checks mirror the client-side validation in `js/profile.js:172-173`.
Client-side checks are a UX nicety; only rules actually stop anyone.

Note: the `apiKey` in `js/auth.js` is *supposed* to be public — Firebase web API keys are
identifiers, not secrets. Your actual security perimeter is Authorized domains (step 1) plus
Storage/Firestore rules (this step). Don't waste time trying to hide the key.

## 3. Turn on email enumeration protection — SECURITY

Without this, the error codes Firebase returns let anyone test whether a given email has an
account on your site.

1. Console → **Authentication** → **Settings** → **User actions**
2. Enable **Email enumeration protection**

The new code already refuses to leak this — `invalid-credential`, `wrong-password`, and
`user-not-found` all render the same message ("That email or password isn't right."), and the
new password-reset flow reports success even for unknown addresses. Enabling the setting closes
the gap at the API level too, so a script hitting Firebase directly learns nothing either.

## 4. Check the password reset email template — REQUIRED for the new feature

The site had **no password recovery at all** before this change. The code now calls
`sendPasswordResetEmail`, but the email itself is Firebase's default and will come from a
`firebaseapp.com` address with generic wording.

1. Console → **Authentication** → **Templates** → **Password reset**
2. Edit the sender name to "Fynoptic" and adjust the subject/body wording
3. Optional but recommended: set a **custom domain** for the sender so the mail comes from
   `fynoptic.org` and stops landing in spam. This needs DNS records (SPF/DKIM) that the
   console will show you.
4. Send yourself a test reset from the live site and confirm the link works end-to-end.

Also confirm **Email/Password** is enabled under **Authentication → Sign-in method** — the
signup and reset flows both depend on it.

## 4b. Rename the project so sign-in stops saying "Finance First" — CONSOLE ONLY

The Google sign-in screen reads "continue to **Finance First**". That string is not in the
repo — grep for it and you get nothing. It lives in three console places, all separate:

1. **The sign-in consent screen.** [Google Cloud Console](https://console.cloud.google.com/)
   → project `financefirst-ee059` → **APIs & Services** → **OAuth consent screen** → *App
   name*. This is the one users read. Set it to `Fynoptic`.
2. **The Firebase project display name.** Firebase Console → ⚙ **Project settings** →
   **General** → *Project name*. Cosmetic, but it feeds several other surfaces.
3. **Password reset emails.** Firebase Console → **Authentication** → **Templates** → sender
   name (see §4 above, still outstanding).

The project **ID** — `financefirst-ee059` — is permanent. Google does not allow renaming it,
and it appears in `apiKey`/`storageBucket`/`appId` in `src/lib/auth.ts`. Changing the display
names above does not touch it, and nothing breaks.

The domain that used to appear beneath the app name on that same screen
(`financefirst-ee059.firebaseapp.com`) is handled by §6 below, which is now done.

## 5. Google provider support email

Console → **Authentication** → **Sign-in method** → **Google** → confirm a **support email**
is set. Google shows it on the consent screen; a missing one can make the provider misbehave.

## 6. Custom auth domain — DONE

**Status: done and verified.** `authDomain` is `fynoptic.org`. The Google sign-in screen reads
"Sign in to continue to **fynoptic.org**" — no `financefirst` anywhere on it.

> ⚠️ **History worth keeping.** This was switched on in `87e13a0` and reverted in `6897c29`
> ten minutes later, because Google sign-in died with **`Error 400: redirect_uri_mismatch`**.
> It went back on only after the OAuth client was fixed and the popup was driven end to end
> against Google.
>
> Firebase builds the Google OAuth redirect URI out of `authDomain` —
> `https://<authDomain>/__/auth/handler` — and auto-registers it in the project's OAuth
> client **for its own firebaseapp.com domain only**. Point `authDomain` at a custom domain
> and the popup starts asking Google for `https://fynoptic.org/__/auth/handler`, which is not
> on the client's Authorized redirect URIs, so Google rejects the request before the consent
> screen renders.
>
> The check that made it look safe — `https://fynoptic.org/__/auth/handler` returning 200 —
> is necessary but **not sufficient**. Serving the helper page and being *allowed to redirect
> to it* are two different things. Don't take a 200 there as proof again.

### What made it work (and what to redo if it ever regresses)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=financefirst-ee059)
   → **APIs & Services** → **Credentials** → the **Web** OAuth 2.0 Client ID for this project
2. **Authorized redirect URIs** must contain **both**:
   - `https://financefirst-ee059.firebaseapp.com/__/auth/handler` ← do not delete, it's the fallback
   - `https://fynoptic.org/__/auth/handler` ← added 2026-08-09
3. `USE_CUSTOM_AUTH_DOMAIN = true` in `src/lib/auth.ts`
4. The `/__/auth/:path*` rewrite in `vercel.json`

Order matters: 3 before 2 is what broke it the first time.

### How to actually verify it, if you change any of the above

Do not just curl `/__/auth/handler` and call a 200 proof — it was 200 the whole time sign-in
was broken. Drive the popup and read what Google returns:

```js
// against a local `npm run preview`, so production is never the test subject
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://localhost:4321');
await page.locator('#user-btn').click();
const popup = await Promise.all([ctx.waitForEvent('page'), page.locator('#google-login').click()])
  .then(([p]) => p);
await popup.waitForTimeout(4000);
console.log(popup.url(), await popup.evaluate(() => document.body.innerText));
```

Pass looks like `accounts.google.com` and "Sign in to continue to fynoptic.org".
Fail looks like `Error 400: redirect_uri_mismatch`. `localhost` is already an authorized
domain, so this works without deploying anything.

### What it buys you, once finished

Everything below the next heading was written when the site was on GitHub Pages, which
couldn't do rewrites. Vercel can, so the route the old table marked ❌ is the one this is
built on. The rewrite half is deployed and working; only the flag is waiting on the OAuth
client step above:

```jsonc
// vercel.json
"rewrites": [
  { "source": "/__/auth/:path*",
    "destination": "https://financefirst-ee059.firebaseapp.com/__/auth/:path*" }
]
```

That is Firebase's documented reverse-proxy setup, and it buys two things:

- The Google consent screen no longer shows `financefirst-ee059.firebaseapp.com` beneath the
  app name — it shows `fynoptic.org`.
- `signInWithRedirect()` becomes viable, because the auth iframe is same-origin now. The code
  still uses popup only; switching is a separate change and popup works fine.

Two console prerequisites, not one. `fynoptic.org` under **Authorized domains** was already
satisfied (popup sign-in from this origin works). The second — `https://fynoptic.org/__/auth/handler`
under the OAuth client's **Authorized redirect URIs** — was not, and is the step above.

**If Google sign-in breaks, check both, in this order:**

1. `Error 400: redirect_uri_mismatch` → the OAuth client is missing the redirect URI. Either
   add it (steps above) or set `USE_CUSTOM_AUTH_DOMAIN = false` and redeploy.
2. `https://fynoptic.org/__/auth/handler` returning 404 → the vercel.json rewrite is gone.
   Same one-line fallback.

A 200 at that URL proves the rewrite is live. It does **not** prove sign-in works — that was
the mistaken inference the first time round.

### Historical: why redirect used to be disabled in code

`signInWithRedirect()` works by loading a cross-origin iframe from your `authDomain`. Chrome
and Safari now block third-party storage access, so that iframe fails whenever `authDomain`
(`financefirst-ee059.firebaseapp.com`) differs from the site's domain (`fynoptic.org`) — which
is exactly your setup. Firebase documents this directly:

> The `signInWithRedirect()` flow uses a cross-origin iframe, which can be blocked by browsers
> that restrict third-party storage access. This issue affects apps hosted on Firebase Hosting
> with a custom domain [...] or apps hosted with other services.
> — [Redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)

The old code used redirect as its popup fallback, so a user with popups blocked got bounced
back to the site still signed out, with no error shown. That fallback is now **removed**;
Google sign-in is popup-only and popup failures produce an actionable message. This is
Firebase's own recommended option for your situation, and it needs zero console work.

### If you still want redirect

Firebase offers three routes. This table was accurate on GitHub Pages and is kept for the
reasoning; on Vercel the third row is a ✅ and is what the site now does (see the top of §6):

| Route | Works on GitHub Pages? |
|---|---|
| Keep using popup (current) | ✅ Already done |
| Serve the site from Firebase Hosting, set `authDomain: 'fynoptic.org'` | ❌ Requires migrating hosting off GitHub Pages |
| Reverse-proxy `/__/auth/**` → `financefirst-ee059.firebaseapp.com` | ❌ on GitHub Pages (it fronts with Fastly/Varnish and gives you no config) · ✅ on Vercel — **this is what's in use now** |

So to get redirect working you'd need to change where the site is served from. Two viable paths:

**Path A — put Cloudflare in front of GitHub Pages** (keeps your current deploy flow)
1. Move `fynoptic.org` DNS to Cloudflare (change nameservers at your registrar)
2. Keep GitHub Pages as the origin
3. Add a Cloudflare **Origin Rule** or **Worker** proxying `/__/auth/*` to
   `https://financefirst-ee059.firebaseapp.com/__/auth/*` — the equivalent of this Nginx block
   from the Firebase docs:
   ```nginx
   location /__/auth {
     proxy_pass https://financefirst-ee059.firebaseapp.com;
   }
   ```
4. Verify `https://fynoptic.org/__/auth/handler` loads Firebase's helper page
5. **Only then** open `js/auth.js` and flip the flag at the top:
   ```js
   const USE_CUSTOM_AUTH_DOMAIN = true;
   ```
6. Add `fynoptic.org` under Authorized domains (step 1) if you haven't

**Path B — migrate hosting to Firebase Hosting**
1. `firebase init hosting` in the repo, deploy, point `fynoptic.org` at Firebase Hosting
2. Firebase Hosting serves `/__/auth/**` automatically
3. Flip `USE_CUSTOM_AUTH_DOMAIN = true` in `js/auth.js`

> ⚠️ **Do not flip that flag before the `/__/auth/handler` URL actually resolves on
> `fynoptic.org`.** Popup sign-in also routes through `authDomain`, so setting it to a domain
> that doesn't serve the helper breaks Google sign-in *entirely* — worse than today. Load
> `https://fynoptic.org/__/auth/handler` in a browser and confirm you get Firebase's page,
> not a 404, before changing the flag.

## 7. Optional: App Check

Stops people using your Firebase project from outside your site. Console → **App Check** →
register the web app with reCAPTCHA v3. Requires adding the App Check SDK to `js/auth.js` and
a site key — tell me if you want it and I'll wire it up.

---

## Quick checklist

- [ ] 1. `fynoptic.org` in Authorized domains
- [ ] 2. Storage rules scoped to `request.auth.uid` (not test mode)
- [ ] 3. Email enumeration protection enabled
- [ ] 4. Password reset template branded + tested end-to-end
- [ ] 5. Google provider support email set
- [ ] 6. Redirect sign-in — skip unless you want it
- [ ] 7. App Check — optional hardening
