// Read-model over the storage Appendix B calls the "CourseState
// cookie/localStorage pair" (`ff_dp_state` / `ff_dp_state_v2`) plus
// `ff_course_progress`.
//
// All three keys are written today by src/islands/course-one.ts's own
// imperative code (loadState/saveState/bumpCourseProgress, roughly
// course-one.ts:103-166) and read independently by src/islands/profile.ts.
// This file does not change either of those write paths.
//
// Design choice (Phase 4 plan, "no UI change" + I4 byte-compatible
// storage): progressStore is read-only in this phase. `progressStore.set()`
// exists (it's the createStore contract) but nothing calls it except
// `refreshProgressSnapshot()` below, and nothing calls that automatically
// either — there is no consumer yet, since course-one and profile are
// still vanilla islands. Routing course-one's actual writes through this
// store is Phase 10f's job (course-one -> React), once its imperative
// loadState/saveState/bumpCourseProgress are retired in favor of a
// component that owns this store directly. Rebuilding that write path here
// now, before anything calls it, would be exactly the kind of unrequested
// duplication that risks drifting out of sync with the real writer.
//
// The CourseState shape and its read precedence (cookie ff_dp_state_v2
// first, then localStorage ff_dp_state, then defaults) are a faithful copy
// of course-one.ts's loadState/parseStoredState/getCookie — the same
// duplication convention tests/unit/course-state.test.ts already uses, for
// the same reason: course-one.ts exports nothing but initCourseOne().

import { createStore } from './store';
import { getCourseProgress } from './storage';

const DP_STATE_KEY = 'ff_dp_state';
const COOKIE_NAME = 'ff_dp_state_v2';

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

function getCookie(name: string): string | null {
  try {
    const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
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

function loadCourseState(): CourseState {
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
