// Port of the auth-overhaul branch's js/auth.js. Firebase 12.17.1 via the npm
// package instead of gstatic CDN URLs; same config, same behavior.
//
// authDomain now sits on the site's own origin (fynoptic.org), served by the
// `/__/auth/:path*` rewrite in vercel.json which proxies to
// financefirst-ee059.firebaseapp.com. That is Firebase's documented
// reverse-proxy route, and it does two things: the Google consent screen stops
// showing "financefirst-ee059.firebaseapp.com" under the app name, and the
// third-party-storage problem that made signInWithRedirect unusable goes away,
// since the auth iframe is no longer cross-origin.
//
// Sign-in is still popup-only here — enabling redirect is a separate change and
// popup works fine. See FIREBASE_SETUP.md #6.

import { FirebaseError, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';

import { createStore } from './store';

// True since the vercel.json `/__/auth/:path*` rewrite landed. The one thing
// this depends on is that https://fynoptic.org/__/auth/handler serves
// Firebase's helper page rather than a 404 — popup sign-in routes through
// authDomain too, so pointing this at a domain that doesn't serve the helper
// breaks Google sign-in entirely. If that URL ever stops resolving (rewrite
// removed, hosting moved), set this back to false and sign-in keeps working
// off the firebaseapp.com domain.
//
// fynoptic.org was already in Firebase Console -> Authentication -> Settings
// -> Authorized domains (popup sign-in from this origin has been working), so
// the proxy route needed no console change.
const USE_CUSTOM_AUTH_DOMAIN = true;

// Public client config, not a secret.
const firebaseConfig = {
  apiKey: 'AIzaSyAGkg7sRXZBL7sqXsN_45qvY55ixE2jCKQ',
  authDomain: USE_CUSTOM_AUTH_DOMAIN ? 'fynoptic.org' : 'financefirst-ee059.firebaseapp.com',
  projectId: 'financefirst-ee059',
  storageBucket: 'financefirst-ee059.appspot.com',
  messagingSenderId: '784511465100',
  appId: '1:784511465100:web:939286cdcb6fa89e84ada9',
  measurementId: 'G-0ER63Z21GK',
};

const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Test-only seam (tests/e2e/auth.spec.ts, tests/e2e/profile.spec.ts): when
// PUBLIC_AUTH_EMULATOR is set to the emulator's URL (e.g.
// "http://127.0.0.1:9099"), point auth at the local Firebase Auth emulator
// instead of the real project. Unset in every real deployment, so
// production behavior is byte-identical to before this guard existed.
if (import.meta.env.PUBLIC_AUTH_EMULATOR) {
  connectAuthEmulator(auth, import.meta.env.PUBLIC_AUTH_EMULATOR, { disableWarnings: true });
}

async function setUpPersistence(): Promise<void> {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {
      await setPersistence(auth, browserSessionPersistence);
    }
  }
}

function googleSignIn(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider(); // created inside to avoid instance mismatch
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

// Plain-English text for the Firebase codes we can actually hit. Users never
// see "Firebase: Error (auth/...)".
const CREDENTIAL_FAILED = "That email or password isn't right.";
const ERROR_MESSAGES: Record<string, string> = {
  // One shared message for all three credential failures, so the form can't be
  // used to discover which emails have accounts.
  'auth/invalid-credential': CREDENTIAL_FAILED,
  'auth/wrong-password': CREDENTIAL_FAILED,
  'auth/user-not-found': CREDENTIAL_FAILED,
  'auth/invalid-email': "That doesn't look like a valid email address.",
  'auth/email-already-in-use': 'An account with that email already exists. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': 'The sign-in window closed before you finished. Please try again.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/network-request-failed': "We couldn't reach the network. Check your connection and try again.",
  'auth/user-disabled': 'This account has been disabled. Contact support if that is a mistake.',
  'auth/missing-password': 'Please enter your password.',
  'auth/operation-not-allowed': "That sign-in method isn't enabled for this site.",
  'auth/unauthorized-domain': "Sign-in isn't allowed from this address yet.",
};

export function errorMessage(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : undefined;
  return (code && ERROR_MESSAGES[code]) || 'Something went wrong. Please try again.';
}

export function loginWithGoogle(): Promise<UserCredential> {
  return googleSignIn();
}

export function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export function logout(): Promise<void> {
  return signOut(auth);
}

// Boot order matters: persistence has to be settled before Firebase finishes a
// redirect, and "auth-ready" only fires once both are done. Firing it early was
// the old race.
//
// Phase 4: this used to be a module-level async IIFE, which touched `window`
// at import time and broke SSR for anything that statically imports this
// module. Now it's an idempotent, lazily-invoked function instead: the setup
// body runs at most once per page load (guarded by authReadyPromise); every
// call — concurrent or later — gets that same promise. Not auto-invoked here.
// Nav.tsx kicks it off from a mount effect (it's on every page via
// `<Nav client:load />`); AuthDialog.tsx also awaits it before every submit,
// which is a no-op await once the cached promise above has already settled.
let authReadyPromise: Promise<void> | null = null;

export function ensureAuthReady(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      try {
        await setUpPersistence();
      } catch (err) {
        console.error('Auth persistence setup failed:', err);
      }

      try {
        // Legacy path: completes a redirect started by an older build of the site.
        // New sign-ins use popups only.
        await getRedirectResult(auth);
      } catch (err) {
        console.error('Redirect sign-in failed:', errorMessage(err), err);
      }

      window.dispatchEvent(new Event('auth-ready'));
    })();
  }
  return authReadyPromise;
}

// Initials from a display name, else the local part of the email. Two
// characters max.
// Exported (Phase 5) so Nav.tsx and Profile.tsx can render this off
// useAuth() without duplicating the logic.
export function initialsFrom(user: User | null): string {
  const base = (user?.displayName || user?.email || '').trim();
  if (!base) return '?';
  const name = base.includes('@') ? base.split('@')[0]! : base;
  return name
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Phase 4: state substrate for React consumers (Nav.tsx, Profile.tsx via
// useAuth()). Fed by a single onAuthStateChanged subscription, started here
// at module scope instead of behind an explicit init call — this module is
// never imported by an SSR'd component (see the emulator guard above and I5
// in the implementation plan), so there's no window/document hazard in
// starting it eagerly, and every consumer needs it live from the moment they
// mount. Phase 11 folded in what used to be a separate initAuthStore(),
// itself only ever invoked by the now-deleted initAuthWatcher(); Nav.tsx
// calls ensureAuthReady() from its own mount effect to replace the other
// half of what that function did (see ensureAuthReady's doc comment).
//
// Replaces two things that used to run alongside this: a second
// onAuthStateChanged subscription in initAuthWatcher() that wrote #user-btn's
// DOM directly (Nav.tsx renders that button itself off useAuth() now), and
// an 'avatar-updated' window event profile.ts dispatched for the same
// button — Phase 10c's ProfileSettings.tsx pushes a saved user straight into
// authStore instead (see its save handler), so there's no gap between an
// in-place updateProfile() call and the nav reflecting it.
export const authStore = createStore<{ user: User | null; status: 'loading' | 'in' | 'out' }>({
  user: null,
  status: 'loading',
});

onAuthStateChanged(auth, (user) => {
  authStore.set({ user, status: user ? 'in' : 'out' });
});
