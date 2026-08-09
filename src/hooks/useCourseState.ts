// React replacement for src/islands/course-one.ts's updateLocks() (12 call
// sites: course-one.ts:844,933,958,971,983,996,1010,1023,1060,1123,1203,1397)
// plus its state layer (loadState/saveState/bumpCourseProgress).
//
// updateLocks() today is an imperative function that (a) figures out which
// step is next, (b) re-runs lazy loaders for the current step and every
// already-complete step, (c) toggles `.locked`/`inert`/`aria-hidden` and
// injects/removes a `.locked-scrim` on every section element, (d) writes
// dead stepper markup (Appendix E: `.stepper-wrap .step` does not exist —
// setStepStatus is a no-op today), (e) bumps ff_course_progress, and
// (f) rebuilds the #progress-list sidebar from scratch. Every one of those
// 12 call sites is really just "I changed a piece of CourseState, now make
// everything consistent with it" — which is exactly what a derived value is
// for. This hook makes lock/unlock state a pure function of the current
// CourseState snapshot: nothing here is ever "called to update locks";
// `locks`/`steps`/`currentStepIndex` are recomputed on every render via
// useMemo, and the actions below only ever change `state`.
//
// Dead branch found and NOT ported: the original's per-step loop has
//   if (sectionIsComplete(s.section)) { lockSection(el, false); ...; return; }
//   if (s.key === 'pre' && state.preQuiz.completed) { ...peekable...; return; }
// The second branch can only run when `s.key === 'pre'` AND
// `state.preQuiz.completed` — but `sectionIsComplete('#pre-quiz')` is
// *defined* as `state.preQuiz.completed` (course-one.ts:1238-1239), so
// whenever the second branch's condition holds, the first branch already
// matched and returned. The 'peekable' class this dead branch would have
// added is therefore never applied in the shipped site today. See the
// final report for the full trace; `locked` below has no third "peekable"
// state as a result — only locked/unlocked.
import { useCallback, useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  progressStore,
  refreshProgressSnapshot,
  saveCourseState,
  SERVER_PROGRESS_SNAPSHOT,
  type CourseState,
} from '../lib/progress';

// The 7 top-level sections courseone's markup has always used as element
// ids (course-one.ts:1236-1255's sectionIsComplete switch, and the `section`
// field of every entry in LINEAR_STEPS). Kept as the literal id strings —
// ProgressSidebar and CourseOne.tsx can use them directly as `href`/`id`
// without a second lookup table.
export type SectionId = '#pre-quiz' | '#module-1' | '#module-2' | '#module-3' | '#module-4' | '#post-quiz' | '#certificate';

export const SECTION_ORDER: readonly SectionId[] = [
  '#pre-quiz',
  '#module-1',
  '#module-2',
  '#module-3',
  '#module-4',
  '#post-quiz',
  '#certificate',
];

// Faithful port of the LINEAR_STEPS table (course-one.ts:1221-1234), minus
// the `loader`/`done` closures — `done` becomes a pure read off `state`
// inside useCourseState instead of a closure captured at construction time,
// which is what let the original get away with mutating `state` in place
// (module-scoped `let state`) rather than treating it as immutable data.
export interface StepDef {
  key: string;
  label: string;
  section: SectionId;
}

export const STEP_DEFS: readonly StepDef[] = [
  { key: 'pre', label: 'Pre-quiz', section: '#pre-quiz' },
  { key: 'm1_video', label: 'Module 1 — Video', section: '#module-1' },
  { key: 'm1_article', label: 'Module 1 — Article', section: '#module-1' },
  { key: 'm2_video', label: 'Module 2 — Video', section: '#module-2' },
  { key: 'm2_article', label: 'Module 2 — Article', section: '#module-2' },
  { key: 'm2_id', label: 'Module 2 — ID exercise', section: '#module-2' },
  { key: 'm3_video', label: 'Module 3 — Video', section: '#module-3' },
  { key: 'm3_article', label: 'Module 3 — Article', section: '#module-3' },
  { key: 'm4_article', label: 'Module 4 — Article', section: '#module-4' },
  { key: 'audit', label: 'Module 4 — Risk Audit', section: '#module-4' },
  { key: 'post', label: 'Post-quiz', section: '#post-quiz' },
  { key: 'cert', label: 'Certificate', section: '#certificate' },
];

export interface StepStatus extends StepDef {
  done: boolean;
}

export interface SectionLock {
  section: SectionId;
  /** sectionIsComplete(section) — every step inside it is done. */
  complete: boolean;
  /** This is the section containing the first incomplete step. */
  current: boolean;
  /** !complete && !current — render the locked-scrim, set inert + aria-hidden. */
  locked: boolean;
  /** `Finish "<current step label>" first` when locked, '' otherwise — curly quotes, matching course-one.ts:1292 byte-for-byte. */
  message: string;
}

export type SectionLocks = Record<SectionId, SectionLock>;

// Faithful port of course-one.ts:1236-1255's sectionIsComplete switch.
function isSectionComplete(section: SectionId, state: CourseState): boolean {
  switch (section) {
    case '#pre-quiz':
      return state.preQuiz.completed;
    case '#module-1':
      return state.m1.video && state.m1.article;
    case '#module-2':
      return state.m2.video && state.m2.article && state.m2.idExercise;
    case '#module-3':
      return state.m3.video && state.m3.article;
    case '#module-4':
      return state.m4.article && state.m4.auditSubmitted;
    case '#post-quiz':
      return state.postQuiz.pass;
    case '#certificate':
      return state.certificate.issued || state.postQuiz.pass;
  }
}

// One `done` predicate per STEP_DEFS key, in the same order — matches
// LINEAR_STEPS' `done: () => ...` closures (course-one.ts:1222-1233).
const STEP_DONE: Record<string, (state: CourseState) => boolean> = {
  pre: (s) => s.preQuiz.completed,
  m1_video: (s) => s.m1.video,
  m1_article: (s) => s.m1.article,
  m2_video: (s) => s.m2.video,
  m2_article: (s) => s.m2.article,
  m2_id: (s) => s.m2.idExercise,
  m3_video: (s) => s.m3.video,
  m3_article: (s) => s.m3.article,
  m4_article: (s) => s.m4.article,
  audit: (s) => s.m4.auditSubmitted,
  post: (s) => s.postQuiz.pass,
  cert: (s) => s.certificate.issued,
};

function computeSteps(state: CourseState): StepStatus[] {
  return STEP_DEFS.map((def) => ({ ...def, done: STEP_DONE[def.key]!(state) }));
}

function firstIncompleteIndex(steps: readonly StepStatus[]): number {
  const idx = steps.findIndex((s) => !s.done);
  return idx === -1 ? steps.length - 1 : idx;
}

function computeLocks(state: CourseState, steps: readonly StepStatus[], currentStepIndex: number): SectionLocks {
  const currentSection = steps[currentStepIndex]?.section ?? '#pre-quiz';
  const currentLabel = steps[currentStepIndex]?.label ?? '';
  const locks = {} as SectionLocks;
  for (const section of SECTION_ORDER) {
    const complete = isSectionComplete(section, state);
    const current = section === currentSection;
    const locked = !complete && !current;
    locks[section] = {
      section,
      complete,
      current,
      locked,
      message: locked ? `Finish “${currentLabel}” first` : '',
    };
  }
  return locks;
}

export interface QuizSubmission {
  score: number;
  answers: (number | null)[];
  correctness: (boolean | null)[];
}

export interface PostQuizSubmission extends QuizSubmission {
  pass: boolean;
}

export interface CourseStateActions {
  /** Pre-quiz per-choice autosave (course-one.ts:800-803's onChoice) — fires on every radio change, before submit. */
  setPreQuizAnswer(idx: number, value: number): void;
  /** course-one.ts:823-846's submit handler. Caller (PreQuiz) grades and passes the result; toast/track/scroll stay in PreQuiz. */
  submitPreQuiz(result: QuizSubmission): void;

  /** gateVideo's onDone for m1/m2/m3 (course-one.ts:955-960,980-985,1007-1012). m4 has no video. */
  setModuleVideoDone(unit: 1 | 2 | 3): void;
  /** mark-read click for m1-m4 (course-one.ts:964-974,989-999,1016-1026,1053-1063). */
  setModuleArticleDone(unit: 1 | 2 | 3 | 4): void;
  /** id-exercise all-correct (course-one.ts:930-936). */
  completeIdExercise(): void;
  /** #drills-check click (course-one.ts:1028-1044) — does not affect any lock; module-3 only needs video+article. */
  setDrillsChecked(): void;
  /** audit form submit (course-one.ts:1120-1126) — CourseState side only. The full audit entry (merchant/action/evidence/etc) is a separate `ff_risk_audits` key, not part of CourseState; see report. */
  completeAudit(auditId: string): void;

  /** post-quiz per-choice autosave (course-one.ts:1165-1168's onChoice). */
  setPostQuizAnswer(idx: number, value: number): void;
  /** post-quiz submit (course-one.ts:1183-1213). */
  submitPostQuiz(result: PostQuizSubmission): void;
  /** resetPostQuiz (course-one.ts:1149-1157) minus the UI side effects. */
  retakePostQuiz(): void;
  /** prepareCertificate (course-one.ts:1337-1353) minus the DOM text-fill (that's Certificate.tsx's job with the returned id/date). Idempotent: keeps the existing id/date if already issued. */
  issueCertificate(): { id: string; date: string };
}

export interface UseCourseStateResult {
  state: CourseState;
  steps: readonly StepStatus[];
  currentStepIndex: number;
  locks: SectionLocks;
  actions: CourseStateActions;
}

// Applies an immutable update to the persisted CourseState and lets
// saveCourseState (src/lib/progress.ts) handle the dual-write + progress
// bump + store notify in one place, replacing every one of the original's
// 12 `saveState(state); updateLocks();` pairs with one call.
function applyCourseState(updater: (prev: CourseState) => CourseState): void {
  const prev = progressStore.get().courseState;
  saveCourseState(updater(prev));
}

export function useCourseState(): UseCourseStateResult {
  const snapshot = useSyncExternalStore(progressStore.subscribe, progressStore.get, () => SERVER_PROGRESS_SNAPSHOT);
  const state = snapshot.courseState;

  // Hydrates progressStore from the real cookie/localStorage on mount.
  // Deliberately NOT gated by a `hydratedRef`/module-level boolean latch:
  // refreshProgressSnapshot() is a pure read-and-set with no listeners, no
  // injected DOM, and no in-flight request to leak or duplicate, so running
  // it twice (StrictMode's dev-only double-invoke) is a harmless redundant
  // no-op re-render, not a correctness bug. This is the trivial end of the
  // idempotent-loader spectrum item 2 is about; the risky end — the
  // Module/IdExercise/PostQuiz video and markdown/JSON fetch loaders, which
  // DO attach listeners/observers and DO make network requests — is where a
  // latch-based guard actually breaks under double-invocation. See the
  // final report for the concrete before/after pattern those loaders must
  // use instead of a `m1Loaded`-style boolean.
  useEffect(() => {
    refreshProgressSnapshot();
  }, []);

  const steps = useMemo(() => computeSteps(state), [state]);
  const currentStepIndex = useMemo(() => firstIncompleteIndex(steps), [steps]);
  const locks = useMemo(() => computeLocks(state, steps, currentStepIndex), [state, steps, currentStepIndex]);

  const setPreQuizAnswer = useCallback((idx: number, value: number) => {
    applyCourseState((prev) => {
      const answers = [...prev.preQuiz.answers];
      answers[idx] = value;
      return { ...prev, preQuiz: { ...prev.preQuiz, answers } };
    });
  }, []);

  const submitPreQuiz = useCallback((result: QuizSubmission) => {
    applyCourseState((prev) => ({ ...prev, preQuiz: { completed: true, ...result } }));
  }, []);

  const setModuleVideoDone = useCallback((unit: 1 | 2 | 3) => {
    applyCourseState((prev) => {
      if (unit === 1) return { ...prev, m1: { ...prev.m1, video: true } };
      if (unit === 2) return { ...prev, m2: { ...prev.m2, video: true } };
      return { ...prev, m3: { ...prev.m3, video: true } };
    });
  }, []);

  const setModuleArticleDone = useCallback((unit: 1 | 2 | 3 | 4) => {
    applyCourseState((prev) => {
      if (unit === 1) return { ...prev, m1: { ...prev.m1, article: true } };
      if (unit === 2) return { ...prev, m2: { ...prev.m2, article: true } };
      if (unit === 3) return { ...prev, m3: { ...prev.m3, article: true } };
      return { ...prev, m4: { ...prev.m4, article: true } };
    });
  }, []);

  const completeIdExercise = useCallback(() => {
    applyCourseState((prev) => ({ ...prev, m2: { ...prev.m2, idExercise: true } }));
  }, []);

  const setDrillsChecked = useCallback(() => {
    applyCourseState((prev) => ({ ...prev, m3: { ...prev.m3, drillsChecked: true } }));
  }, []);

  const completeAudit = useCallback((auditId: string) => {
    applyCourseState((prev) => ({ ...prev, m4: { ...prev.m4, auditSubmitted: true, auditId } }));
  }, []);

  const setPostQuizAnswer = useCallback((idx: number, value: number) => {
    applyCourseState((prev) => {
      const answers = [...prev.postQuiz.answers];
      answers[idx] = value;
      return { ...prev, postQuiz: { ...prev.postQuiz, answers } };
    });
  }, []);

  const submitPostQuiz = useCallback((result: PostQuizSubmission) => {
    applyCourseState((prev) => ({ ...prev, postQuiz: { completed: true, ...result } }));
  }, []);

  const retakePostQuiz = useCallback(() => {
    applyCourseState((prev) => ({
      ...prev,
      postQuiz: { completed: false, score: 0, pass: false, answers: [], correctness: [] },
    }));
  }, []);

  const issueCertificate = useCallback((): { id: string; date: string } => {
    const prev = progressStore.get().courseState;
    const id = prev.certificate.id || `FF-DP-${Date.now()}`;
    const date = prev.certificate.date || new Date().toISOString().slice(0, 10);
    applyCourseState((p) => ({ ...p, certificate: { issued: true, id, date } }));
    return { id, date };
  }, []);

  const actions: CourseStateActions = useMemo(
    () => ({
      setPreQuizAnswer,
      submitPreQuiz,
      setModuleVideoDone,
      setModuleArticleDone,
      completeIdExercise,
      setDrillsChecked,
      completeAudit,
      setPostQuizAnswer,
      submitPostQuiz,
      retakePostQuiz,
      issueCertificate,
    }),
    [
      setPreQuizAnswer,
      submitPreQuiz,
      setModuleVideoDone,
      setModuleArticleDone,
      completeIdExercise,
      setDrillsChecked,
      completeAudit,
      setPostQuizAnswer,
      submitPostQuiz,
      retakePostQuiz,
      issueCertificate,
    ],
  );

  return { state, steps, currentStepIndex, locks, actions };
}
