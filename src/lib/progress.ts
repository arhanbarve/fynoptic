// Read/write model over the storage Appendix B calls the "CourseState
// cookie/localStorage pair" (`ff_dp_state` / `ff_dp_state_v2`) plus
// `ff_course_progress`.
//
// History: through Phase 9 this file was read-only — the three keys were
// written by src/islands/course-one.ts's own imperative loadState/
// saveState/bumpCourseProgress, and read independently by
// src/islands/profile.ts (now src/components/profile/Profile.tsx, which
// deliberately keeps its own duplicate read of these keys rather than
// consuming this file — see that component's header comment). `refreshProgressSnapshot`
// existed as a manual read-hydration helper, but nothing called it and
// `progressStore.set()` had no caller either, pending "Phase 10f's job":
// giving this store a real owner.
//
// Phase 10f: `saveCourseState` below is that owner's write path.
// src/hooks/useCourseState.ts is its sole caller, and course-one.ts's own
// loadState/saveState/bumpCourseProgress are retired in favor of it. The
// on-disk shapes and read precedence (cookie ff_dp_state_v2 first, then
// localStorage ff_dp_state, then defaults) are unchanged (Appendix B, I4).

import { createStore } from './store';
import { getCourseProgress, setCourseProgress } from './storage';

export const DP_STATE_KEY = 'ff_dp_state';
export const COOKIE_NAME = 'ff_dp_state_v2';

interface QuizProgress {
  completed: boolean;
  score: number;
  answers: (number | null)[];
  correctness: (boolean | null)[];
}

interface PostQuizProgress extends QuizProgress {
  pass: boolean;
}

export interface CourseState {
  preQuiz: QuizProgress;
  m1: { video: boolean; article: boolean };
  m2: { video: boolean; article: boolean; idExercise: boolean };
  m3: { video: boolean; article: boolean; drillsChecked: boolean };
  m4: { article: boolean; auditSubmitted: boolean; auditId: string | null };
  postQuiz: PostQuizProgress;
  certificate: { issued: boolean; id: string | null; date: string | null };
}

export const defaultCourseState: CourseState = {
  preQuiz: { completed: false, score: 0, answers: [], correctness: [] },
  m1: { video: false, article: false },
  m2: { video: false, article: false, idExercise: false },
  m3: { video: false, article: false, drillsChecked: false },
  m4: { article: false, auditSubmitted: false, auditId: null },
  postQuiz: { completed: false, score: 0, pass: false, answers: [], correctness: [] },
  certificate: { issued: false, id: null, date: null },
};

export function getCookie(name: string): string | null {
  try {
    const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

// Byte-for-byte match of course-one.ts:103-109's setCookie: 180-day
// max-age, path=/, samesite=lax (Appendix B, I4).
export function setCookie(name: string, value: string, days = 180): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/; samesite=lax`;
  } catch {
    // cookies may be blocked; ignore
  }
}

function parseStoredState(raw: string): Partial<CourseState> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<CourseState>) : null;
  } catch {
    return null;
  }
}

export function loadCourseState(): CourseState {
  const cookie = getCookie(COOKIE_NAME);
  if (cookie) {
    const parsed = parseStoredState(cookie);
    if (parsed) return { ...defaultCourseState, ...parsed };
  }
  try {
    const ls = localStorage.getItem(DP_STATE_KEY);
    if (ls) {
      const parsed = parseStoredState(ls);
      if (parsed) return { ...defaultCourseState, ...parsed };
    }
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
  return { ...defaultCourseState };
}

export interface ProgressSnapshot {
  moduleIds: string[];
  courseState: CourseState;
}

// Stable reference, reused for both the store's initial value and every
// hook's SSR snapshot so repeated calls stay reference-equal. Touches no
// window/document/localStorage/cookies, so it's safe to evaluate at import
// time even in an SSR'd module graph (I5).
export const SERVER_PROGRESS_SNAPSHOT: ProgressSnapshot = {
  moduleIds: [],
  courseState: defaultCourseState,
};

export const progressStore = createStore<ProgressSnapshot>(SERVER_PROGRESS_SNAPSHOT);

// Pulls the current on-disk snapshot (ff_course_progress, zod-validated via
// storage.ts's getCourseProgress, plus the CourseState cookie/localStorage
// pair) into the store. Nothing in this phase calls this automatically —
// see the file header. It exists so a future client-side consumer can
// hydrate the store once something actually renders derived from it.
export function refreshProgressSnapshot(): void {
  progressStore.set({
    moduleIds: getCourseProgress(),
    courseState: loadCourseState(),
  });
}

// ---------------------------------------------------------------------------
// Phase 10f: the real write path. This is the "future client-side consumer"
// the comment above was waiting for — src/hooks/useCourseState.ts is the
// sole caller. course-one.ts's own imperative loadState/saveState/
// bumpCourseProgress (course-one.ts:130-166) are retired in favor of this;
// the on-disk shapes and precedence are unchanged (Appendix B, I4).
// ---------------------------------------------------------------------------

// Pure derivation of course-one.ts:159-165's bumpCourseProgress — "which
// dp-mN ids does this CourseState imply are done" — with no storage side
// effects, so it's independently testable. tests/unit/course-state.test.ts
// imports this directly instead of keeping its own copy.
export function deriveModuleIds(state: CourseState): string[] {
  const ids: string[] = [];
  if (state.m1.video && state.m1.article) ids.push('dp-m1');
  if (state.m2.video && state.m2.article && state.m2.idExercise) ids.push('dp-m2');
  if (state.m3.video && state.m3.article) ids.push('dp-m3');
  if (state.m4.article && state.m4.auditSubmitted) ids.push('dp-m4');
  return ids;
}

// Dual-write (localStorage + cookie, both on every save — I4), then bumps
// ff_course_progress (union with whatever's already there, matching
// bumpCourseProgress's Set-based accumulation — earlier-earned ids are
// never dropped even though m1-m4 are monotonic in practice) and pushes the
// new snapshot into progressStore so any same-page consumer stays live.
export function saveCourseState(next: CourseState): void {
  try {
    localStorage.setItem(DP_STATE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable; ignore.
  }
  setCookie(COOKIE_NAME, JSON.stringify(next));

  const moduleIds = [...new Set([...getCourseProgress(), ...deriveModuleIds(next)])];
  setCourseProgress(moduleIds);

  progressStore.set({ moduleIds, courseState: next });
}
