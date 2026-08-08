import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The state persistence and cross-page progress derivation under test here
// are unexported internals split across two islands
// (src/islands/course-one.ts:35-163 and src/islands/profile.ts:22-133),
// neither of which exports anything but its init*() function. Per Phase 1f
// these are pinned via faithful copies (cited to source line numbers)
// rather than modifying either file — this phase's only allowed src/ edit
// is auth.ts. The whole point of this file is Appendix B's cross-page
// contract: both copies below must agree on what "module N is done" means.

// ---------------------------------------------------------------------------
// course-one.ts:35-163 — the CourseState cookie/localStorage sink
// ---------------------------------------------------------------------------

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
interface CourseState {
  preQuiz: QuizProgress;
  m1: { video: boolean; article: boolean };
  m2: { video: boolean; article: boolean; idExercise: boolean };
  m3: { video: boolean; article: boolean; drillsChecked: boolean };
  m4: { article: boolean; auditSubmitted: boolean; auditId: string | null };
  postQuiz: PostQuizProgress;
  certificate: { issued: boolean; id: string | null; date: string | null };
}

const defaultState: CourseState = {
  preQuiz: { completed: false, score: 0, answers: [], correctness: [] },
  m1: { video: false, article: false },
  m2: { video: false, article: false, idExercise: false },
  m3: { video: false, article: false, drillsChecked: false },
  m4: { article: false, auditSubmitted: false, auditId: null },
  postQuiz: { completed: false, score: 0, pass: false, answers: [], correctness: [] },
  certificate: { issued: false, id: null, date: null },
};

function setCookie(name: string, value: string, days = 180): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/; samesite=lax`;
  } catch {
    // cookies may be blocked; ignore
  }
}

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

function loadState(): CourseState {
  const cookie = getCookie(COOKIE_NAME);
  if (cookie) {
    const parsed = parseStoredState(cookie);
    if (parsed) return { ...defaultState, ...parsed };
  }
  try {
    const ls = localStorage.getItem(DP_STATE_KEY);
    if (ls) {
      const parsed = parseStoredState(ls);
      if (parsed) return { ...defaultState, ...parsed };
    }
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
  return { ...defaultState };
}

function saveState(s: CourseState): void {
  try {
    localStorage.setItem(DP_STATE_KEY, JSON.stringify(s));
  } catch {
    // localStorage may be unavailable; ignore.
  }
  setCookie(COOKIE_NAME, JSON.stringify(s));
}

// course-one.ts:156-163 — bumpCourseProgress. This is course-one's own view
// of "is module N done", which feeds ff_course_progress.
function courseOneModuleIds(s: CourseState): string[] {
  const ids: string[] = [];
  if (s.m1.video && s.m1.article) ids.push('dp-m1');
  if (s.m2.video && s.m2.article && s.m2.idExercise) ids.push('dp-m2');
  if (s.m3.video && s.m3.article) ids.push('dp-m3');
  if (s.m4.article && s.m4.auditSubmitted) ids.push('dp-m4');
  return ids;
}

// ---------------------------------------------------------------------------
// profile.ts:22-133 — the independent reader of the SAME cookie/localStorage
// keys, deriving its own progress ring/bar.
// ---------------------------------------------------------------------------

type DPModuleFlags = Partial<Record<'video' | 'article' | 'idExercise' | 'auditSubmitted', boolean>>;
type DPState = Partial<Record<'m1' | 'm2' | 'm3' | 'm4', DPModuleFlags>>;

function parseDPState(raw: string): DPState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as DPState) : null;
  } catch {
    return null;
  }
}

function readDPState(): DPState | null {
  const cookie = getCookie(COOKIE_NAME);
  if (cookie) {
    const parsed = parseDPState(cookie);
    if (parsed) return parsed;
  }
  try {
    const ls = localStorage.getItem(DP_STATE_KEY);
    if (ls) {
      const parsed = parseDPState(ls);
      if (parsed) return parsed;
    }
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
  return null;
}

interface ProgressResult {
  done: number;
  total: number;
  pct: number;
  source: 'dp' | 'dp-fallback' | 'legacy6';
}

function computeProgressAccurate(getCourseProgressIds: () => string[]): ProgressResult {
  const dp = readDPState();
  if (dp) {
    const m1 = Boolean(dp.m1?.video && dp.m1?.article);
    const m2 = Boolean(dp.m2?.video && dp.m2?.article && dp.m2?.idExercise);
    const m3 = Boolean(dp.m3?.video && dp.m3?.article);
    const m4 = Boolean(dp.m4?.article && dp.m4?.auditSubmitted);
    const done = [m1, m2, m3, m4].filter(Boolean).length;
    const total = 4;
    return { done, total, pct: Math.round((done / total) * 100), source: 'dp' };
  }

  const ARR6 = ['junk-fees', 'subs-cancel', 'bnpl', 'chargebacks', 'arbitration', 'debt-rights'];
  const DP4 = ['dp-m1', 'dp-m2', 'dp-m3', 'dp-m4'];
  const ids = getCourseProgressIds();

  const count6 = ids.filter((id) => ARR6.includes(id)).length;
  const count4 = ids.filter((id) => DP4.includes(id)).length;

  if (count4 >= count6) {
    return { done: count4, total: 4, pct: Math.round((count4 / 4) * 100), source: 'dp-fallback' };
  }
  return { done: count6, total: 6, pct: Math.round((count6 / 6) * 100), source: 'legacy6' };
}

// ---------------------------------------------------------------------------

function clearAllState(): void {
  localStorage.clear();
  // Expire every cookie by re-setting with a past max-age.
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  });
}

beforeEach(() => {
  clearAllState();
});

describe('parseStoredState / loadState precedence', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(loadState()).toEqual(defaultState);
  });

  it('reads from localStorage when the cookie is absent', () => {
    localStorage.setItem(DP_STATE_KEY, JSON.stringify({ ...defaultState, m1: { video: true, article: true } }));
    expect(loadState().m1).toEqual({ video: true, article: true });
  });

  it('prefers the cookie over localStorage when both are present', () => {
    setCookie(COOKIE_NAME, JSON.stringify({ ...defaultState, m1: { video: true, article: true } }));
    localStorage.setItem(DP_STATE_KEY, JSON.stringify({ ...defaultState, m1: { video: false, article: false } }));
    expect(loadState().m1).toEqual({ video: true, article: true });
  });

  it('falls back to localStorage when the cookie value is corrupt JSON', () => {
    document.cookie = `${COOKIE_NAME}=not-json; path=/`;
    localStorage.setItem(DP_STATE_KEY, JSON.stringify({ ...defaultState, m1: { video: true, article: true } }));
    expect(loadState().m1).toEqual({ video: true, article: true });
  });
});

describe('saveState dual-write', () => {
  it('writes to both localStorage and the cookie', () => {
    const s = { ...defaultState, m1: { video: true, article: true } };
    saveState(s);
    expect(JSON.parse(localStorage.getItem(DP_STATE_KEY)!)).toEqual(s);
    expect(JSON.parse(getCookie(COOKIE_NAME)!)).toEqual(s);
  });

  it('sets the cookie with a 180-day max-age, path=/, and samesite=lax', () => {
    let written = '';
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      set(v: string) {
        written = v;
      },
      get() {
        return original.get!.call(document);
      },
    });
    try {
      saveState({ ...defaultState });
    } finally {
      Object.defineProperty(document, 'cookie', original);
    }
    expect(written).toMatch(/^ff_dp_state_v2=/);
    expect(written).toContain(`max-age=${180 * 86400}`);
    expect(written).toContain('path=/');
    expect(written).toContain('samesite=lax');
  });
});

afterEach(() => {
  clearAllState();
});

describe('cross-page contract: course-one and profile agree on "module N is done"', () => {
  const fixtures: { name: string; state: Partial<CourseState>; expectedDone: number }[] = [
    { name: 'nothing done', state: {}, expectedDone: 0 },
    {
      name: 'm1 and m3 done (video+article only), m2/m4 not',
      state: {
        m1: { video: true, article: true },
        m3: { video: true, article: true, drillsChecked: false },
      },
      expectedDone: 2,
    },
    {
      name: 'm2 requires all three of video+article+idExercise',
      state: { m2: { video: true, article: true, idExercise: false } },
      expectedDone: 0,
    },
    {
      name: 'every module done',
      state: {
        m1: { video: true, article: true },
        m2: { video: true, article: true, idExercise: true },
        m3: { video: true, article: true, drillsChecked: true },
        m4: { article: true, auditSubmitted: true, auditId: 'AUD-1' },
      },
      expectedDone: 4,
    },
  ];

  it.each(fixtures)('$name', ({ state, expectedDone }) => {
    const full: CourseState = { ...defaultState, ...state };
    saveState(full);

    // course-one's own view, via ff_course_progress ids
    const ids = courseOneModuleIds(full);
    expect(ids).toHaveLength(expectedDone);

    // profile's independent view, reading the same cookie/localStorage keys
    const progress = computeProgressAccurate(() => []);
    expect(progress.source).toBe('dp');
    expect(progress.done).toBe(expectedDone);

    // the two derivations must agree — this is the whole point of the contract
    expect(progress.done).toBe(ids.length);
  });
});

describe('legacy fallback: DP4 vs ARR6, tie-break to DP4', () => {
  it('picks DP4 on a tie (count4 >= count6)', () => {
    // No DP state saved at all -> computeProgressAccurate falls back to the
    // legacy array-of-ids comparison.
    const ids = ['dp-m1', 'dp-m2', 'junk-fees', 'bnpl'];
    const progress = computeProgressAccurate(() => ids);
    expect(progress.source).toBe('dp-fallback');
    expect(progress.done).toBe(2);
    expect(progress.total).toBe(4);
  });

  it('picks ARR6 when it strictly has more matches', () => {
    const ids = ['dp-m1', 'junk-fees', 'bnpl', 'chargebacks'];
    const progress = computeProgressAccurate(() => ids);
    expect(progress.source).toBe('legacy6');
    expect(progress.done).toBe(3);
    expect(progress.total).toBe(6);
  });

  it('picks DP4 when both are zero (0 >= 0)', () => {
    const progress = computeProgressAccurate(() => []);
    expect(progress.source).toBe('dp-fallback');
    expect(progress.done).toBe(0);
  });
});
