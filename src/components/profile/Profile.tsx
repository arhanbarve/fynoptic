// Converts src/islands/profile.ts to React, replacing it wholesale (Phase 10c
// base shell). useAuth() (src/hooks/useAuth.ts -> authStore, src/lib/auth.ts)
// is the single source of the current user everywhere in this component. The
// old page's own second onAuthStateChanged subscription and the
// 'avatar-updated' window event listener it dispatched into are both gone —
// Nav.tsx and this component now read the exact same store.
//
// Cross-page contract (Appendix B / tests/unit/course-state.test.ts): the
// m1..m4 derivation below is a faithful port of profile.ts:104-133
// (computeProgressAccurate), not a consumer of src/lib/progress.ts's
// CourseState read-model. That store always fills in defaultCourseState when
// no ff_dp_state cookie/localStorage value exists, so it can't distinguish
// "no Dark Patterns course state at all" (which must fall back to counting
// legacy ff_course_progress array ids) from "state exists but every flag is
// false" — both collapse to the same shape there. Duplicating the raw
// cookie/localStorage read here — the same convention src/lib/progress.ts and
// tests/unit/course-state.test.ts already use for the same reason — keeps
// that fallback exact for any existing user with legacy progress-array
// entries but no Dark Patterns state. Do not change this math.
import { useEffect, useState, type CSSProperties } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';
import { initialsFrom, logout } from '@/lib/auth';
import { getCourseProgress } from '@/lib/storage';
import { showToast } from '@/lib/toast';
import { ProfileSettings } from './ProfileSettings';

const DP_STATE_LS = 'ff_dp_state';
const DP_STATE_COOKIE = 'ff_dp_state_v2';

type DPModuleFlags = Partial<Record<'video' | 'article' | 'idExercise' | 'auditSubmitted', boolean>>;
type DPState = Partial<Record<'m1' | 'm2' | 'm3' | 'm4', DPModuleFlags>>;

interface ProgressResult {
  done: number;
  total: number;
  pct: number;
}

const INITIAL_PROGRESS: ProgressResult = { done: 0, total: 4, pct: 0 };

function getCookie(name: string): string | null {
  try {
    const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function parseDPState(raw: string): DPState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as DPState) : null;
  } catch {
    return null;
  }
}

function readDPState(): DPState | null {
  const cookie = getCookie(DP_STATE_COOKIE);
  if (cookie) {
    const parsed = parseDPState(cookie);
    if (parsed) return parsed;
  }
  try {
    const ls = localStorage.getItem(DP_STATE_LS);
    if (ls) {
      const parsed = parseDPState(ls);
      if (parsed) return parsed;
    }
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
  return null;
}

// Faithful port of profile.ts:104-133 (computeProgressAccurate). Prefers
// Dark Patterns course state if present; else falls back to the old
// ff_course_progress array, preferring whichever legacy id set (DP4 vs
// ARR6) has more matches so the UI doesn't undercount.
function computeProgress(): ProgressResult {
  const dp = readDPState();
  if (dp) {
    const m1 = Boolean(dp.m1?.video && dp.m1?.article);
    const m2 = Boolean(dp.m2?.video && dp.m2?.article && dp.m2?.idExercise);
    const m3 = Boolean(dp.m3?.video && dp.m3?.article);
    const m4 = Boolean(dp.m4?.article && dp.m4?.auditSubmitted);
    const done = [m1, m2, m3, m4].filter(Boolean).length;
    const total = 4;
    return { done, total, pct: Math.round((done / total) * 100) };
  }

  const ARR6 = ['junk-fees', 'subs-cancel', 'bnpl', 'chargebacks', 'arbitration', 'debt-rights'];
  const DP4 = ['dp-m1', 'dp-m2', 'dp-m3', 'dp-m4'];
  const ids = getCourseProgress();

  const count6 = ids.filter((id) => ARR6.includes(id)).length;
  const count4 = ids.filter((id) => DP4.includes(id)).length;

  if (count4 >= count6) {
    const total = 4;
    return { done: count4, total, pct: Math.round((count4 / total) * 100) };
  }
  const total = 6;
  return { done: count6, total, pct: Math.round((count6 / total) * 100) };
}

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

// Same derivation as profile.ts:182's renderChips — a single provider id
// (or the comma-joined list, for the rare multi-provider account) with the
// '.com' suffix stripped, falling back to 'password'. Reused for both the
// chip row and the previously-dead #prov stat tile (Appendix E) below.
function providerLabel(user: User): string {
  return user.providerData.map((p) => p.providerId.replace('.com', '')).join(', ') || 'password';
}

export function Profile() {
  const { user, status } = useAuth();
  const [progress, setProgress] = useState<ProgressResult>(INITIAL_PROGRESS);

  // Redirect signed-out visitors to '/'. 'loading' is the pre-hydration/
  // pre-auth-resolved state — treated as neither signed-in nor signed-out so
  // a real signed-in user never sees a redirect flash while auth is still
  // resolving.
  useEffect(() => {
    if (status === 'out') window.location.replace('/');
  }, [status]);

  // Cookie/localStorage reads, so client-only. Recomputes if the user object
  // reference changes (e.g. once ProfileSettings pushes an updated user into
  // authStore after a save), even though today only sign-in itself changes it.
  useEffect(() => {
    if (status === 'in' && user) setProgress(computeProgress());
  }, [status, user]);

  async function handleSignOut(): Promise<void> {
    try {
      await logout();
      window.location.replace('/');
    } catch {
      showToast('Could not sign out. Try again.');
    }
  }

  if (status !== 'in' || !user) return null;

  const displayName = user.displayName || user.email?.split('@')[0] || 'Friend';
  const initials = initialsFrom(user);
  const provider = providerLabel(user);
  const ringStyle = {
    '--deg': `${Math.max(0, Math.min(100, progress.pct)) * 3.6}deg`,
  } as CSSProperties;
  const barStyle = { '--p': `${progress.pct}%` } as CSSProperties;

  return (
    <section className="profile-hero" role="region" aria-labelledby="profile-heading">
      <div className="hero-bg">
        <img src="/assets/texture-noise.svg" alt="" aria-hidden="true" />
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="ring ring1" />
        <div className="ring ring2" />
      </div>

      <div className="container">
        <div className="profile-card">
          <div className="avatar-wrap">
            <img
              id="prof-avatar"
              className="avatar"
              alt={displayName}
              src={user.photoURL ?? undefined}
              hidden={!user.photoURL}
            />
            <div className="avatar-fallback" id="prof-initials" aria-hidden="true" hidden={!!user.photoURL}>
              {initials}
            </div>
          </div>

          <div className="id-block">
            <h1 id="profile-heading">
              Hey, <span id="prof-name">{displayName}</span> 👋
            </h1>
            <p className="muted" id="prof-email">
              {user.email || ''}
            </p>

            <div className="chip-row" id="chip-row">
              <span className="chip">{user.emailVerified ? 'Email verified' : 'Email not verified'}</span>
              <span className="chip">{`Provider: ${provider}`}</span>
            </div>

            <div className="action-row">
              <button id="logout-btn" className="btn btn-primary" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>

          <div className="ring-progress" aria-label="Course progress">
            <div
              className="ring"
              id="ring"
              role="img"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.pct}
              style={ringStyle}
            >
              <div className="ring-center">
                <div className="ring-num">
                  <span id="ring-num">{progress.pct}</span>%
                </div>
                <div className="ring-label">Course</div>
              </div>
            </div>
          </div>
        </div>

        <ProfileSettings user={user} />

        <div className="stats-grid">
          <div className="stat card">
            <div className="stat-label">Joined</div>
            <div className="stat-value" id="joined-at">
              {fmtDate(user.metadata.creationTime)}
            </div>
          </div>
          <div className="stat card">
            <div className="stat-label">Last Sign-In</div>
            <div className="stat-value" id="last-login">
              {fmtDate(user.metadata.lastSignInTime)}
            </div>
          </div>
          <div className="stat card">
            <div className="stat-label">Modules Completed</div>
            <div className="stat-value">
              <span id="mods-done">{progress.done}</span>/<span id="mods-total">{progress.total}</span>
            </div>
          </div>
          <div className="stat card">
            <div className="stat-label">Provider</div>
            <div className="stat-value" id="prov">
              {provider}
            </div>
          </div>
        </div>

        <section className="progress-block card">
          <header className="section-head">
            <h2>Your course progress</h2>
            <p className="section-note">Keep going — you’re building real consumer power.</p>
          </header>
          <div className="progress-bar">
            <div className="progress-fill" id="progress-fill" style={barStyle} />
          </div>
          <div className="progress-meta">
            <span>
              <strong id="pct-text">{progress.pct}%</strong> complete
            </span>
            <a href="/courses" className="btn btn-ghost">
              Continue Learning
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}
