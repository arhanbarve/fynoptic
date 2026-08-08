// Replaces auth-ui.ts's injectAuthModals()/initAuthUI() wholesale: three
// auth modals that used to be built from a template literal and appended to
// document.body at runtime (no .astro file ever contained this markup) are
// now three <Modal> instances driven by authDialogStore. `noValidate` is
// deliberate, same as before: the inline role="alert" errors below replace
// the browser's native validation bubbles.

import { useEffect, useState, type SubmitEvent } from 'react';
import { Modal, ModalClose } from '@/components/ui/Modal';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { closeAuthDialog, openAuthDialog } from '@/lib/auth-dialog';
import {
  ensureAuthReady,
  errorMessage,
  loginWithEmail,
  loginWithGoogle,
  resetPassword,
  signUpWithEmail,
} from '@/lib/auth';
import { showToast } from '@/lib/toast';
import { track } from '@/lib/track';

// Same bound as auth-ui.ts's onAuthReady(): a stalled Firebase load must not
// leave a submit silently hanging forever.
const AUTH_READY_TIMEOUT_MS = 8000;
const AUTH_UNAVAILABLE_MESSAGE = 'Sign-in is unavailable right now. Please reload the page.';

// Races the idempotent ensureAuthReady() (Phase 4) against the timeout.
// Resolves true once Firebase is actually ready, false if the timeout wins.
// Because ensureAuthReady()'s promise is cached after its first call, this
// resolves immediately on every submit after the first successful wait.
function waitForAuthReady(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, AUTH_READY_TIMEOUT_MS);
    ensureAuthReady().then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

// Mirrors auth-ui.ts's withSubmitLock, but scoped to one button's own state
// instead of a DOM node — each call site gets an independent lock, matching
// the old per-button `btn.disabled` guard (so, e.g., the Google button and
// the email submit button never fight over one flag).
function useSubmitLock(): [boolean, (task: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>): Promise<void> => {
    if (busy) return; // a request is already in flight
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

function LoginModal({ open }: { open: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [signingIn, runSignIn] = useSubmitLock();
  const [googleBusy, runGoogle] = useSubmitLock();

  // Stale validation/auth errors must never survive an open or a close —
  // same as modal.ts's clearFormErrors() on every openModalElement/closeModalElement.
  useEffect(() => {
    setError('');
  }, [open]);

  const handleGoogle = (): Promise<void> =>
    runGoogle(async () => {
      const ready = await waitForAuthReady();
      if (!ready) {
        setError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      try {
        await loginWithGoogle();
        closeAuthDialog();
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        showToast(message);
      }
    });

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    void runSignIn(async () => {
      const ready = await waitForAuthReady();
      if (!ready) {
        setError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      try {
        await loginWithEmail(trimmedEmail, password);
        closeAuthDialog();
        showToast('Signed in!');
        track('login_success', { method: 'email' });
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        showToast(message);
      }
    });
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && closeAuthDialog()} title="Sign in" id="login-modal">
      <ModalClose />
      <form id="login-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="login-email">Email</label>
        <input
          type="email"
          id="login-email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="login-password">Password</label>
        <input
          type="password"
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p id="login-error" className="form-error" role="alert" aria-live="assertive" hidden={!error}>
          {error}
        </p>
        <button
          type="submit"
          id="login-submit"
          className="btn btn-primary"
          disabled={signingIn}
          aria-busy={signingIn || undefined}
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="divider">or</div>
        <button
          type="button"
          id="google-login"
          className="btn btn-ghost"
          disabled={googleBusy}
          aria-busy={googleBusy || undefined}
          onClick={handleGoogle}
        >
          {googleBusy ? 'Opening Google…' : 'Continue with Google'}
        </button>
      </form>
      <p className="auth-link">
        <button type="button" onClick={() => openAuthDialog('reset')}>
          Forgot your password?
        </button>
      </p>
      <p className="auth-link">
        New user?{' '}
        <button type="button" onClick={() => openAuthDialog('signup')}>
          Create an account
        </button>
      </p>
    </Modal>
  );
}

function SignupModal({ open }: { open: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [creating, runCreate] = useSubmitLock();
  const [googleBusy, runGoogle] = useSubmitLock();

  useEffect(() => {
    setError('');
  }, [open]);

  const handleGoogle = (): Promise<void> =>
    runGoogle(async () => {
      const ready = await waitForAuthReady();
      if (!ready) {
        setError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      try {
        await loginWithGoogle();
        closeAuthDialog();
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        showToast(message);
      }
    });

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password || !confirm) {
      setError('Please fill in every field.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    void runCreate(async () => {
      const ready = await waitForAuthReady();
      if (!ready) {
        setError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      try {
        await signUpWithEmail(trimmedEmail, password);
        closeAuthDialog();
        showToast('Account created!');
        track('signup_success', { method: 'email' });
      } catch (err) {
        const message = errorMessage(err);
        setError(message);
        showToast(message);
      }
    });
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && closeAuthDialog()} title="Sign up" id="signup-modal">
      <ModalClose />
      <form id="signup-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="signup-email">Email</label>
        <input
          type="email"
          id="signup-email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="signup-password">Password</label>
        <input
          type="password"
          id="signup-password"
          name="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="signup-confirm">Confirm password</label>
        <input
          type="password"
          id="signup-confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <p id="signup-error" className="form-error" role="alert" aria-live="assertive" hidden={!error}>
          {error}
        </p>
        <button
          type="submit"
          id="signup-submit"
          className="btn btn-primary"
          disabled={creating}
          aria-busy={creating || undefined}
        >
          {creating ? 'Creating account…' : 'Create account'}
        </button>
        <div className="divider">or</div>
        <button
          type="button"
          id="google-signup"
          className="btn btn-ghost"
          disabled={googleBusy}
          aria-busy={googleBusy || undefined}
          onClick={handleGoogle}
        >
          {googleBusy ? 'Opening Google…' : 'Continue with Google'}
        </button>
      </form>
      <p className="auth-link">
        Already have an account?{' '}
        <button type="button" onClick={() => openAuthDialog('login')}>
          Sign in
        </button>
      </p>
    </Modal>
  );
}

function ResetModal({ open }: { open: boolean }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, runSend] = useSubmitLock();

  useEffect(() => {
    setError('');
  }, [open]);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }

    void runSend(async () => {
      const ready = await waitForAuthReady();
      if (!ready) {
        setError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      try {
        await resetPassword(trimmedEmail);
      } catch (err) {
        // A missing account reports success too — confirming it exists would
        // leak who has signed up here (account enumeration).
        if (!(err instanceof Error) || (err as { code?: string }).code !== 'auth/user-not-found') {
          const message = errorMessage(err);
          setError(message);
          showToast(message);
          return;
        }
      }
      closeAuthDialog();
      showToast('Password reset link sent. Check your inbox.');
      track('password_reset_sent');
    });
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && closeAuthDialog()} title="Reset password" id="reset-modal">
      <ModalClose />
      <p>Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <form id="reset-form" noValidate onSubmit={handleSubmit}>
        <label htmlFor="reset-email">Email</label>
        <input
          type="email"
          id="reset-email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p id="reset-error" className="form-error" role="alert" aria-live="assertive" hidden={!error}>
          {error}
        </p>
        <button
          type="submit"
          id="reset-submit"
          className="btn btn-primary"
          disabled={sending}
          aria-busy={sending || undefined}
        >
          {sending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="auth-link">
        <button type="button" onClick={() => openAuthDialog('login')}>
          Back to sign in
        </button>
      </p>
    </Modal>
  );
}

export function AuthDialog() {
  const { open, mode } = useAuthDialog();

  return (
    <>
      <LoginModal open={open && mode === 'login'} />
      <SignupModal open={open && mode === 'signup'} />
      <ResetModal open={open && mode === 'reset'} />
    </>
  );
}
