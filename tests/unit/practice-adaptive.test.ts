import { describe, expect, it } from 'vitest';
import {
  createSession,
  drawQuestion,
  maybeAdapt,
  normalizeQuestion,
  type HistoryEntry,
  type Session,
} from '../../src/hooks/usePracticeSession';
import type { PracticeBank, PracticeItem } from '../../src/types';

// Phase 10d extracted maybeAdapt/createSession/drawQuestion/normalizeQuestion
// out of src/islands/practice.ts (lines 330-432, closed over DOM elements
// and a module-level QUESTIONS bank) into src/hooks/usePracticeSession.ts as
// real exported functions (QUESTIONS becomes an explicit first parameter to
// createSession; drawQuestion drops the updateDiffChip DOM write, elided
// below). These tests now import that real module instead of the
// byte-for-byte copy Phase 1d pinned this file with — same algorithm, same
// assertions, no copy left to drift. Appendix A is the exact contract these
// tests pin.

// Real drawQuestion no longer calls updateDiffChip — DOM chrome with no
// bearing on the session state these tests pin (Session.tsx renders
// session.currentDiff directly instead of that imperative write).

// ---- test helpers ----

let seq = 0;
function item(overrides: Partial<PracticeItem> = {}): PracticeItem {
  seq += 1;
  return {
    id: `q${seq}`,
    question: `question ${seq}`,
    choices: ['a', 'b', 'c', 'd'],
    answer: 'a',
    ...overrides,
  };
}

function pool(n: number): PracticeItem[] {
  return Array.from({ length: n }, () => item());
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    category: 'Economics',
    topics: ['unit1'],
    totalQuestions: 10,
    adaptWindow: 10,
    adaptive: true,
    asked: 0,
    correct: 0,
    streak: 0,
    history: [],
    byDiff: { easy: [], medium: [], hard: [] },
    current: null,
    currentDiff: 'medium',
    timeline: [],
    currentIndex: -1,
    ...overrides,
  };
}

function history(pattern: (boolean | 'correct' | 'wrong')[]): HistoryEntry[] {
  return pattern.map((p, i) => ({
    id: `h${i}`,
    correct: p === true || p === 'correct',
    difficulty: 'medium',
  }));
}

/** N correct answers followed by (total - N) wrong ones. */
function nCorrectOf(total: number, correctCount: number): HistoryEntry[] {
  return history(Array.from({ length: total }, (_, i) => i < correctCount));
}

describe('maybeAdapt — Appendix A contract', () => {
  it('1. promotes at the exact boundary (9/10 = 0.90 >= 0.85)', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 9), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('2. does not promote just under the boundary (8/10 = 0.80)', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 8), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('3. promotes at exactly 0.85 (17/20), the threshold is inclusive', () => {
    const s = makeSession({ adaptWindow: 20, currentDiff: 'medium', history: nCorrectOf(20, 17), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('4. demotes at the exact boundary (5/10 = 0.50), the threshold is inclusive', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 5), byDiff: { easy: pool(5), medium: [], hard: [] } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('easy');
  });

  it('5. does not demote just above the boundary (6/10 = 0.60)', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 6), byDiff: { easy: pool(5), medium: [], hard: [] } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('6. dead band (0.50 < acc < 0.85) makes no change', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 7), byDiff: { easy: pool(5), medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('7. hard is a ceiling — stays hard at acc 1.0', () => {
    const s = makeSession({ currentDiff: 'hard', history: nCorrectOf(10, 10), byDiff: { easy: pool(5), medium: pool(5), hard: [] } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('8. easy is a floor — stays easy at acc 0.0', () => {
    const s = makeSession({ currentDiff: 'easy', history: nCorrectOf(10, 0), byDiff: { easy: [], medium: pool(5), hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('easy');
  });

  it('9. blocked by a drained pool — medium cannot promote to hard when byDiff.hard is empty', () => {
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 9), byDiff: { easy: [], medium: [], hard: [] } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('10. the block checks the REMAINING pool, not an original count kept elsewhere', () => {
    // A pool that started at 20 and has since been fully drawn down looks
    // identical to one that started empty — the algorithm only ever
    // consults byDiff[target].length at the moment of the call.
    const hardPool = pool(20);
    while (hardPool.length) hardPool.shift();
    const s = makeSession({ currentDiff: 'medium', history: nCorrectOf(10, 9), byDiff: { easy: [], medium: [], hard: hardPool } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('11. moves exactly one tier per call — easy never reaches hard in a single adaptation', () => {
    const s = makeSession({ currentDiff: 'easy', history: nCorrectOf(10, 10), byDiff: { easy: [], medium: pool(5), hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('12. uses a rolling window of the last N entries, not the full history', () => {
    // First 15 are correct, last 10 are all wrong. Judged on all 25 that
    // would be 15/25 = 0.60 (dead band, no change). Judged on the last 10
    // (the real rule) that's 0/10 = 0.0, which demotes.
    const older = nCorrectOf(15, 15);
    const recent = nCorrectOf(10, 0);
    const s = makeSession({ currentDiff: 'medium', history: [...older, ...recent], byDiff: { easy: pool(5), medium: [], hard: [] } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('easy');
  });

  it('13. empty history is an early return — no change', () => {
    const s = makeSession({ currentDiff: 'medium', history: [], byDiff: { easy: pool(5), medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('14. adaptive: false is an early return — no change even at a promoting accuracy', () => {
    const s = makeSession({ adaptive: false, currentDiff: 'medium', history: nCorrectOf(10, 10), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });

  it('15. N=15 promotes at 13/15 ≈ 0.8667', () => {
    const s = makeSession({ adaptWindow: 15, currentDiff: 'medium', history: nCorrectOf(15, 13), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('16. N=15 does not promote at 12/15 = 0.80', () => {
    const s = makeSession({ adaptWindow: 15, currentDiff: 'medium', history: nCorrectOf(15, 12), byDiff: { easy: [], medium: [], hard: pool(5) } });
    maybeAdapt(s);
    expect(s.currentDiff).toBe('medium');
  });
});

describe('createSession — bucketing and start tier', () => {
  const bank: PracticeBank = {
    Economics: {
      unit1: { easy: pool(2), medium: pool(3), hard: pool(1) },
      unit2: { easy: pool(2), medium: pool(2), hard: pool(2) },
    },
  };

  it('flattens the selected topics into one pool per tier', () => {
    const s = createSession(bank, { category: 'Economics', topics: ['unit1', 'unit2'], totalQuestions: 10, adaptWindow: 10, adaptive: true });
    expect(s?.byDiff.easy).toHaveLength(4);
    expect(s?.byDiff.medium).toHaveLength(5);
    expect(s?.byDiff.hard).toHaveLength(3);
  });

  it('silently skips a topic missing from the category', () => {
    const s = createSession(bank, { category: 'Economics', topics: ['unit1', 'does-not-exist'], totalQuestions: 10, adaptWindow: 10, adaptive: true });
    expect(s?.byDiff.easy).toHaveLength(2);
    expect(s?.byDiff.medium).toHaveLength(3);
    expect(s?.byDiff.hard).toHaveLength(1);
  });

  it('silently skips a tier that is not an array', () => {
    const malformed: PracticeBank = {
      Economics: { unit1: { easy: pool(2), medium: null as unknown as PracticeItem[], hard: pool(1) } },
    };
    const s = createSession(malformed, { category: 'Economics', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true });
    expect(s?.byDiff.easy).toHaveLength(2);
    expect(s?.byDiff.medium).toHaveLength(0);
    expect(s?.byDiff.hard).toHaveLength(1);
  });

  it('starts at medium when medium is non-empty', () => {
    const s = createSession(bank, { category: 'Economics', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true });
    expect(s?.currentDiff).toBe('medium');
  });

  it('falls back to easy, then hard, when medium is empty', () => {
    const onlyEasy: PracticeBank = { Economics: { unit1: { easy: pool(2), medium: [], hard: [] } } };
    expect(createSession(onlyEasy, { category: 'Economics', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true })?.currentDiff).toBe('easy');

    const onlyHard: PracticeBank = { Economics: { unit1: { easy: [], medium: [], hard: pool(2) } } };
    expect(createSession(onlyHard, { category: 'Economics', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true })?.currentDiff).toBe('hard');
  });

  it('returns null when every tier across every selected topic is empty', () => {
    const empty: PracticeBank = { Economics: { unit1: { easy: [], medium: [], hard: [] } } };
    expect(createSession(empty, { category: 'Economics', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true })).toBeNull();
  });

  it('returns null when the category does not exist', () => {
    expect(createSession(bank, { category: 'NoSuchCategory', topics: ['unit1'], totalQuestions: 10, adaptWindow: 10, adaptive: true })).toBeNull();
  });
});

describe('drawQuestion — the second, hidden writer of currentDiff', () => {
  it('draws from currentDiff first when it has questions', () => {
    const s = makeSession({ currentDiff: 'hard', byDiff: { easy: pool(1), medium: pool(1), hard: pool(1) } });
    drawQuestion(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('falls back in order medium -> easy -> hard when currentDiff is drained', () => {
    const s = makeSession({ currentDiff: 'medium', byDiff: { easy: pool(1), medium: [], hard: pool(1) } });
    drawQuestion(s);
    // medium (currentDiff) empty -> tries medium again (no-op) -> easy (non-empty) wins
    expect(s.currentDiff).toBe('easy');
  });

  it('falls all the way to hard when every earlier tier is drained', () => {
    const s = makeSession({ currentDiff: 'easy', byDiff: { easy: [], medium: [], hard: pool(1) } });
    drawQuestion(s);
    expect(s.currentDiff).toBe('hard');
  });

  it('drawing from a fallback tier reassigns currentDiff, not just session.current', () => {
    const s = makeSession({ currentDiff: 'medium', byDiff: { easy: pool(1), medium: [], hard: [] } });
    expect(s.currentDiff).toBe('medium');
    const q = drawQuestion(s);
    expect(s.currentDiff).toBe('easy');
    expect(s.current).toBe(q);
  });

  it('runs the same fallback even when adaptive is false', () => {
    const s = makeSession({ adaptive: false, currentDiff: 'medium', byDiff: { easy: pool(1), medium: [], hard: [] } });
    drawQuestion(s);
    expect(s.currentDiff).toBe('easy');
  });

  it('shift() consumes permanently — the pool shrinks and no question repeats', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b' });
    const s = makeSession({ currentDiff: 'easy', byDiff: { easy: [a, b], medium: [], hard: [] } });
    const first = drawQuestion(s);
    expect(s.byDiff.easy).toHaveLength(1);
    const second = drawQuestion(s);
    expect(s.byDiff.easy).toHaveLength(0);
    expect(first?.id).toBe('a');
    expect(second?.id).toBe('b');
  });

  it('returns null when every tier is empty', () => {
    const s = makeSession({ byDiff: { easy: [], medium: [], hard: [] } });
    expect(drawQuestion(s)).toBeNull();
  });
});

describe('normalizeQuestion', () => {
  it('finds answerIndex by matching the answer string against choices', () => {
    const q = normalizeQuestion(item({ choices: ['x', 'y', 'z'], answer: 'y' }));
    expect(q.answerIndex).toBe(1);
  });

  it('falls back to answerIndex 0 when the answer does not match any choice', () => {
    const q = normalizeQuestion(item({ choices: ['x', 'y', 'z'], answer: 'not-a-choice' }));
    expect(q.answerIndex).toBe(0);
  });

  it('explanation is always the empty string', () => {
    const q = normalizeQuestion(item());
    expect(q.explanation).toBe('');
  });

  it('copies choices without reordering them', () => {
    const raw = item({ choices: ['d', 'c', 'b', 'a'], answer: 'a' });
    const q = normalizeQuestion(raw);
    expect(q.choices).toEqual(['d', 'c', 'b', 'a']);
    expect(q.choices).not.toBe(raw.choices);
  });

  it('uses the source id when present', () => {
    const q = normalizeQuestion(item({ id: 'fixed-id' }));
    expect(q.id).toBe('fixed-id');
  });

  it('mints a fallback id when the source id is falsy', () => {
    const q = normalizeQuestion(item({ id: '' }));
    expect(q.id).toMatch(/^q-/);
  });
});
