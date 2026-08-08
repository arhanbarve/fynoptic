// Port of the auth-overhaul branch's js/auth.js. Firebase 12.17.1 via the npm
// package instead of gstatic CDN URLs; same config, same behavior.
//
// Google sign-in is popup-only. signInWithRedirect cannot work while authDomain
// sits on a different origin than the site (financefirst-ee059.firebaseapp.com
// vs fynoptic.org) — browsers that block third-party storage access fail the
// cross-origin iframe silently. See FIREBASE_SETUP.md #6 for the path to enable
// redirect (Cloudflare proxy or move hosting), and the USE_CUSTOM_AUTH_DOMAIN
// flag below, which must stay false until that infra exists.

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

// Flip to true ONLY after completing the steps in FIREBASE_SETUP.md (Firebase
// Console -> Authentication -> Settings -> Authorized domains + custom auth
// domain, plus DNS). Turning this on before DNS resolves breaks Google sign-in.
const USE_CUSTOM_AUTH_DOMAIN = false;

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
(async () => {
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

// Initials from a display name, else the local part of the email. Two
// characters max.
function initialsFrom(user: User | null): string {
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

// Toggle the two children the nav markup already contains. Never write
// innerHTML on #user-btn — that destroyed #nav-avatar and #nav-initials on
// every state change.
function showAvatar(photoURL: string | null | undefined, user: User | null): void {
  const img = document.getElementById('nav-avatar') as HTMLImageElement | null;
  const initials = document.getElementById('nav-initials');

  // Fall back to initials. Unbinds onerror and drops the src first, so a photo
  // that fails to load can't re-enter this from its own error handler.
  const useInitials = (): void => {
    if (img) {
      img.onerror = null;
      img.hidden = true;
      img.removeAttribute('src');
    }
    if (initials) {
      initials.hidden = false;
      initials.textContent = initialsFrom(user);
    }
  };

  if (photoURL && img) {
    // Rebound every call: the handler closes over this call's user, and last
    // call's handler is gone before the new src starts loading. A dead
    // photoURL (Google photo 404 after the user removes theirs) then shows
    // initials, not a broken icon.
    img.onerror = useInitials;
    img.hidden = false;
    if (initials) initials.hidden = true;
    img.src = photoURL; // last, so the fallback always wins the visibility flip
    return;
  }

  useInitials();
}

// Reflect auth state in the header button.
export function initAuthWatcher(): void {
  onAuthStateChanged(auth, (user) => {
    const btn = document.getElementById('user-btn');
    const img = document.getElementById('nav-avatar') as HTMLImageElement | null;
    const initials = document.getElementById('nav-initials');
    if (!btn) return;

    if (user) {
      btn.removeAttribute('data-modal-open');
      btn.setAttribute('aria-label', 'Your profile');
      btn.onclick = () => {
        window.location.href = '/profile';
      };
      showAvatar(user.photoURL, user);
    } else {
      if (img) {
        img.hidden = true;
        // Drop the URL too, so a signed-out browser isn't left holding the
        // last user's photo. The onerror goes with it — it closes over the
        // user who just signed out.
        img.onerror = null;
        img.removeAttribute('src');
      }
      if (initials) {
        initials.hidden = true;
        initials.textContent = '';
      }
      btn.setAttribute('data-modal-open', 'login-modal');
      btn.setAttribute('aria-label', 'Sign in');
      btn.onclick = null;
    }
  });

  // profile island dispatches this after a photo change. A null/empty
  // photoURL means the avatar was cleared: fall back to initials instead of
  // leaving a stale image up.
  window.addEventListener('avatar-updated', (e) => {
    const detail = (e as CustomEvent<{ photoURL?: string | null }>).detail;
    showAvatar(detail?.photoURL, auth.currentUser);
  });
}
