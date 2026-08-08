// React port of the session-engine half of src/islands/practice.ts
// (Phase 10d). The four pure functions below — createSession, maybeAdapt,
// drawQuestion, normalizeQuestion — are byte-identical in logic to
// practice.ts:330-432 (Appendix A is the exact contract). They used to be
// unexported closures over a module-level `QUESTIONS` bank and a handful of
// DOM elements; here `QUESTIONS` becomes an explicit first parameter and the
// DOM side effects (updateDiffChip) are dropped, because rendering is now a
// pure function of `session` instead of an imperative write. Nothing about
// the *algorithm* changed — tests/unit/practice-adaptive.test.ts now imports
// these directly instead of using its own pinned copy.
//
// Fixes made while converting (in scope per the implementation plan's 10d):
//   - loadPF's triple-retry (the original tried the exact same path three
//     times in a row) collapses to a single fetch, matching loadEconomics'
//     shape.
//   - Both bank fetches move from page-relative ('data/...') to
//     root-relative ('/data/...') paths.
//   - The three divergent accuracy formulas (correct/asked,
//     correct/(asked||1), and a ternary-guarded percent in the end-session
//     modal) collapse into computeAccuracyPct below.
//   - `explanation` is always '' in the shipped data, so the dead
//     `q.explanation ? ... : ...` branches in the old markResponse are not
//     ported — see Session.tsx's feedback text, which is just 'Correct!' /
//     'Not quite.'.
import { useEffect, useRef, useState } from 'react';
import { shuffle } from '../lib/shuffle';
import { showToast } from '../lib/toast';
import { parseEconBank, parsePfBank } from '../schemas';
import type { PracticeBank, PracticeDifficulty, PracticeItem } from '../types';

export interface NormalizedQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface TimelineEntry {
  q: NormalizedQuestion;
  answered: boolean;
  chosenIdx: number | null;
  correct: boolean | null;
  eliminated: number[];
}

export interface HistoryEntry {
  id: string;
  correct: boolean;
  difficulty: PracticeDifficulty;
}

export interface Session {
  category: string;
  topics: string[];
  totalQuestions: number;
  adaptWindow: number;
  adaptive: boolean;
  asked: number;
  correct: number;
  streak: number;
  history: HistoryEntry[];
  byDiff: Record<PracticeDifficulty, PracticeItem[]>;
  current: NormalizedQuestion | null;
  currentDiff: PracticeDifficulty;
  timeline: TimelineEntry[];
  currentIndex: number;
}

export interface CreateSessionParams {
  category: string;
  topics: string[];
  totalQuestions: number;
  adaptWindow: number;
  adaptive: boolean;
}

/** practice.ts:330-375, unchanged apart from taking the bank as a parameter. */
export function createSession(QUESTIONS: PracticeBank, params: CreateSessionParams): Session | null {
  const { category, topics, totalQuestions, adaptWindow, adaptive } = params;
  const catObj = QUESTIONS[category];
  if (!catObj) return null;

  const byDiff: Record<PracticeDifficulty, PracticeItem[]> = { easy: [], medium: [], hard: [] };
  topics.forEach((t) => {
    const block = catObj[t];
    if (!block) return;
    (['easy', 'medium', 'hard'] as const).forEach((d) => {
      const arr = block[d];
      if (Array.isArray(arr)) byDiff[d].push(...arr);
    });
  });

  byDiff.easy = shuffle(byDiff.easy);
  byDiff.medium = shuffle(byDiff.medium);
  byDiff.hard = shuffle(byDiff.hard);

  if (!byDiff.easy.length && !byDiff.medium.length && !byDiff.hard.length) return null;

  const startDiff: PracticeDifficulty = byDiff.medium.length ? 'medium' : byDiff.easy.length ? 'easy' : 'hard';

  return {
    category,
    topics,
    totalQuestions,
    adaptWindow,
    adaptive,
    asked: 0,
    correct: 0,
    streak: 0,
    history: [],
    byDiff,
    current: null,
    currentDiff: startDiff,
    timeline: [],
    currentIndex: -1,
  };
}

/** practice.ts:377-395, unchanged. The first of the two writers of currentDiff. */
export function maybeAdapt(session: Session): void {
  if (!session.adaptive) return;
  const N = session.adaptWindow;
  const slice = session.history.slice(-N);
  if (!slice.length) return;

  const acc = slice.filter((x) => x.correct).length / slice.length;
  let next = session.currentDiff;

  if (acc >= 0.85) {
    if (session.currentDiff === 'easy' && session.byDiff.medium.length) next = 'medium';
    else if (session.currentDiff === 'medium' && session.byDiff.hard.length) next = 'hard';
  } else if (acc <= 0.5) {
    if (session.currentDiff === 'hard' && session.byDiff.medium.length) next = 'medium';
    else if (session.currentDiff === 'medium' && session.byDiff.easy.length) next = 'easy';
  }

  session.currentDiff = next;
}

function cryptoRandomId(): string {
  try {
    return 'q-' + crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36);
  } catch {
    return 'q-' + Math.random().toString(36).slice(2);
  }
}

/** practice.ts:397-408, unchanged. explanation is always ''. */
export function normalizeQuestion(raw: PracticeItem): NormalizedQuestion {
  const choices = raw.choices.slice();
  let answerIndex = choices.findIndex((c) => c === raw.answer);
  if (answerIndex < 0) answerIndex = 0;
  return {
    id: raw.id || cryptoRandomId(),
    prompt: raw.question,
    choices,
    answerIndex,
    explanation: '',
  };
}

/**
 * practice.ts:418-432, unchanged apart from dropping the updateDiffChip(d)
 * DOM write — Session.tsx renders session.currentDiff directly instead. The
 * second, hidden writer of currentDiff: tryOrder is [current, medium, easy,
 * hard], first non-empty tier wins, shift() consumes permanently, and this
 * runs even when session.adaptive is false.
 */
export function drawQuestion(session: Session): NormalizedQuestion | null {
  const tryOrder: PracticeDifficulty[] = [session.currentDiff, 'medium', 'easy', 'hard'];
  for (const d of tryOrder) {
    const arr = session.byDiff[d];
    if (arr && arr.length) {
      const raw = arr.shift()!;
      const q = normalizeQuestion(raw);
      session.current = q;
      session.currentDiff = d;
      return q;
    }
  }
  return null;
}

/**
 * Replaces three slightly-divergent inline formulas in the original
 * (practice.ts's two in nextQuestion — `correct/asked` and
 * `correct/(asked||1)` — plus openEndSessionModal's
 * `answered ? round(correct/answered*100) : 0`). All three round to a
 * whole-number percent and all three treat zero-asked as 0%; there was no
 * behavioral reason for three copies.
 */
export function computeAccuracyPct(correct: number, asked: number): number {
  return asked > 0 ? Math.round((correct / asked) * 100) : 0;
}

function pushTimelineEntry(session: Session, q: NormalizedQuestion): void {
  session.timeline.push({ q, answered: false, chosenIdx: null, correct: null, eliminated: [] });
}

async function loadPF(): Promise<PracticeBank | null> {
  try {
    const res = await fetch('/data/pf_bank_modules_1of6.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parsePfBank(await res.json());
  } catch (err) {
    console.error('loadPF error:', err);
    showToast('Could not load the question bank (check file path/name).');
    return null;
  }
}

async function loadEconomics(): Promise<PracticeBank | null> {
  try {
    const res = await fetch('/data/econ_grouped_by_module_unit_with_choices.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseEconBank(await res.json());
  } catch (err) {
    console.error('loadEconomics error:', err);
    showToast('Could not load Economics bank (check path).');
    return null;
  }
}

export interface UsePracticeSessionResult {
  /** Merged question bank, keyed category -> topic -> difficulty -> items. */
  questions: PracticeBank;
  /** True until both bank fetches have settled. */
  banksLoading: boolean;
  /** The live engine session, or null when no session is running. */
  session: Session | null;
  /** Non-null summary text once the active session has ended naturally (total reached or pool exhausted). Null while a session is active or none exists. */
  finishSummary: string | null;
  /** Starts a session for the given wizard selections. Returns false (and toasts) if the bank/pool is empty. */
  start(params: CreateSessionParams): boolean;
  /** Records the chosen index for the current question, before submit. */
  selectChoice(idx: number): void;
  /** Toggles cross-out (elimination) on a choice. Independent of selection. */
  toggleEliminate(idx: number): void;
  /** Grades the current question's chosen answer and advances asked/correct/streak/history, running maybeAdapt on cadence. */
  submit(): void;
  /** Replays a previously-visited question, or draws/advances, or ends the session. */
  next(): void;
  /** Steps back to a previously-visited question. */
  prev(): void;
  /** Rebuilds a fresh session from the current session's params (same category/topics/settings). Returns false (and toasts) if the pool is empty. */
  restart(): boolean;
  /** Clears the session entirely — the "actually end it" action a confirmation modal calls into. */
  endSession(): void;
}

export function usePracticeSession(): UsePracticeSessionResult {
  const [questions, setQuestions] = useState<PracticeBank>({});
  const [banksLoading, setBanksLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [finishSummary, setFinishSummary] = useState<string | null>(null);
  const questionsRef = useRef<PracticeBank>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadPF(), loadEconomics()]).then(([pf, econ]) => {
      if (cancelled) return;
      const merged = { ...(pf || {}), ...(econ || {}) };
      questionsRef.current = merged;
      setQuestions(merged);
      setBanksLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function start(params: CreateSessionParams): boolean {
    const next = createSession(questionsRef.current, params);
    if (!next) {
      showToast('No questions available for that selection.');
      return false;
    }
    const q = drawQuestion(next);
    if (!q) {
      showToast('Question pool is empty.');
      return false;
    }
    pushTimelineEntry(next, q);
    next.currentIndex = 0;
    setFinishSummary(null);
    setSession(next);
    return true;
  }

  function selectChoice(idx: number): void {
    if (!session) return;
    const entry = session.timeline[session.currentIndex];
    if (!entry) return;
    entry.chosenIdx = idx;
    // Selecting overrides any cross-out on that same option.
    entry.eliminated = entry.eliminated.filter((i) => i !== idx);
    setSession({ ...session });
  }

  function toggleEliminate(idx: number): void {
    if (!session) return;
    const entry = session.timeline[session.currentIndex];
    if (!entry) return;
    const pos = entry.eliminated.indexOf(idx);
    if (pos === -1) entry.eliminated.push(idx);
    else entry.eliminated.splice(pos, 1);
    setSession({ ...session });
  }

  function submit(): void {
    if (!session || !session.current) return;
    const entry = session.timeline[session.currentIndex];
    if (!entry || entry.chosenIdx === null || entry.answered) return;

    const chosenIdx = entry.chosenIdx;
    const isCorrect = chosenIdx === session.current.answerIndex;

    session.asked += 1;
    session.correct += isCorrect ? 1 : 0;
    session.streak = isCorrect ? session.streak + 1 : 0;
    session.history.push({ id: session.current.id, correct: isCorrect, difficulty: session.currentDiff });

    entry.answered = true;
    entry.correct = isCorrect;

    if (session.adaptive && session.adaptWindow > 0 && session.asked % session.adaptWindow === 0) {
      maybeAdapt(session);
    }

    setSession({ ...session });
  }

  function next(): void {
    if (!session) return;

    if (session.currentIndex < session.timeline.length - 1) {
      session.currentIndex += 1;
      session.current = session.timeline[session.currentIndex]!.q;
      setSession({ ...session });
      return;
    }

    if (session.asked >= session.totalQuestions) {
      setFinishSummary(
        `You answered ${session.correct} out of ${session.asked} correctly (${computeAccuracyPct(session.correct, session.asked)}%).`,
      );
      return;
    }

    const q = drawQuestion(session);
    if (!q) {
      setFinishSummary(
        `We ran out of questions. Final score: ${session.correct}/${session.asked} (${computeAccuracyPct(session.correct, session.asked)}%).`,
      );
      return;
    }

    pushTimelineEntry(session, q);
    session.currentIndex = session.timeline.length - 1;
    setSession({ ...session });
  }

  function prev(): void {
    if (!session) return;
    if (session.currentIndex > 0) {
      session.currentIndex -= 1;
      session.current = session.timeline[session.currentIndex]!.q;
      setSession({ ...session });
    }
  }

  function restart(): boolean {
    if (!session) return false;
    const { category, topics, totalQuestions, adaptWindow, adaptive } = session;
    const next = createSession(questionsRef.current, { category, topics, totalQuestions, adaptWindow, adaptive });
    if (!next) {
      showToast('No questions available for that selection.');
      return false;
    }
    const q = drawQuestion(next);
    if (!q) {
      showToast('Question pool is empty.');
      return false;
    }
    pushTimelineEntry(next, q);
    next.currentIndex = 0;
    setFinishSummary(null);
    setSession(next);
    return true;
  }

  function endSession(): void {
    setSession(null);
    setFinishSummary(null);
  }

  return { questions, banksLoading, session, finishSummary, start, selectChoice, toggleEliminate, submit, next, prev, restart, endSession };
}
