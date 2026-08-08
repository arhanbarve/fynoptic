// React port of the session-engine half of src/islands/flashcard.ts
// (Phase 10e). Owns deck construction, the fill-in-the-blank answer
// comparison, multiple-choice distractor generation, grading, and
// localStorage persistence — everything inside `#fc-stage` and
// `aside#block-progress` in flashcard.astro. It deliberately does NOT own
// the wizard setup steps (unit/mode selection, `.fc-controls[data-step]`),
// the reset-progress confirmation dialog, or the session-summary modal —
// those are a parallel conversion; see the callback-free, data-only shape
// below for the exact seam (`buildDeck`/`endSession`/`resetProgress` return
// plain data or booleans, they never confirm() or render anything).
//
// Preserved exactly (I3/I4, Appendix D/E):
//   - The `${unit}::${term}` deck id — flashcard.ts:586 — is the
//     localStorage key; buildDeck below is that line, unchanged.
//   - The fill-in-the-blank comparison's asymmetry (flashcard.ts:756-764):
//     the input is trimmed, the target is NOT, both lowercased. In
//     production `els.caseInsensitive` was always null (`#case-insensitive`
//     has no markup anywhere), so case-insensitivity was unconditional —
//     Appendix E lists that dead read for deletion, so checkFitbAnswer below
//     takes no case-insensitive parameter at all and always lowercases.
//   - `{answers: {"unit::term": {correct, attempts, lastAt}}}` under
//     `fynoptic.flashcards.v1` (Appendix B).
//   - The two independent answer-target variables, `mcAnswer` and
//     `fitbAnswer` — MC and FITB remember separate "answer with term vs.
//     definition" choices.
//   - MC distractor generation (flashcard.ts:690-705): Set-backed, so
//     duplicate candidate values collapse and fewer than 4 options is
//     possible; the correct value is always present.
//   - The subtle, easy-to-miss MC lock: answering multiple choice disables
//     its buttons immediately (handleMCClick disabled every `.mc-option`
//     directly), independent of `locked`/`revealed` — a card can be
//     "answered but not revealed." Fill-in-the-blank has no such lock; it
//     stays submittable (and re-gradable — gradeCurrent's `alreadyCounted`
//     guard is exactly what makes resubmission safe) until the card is
//     flipped or you navigate away. See `feedback.kind === 'mc'` below,
//     which is how this hook reproduces that lock without a redundant flag.
//
// Simplified (per the plan, explicitly called out for this phase):
//   - `setAnswerInteractivity()` mutated six different DOM properties from
//     one derived boolean and was called from five places. It collapses to
//     one `locked` boolean, derived below and passed down as a prop.
//   - `is-front` was computed independently in renderCard (:616-624) and
//     flipCard (:678-687) — the same formula, hand-copied twice, a latent
//     divergence bug. It is now the single `isFront` derived value below.
//   - `state.flipped` was always exactly `state.revealed.has(card.id)` —
//     renderCard synced it, flipCard set it, and it never held any other
//     value. Dropped; `locked` (== the old `flipped`) is derived instead of
//     stored, so there's no copy left to drift.
//
// Deleted, not ported (Appendix E):
//   - The import-time `#a11y-live` IIFE and the `void`-ed, never-called
//     `announce()` it existed for — touches `document.body` at module scope
//     and breaks SSR.
//   - `#empty-state` — only ever set `hidden`, never shown with content.
//   - `#case-insensitive` reads — the element does not exist.
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { FLASHCARD_UNITS } from '../data/flashcard-units';
import { shuffle } from '../lib/shuffle';
import { showToast } from '../lib/toast';
import type { Flashcard, FlashcardUnit } from '../types';

const STORAGE_KEY = 'fynoptic.flashcards.v1';

export type Mode = 'mc' | 'fitb';
export type AnswerTarget = 'term' | 'definition';

export interface DeckCard extends Flashcard {
  unit: string;
  id: string;
}

export interface AnswerRecord {
  correct: boolean;
  attempts: number;
  lastAt: number;
}

export interface Stats {
  total: number;
  done: number;
  correct: number;
  streak: number;
}

/** The MC lock and the answer text both live here, so the view never needs a separate "answered" flag (see the module comment above). */
export type Feedback =
  | { kind: 'mc'; correct: boolean; correctValue: string; chosenValue: string }
  | { kind: 'fitb'; correct: boolean; target: string }
  | { kind: 'hint'; hint: string }
  | null;

export interface FlashcardSessionSummary {
  total: number;
  done: number;
  correct: number;
  accuracyPct: number;
  revealedCount: number;
  units: string[];
}

export interface BuildDeckOptions {
  mode: Mode;
  mcAnswer?: AnswerTarget;
  fitbAnswer?: AnswerTarget;
  /** Mirrors `els.shuffleToggle?.checked` (flashcard.ts:431) — the wizard's own shuffle-deck checkbox state. */
  shuffleDeck?: boolean;
}

// ---------- PURE FUNCTIONS (tests/unit/flashcard-logic.test.ts imports these directly) ----------

/**
 * flashcard.ts:582-589, unchanged. `${unit}::${term}` is the localStorage
 * key contract (I4) — do not change the format. Unknown units contribute
 * nothing; unit-selection order, then source order within each unit, is
 * preserved.
 */
export function buildDeck(units: string[], flashcardUnits: FlashcardUnit): DeckCard[] {
  const deck: DeckCard[] = [];
  units.forEach((u) => {
    (flashcardUnits[u] ?? []).forEach((card) => {
      deck.push({ ...card, unit: u, id: `${u}::${card.term}` });
    });
  });
  return deck;
}

/**
 * flashcard.ts:756-764, unchanged apart from dropping the dead
 * `els.caseInsensitive` read (Appendix E — the element never existed, so
 * this was unconditionally the case-insensitive branch). `rawInput` is
 * trimmed; `target` is deliberately NOT — a trailing space in the source
 * data fails a trimmed match, and that asymmetry is pinned by
 * tests/unit/flashcard-logic.test.ts, not a bug to fix here.
 */
export function checkFitbAnswer(rawInput: string, target: string): boolean {
  const val = (rawInput || '').trim();
  return val.toLowerCase() === target.toLowerCase();
}

/**
 * flashcard.ts:690-705, unchanged. Set-backed: duplicate candidate values
 * collapse, so fewer than 4 options is possible. The correct value is
 * always included first, before the Set can be capped.
 */
export function buildMcOptions(card: Flashcard, pool: Flashcard[], useTermAnswers: boolean): string[] {
  const correctValue = useTermAnswers ? card.term : card.definition;
  const candidates = pool.map((c) => (useTermAnswers ? c.term : c.definition)).filter((v) => v && v !== correctValue);

  const values = new Set<string>([correctValue]);
  while (values.size < 4 && candidates.length) {
    const i = Math.floor(Math.random() * candidates.length);
    values.add(candidates[i]!);
    candidates.splice(i, 1);
  }
  return shuffle(Array.from(values));
}

/**
 * flashcard.ts:616-624 and :678-687 computed this same formula twice
 * (renderCard and flipCard) — the divergence-risk the plan calls out. Now
 * there is exactly one copy. Returns whether the *term* side is the base
 * (pre-flip) front, given which mode/answer-target combination is active.
 */
function computeFrontIsTerm(mode: Mode, mcAnswer: AnswerTarget, fitbAnswer: AnswerTarget): boolean {
  const showDefFirst = (mode === 'fitb' && fitbAnswer === 'term') || (mode === 'mc' && mcAnswer === 'term');
  return !showDefFirst;
}

// ---------- STORAGE ----------
const answerRecordSchema = z.object({
  correct: z.boolean(),
  attempts: z.number(),
  lastAt: z.number(),
});

const storedDataSchema = z.object({
  answers: z.record(answerRecordSchema),
});

function readStorage(): { answers: Record<string, AnswerRecord> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const result = storedDataSchema.safeParse(parsed);
    return result.success ? result.data : { answers: {} };
  } catch {
    return { answers: {} };
  }
}

function persistProgress(answers: Record<string, AnswerRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers }));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded); ignore.
  }
}

function statsFromAnswers(answers: Record<string, AnswerRecord>, deckIds: Set<string> | null): Pick<Stats, 'done' | 'correct'> {
  let done = 0;
  let correct = 0;
  for (const [id, a] of Object.entries(answers)) {
    if (deckIds && !deckIds.has(id)) continue;
    done++;
    if (a.correct) correct++;
  }
  return { done, correct };
}

/** flashcard.ts's updateProgressUI/openSummaryModal formula, single-sourced here instead of typed out twice. */
function computeAccuracyPct(correct: number, done: number, total: number): number {
  return total ? Math.round((correct / (done || 1)) * 100) : 0;
}

interface EngineState {
  deck: DeckCard[];
  index: number;
  active: boolean;
  mode: Mode;
  mcAnswer: AnswerTarget;
  fitbAnswer: AnswerTarget;
  revealed: Set<string>;
  stats: Stats;
  answers: Record<string, AnswerRecord>;
  feedback: Feedback;
}

function createInitialState(): EngineState {
  return {
    deck: [],
    index: 0,
    active: false,
    mode: 'mc',
    mcAnswer: 'term',
    fitbAnswer: 'term',
    revealed: new Set(),
    stats: { total: 0, done: 0, correct: 0, streak: 0 },
    answers: {},
    feedback: null,
  };
}

export interface UseFlashcardDeckResult {
  deck: DeckCard[];
  current: DeckCard | undefined;
  index: number;
  active: boolean;
  mode: Mode;
  mcAnswer: AnswerTarget;
  fitbAnswer: AnswerTarget;
  stats: Stats;

  /** Single derived value (was computed twice in the original) — true when the term side is the one currently on top. */
  isFront: boolean;
  /** Single derived value (replaces setAnswerInteractivity's six-way mutation) — true once the current card has been flipped/revealed. */
  locked: boolean;
  /** Set-backed distractors for the current card, recomputed only when the displayed card or answer-target changes — not on every incidental re-render, so an MC answer's on-screen options never reshuffle after grading. */
  mcOptions: string[];
  feedback: Feedback;
  /** "n / total", matches updateCrumbs(). */
  crumbs: string;
  /** done/total as a whole-number percent, for the progress bar. */
  progressPct: number;
  /** correct/(done||1) as a whole-number percent — the stat-acc figure. */
  accuracyPct: number;

  /** Builds a fresh deck from the selected units and starts a session. Returns false (and toasts) if `units` is empty. */
  buildDeck(units: string[], opts: BuildDeckOptions): boolean;
  /** Reveals the current card. Toasts and no-ops if it's already revealed. */
  flip(): void;
  /** Grades a multiple-choice click. Toasts and no-ops if the card is revealed. */
  submitMc(value: string): void;
  /** Grades a fill-in-the-blank submission. Toasts and no-ops if the card is revealed; no-ops silently on an empty/whitespace-only input. */
  submitFitb(rawInput: string): void;
  /** Shows a hint for the current card's answer target. No guard in the original — works even on a revealed card. */
  showHint(): void;
  /** The "Answer with Term/Definition" toggle — flips `mcAnswer` or `fitbAnswer` depending on the active mode. */
  toggleAnswerTarget(): void;
  next(): void;
  prev(): void;
  restart(shuffleDeck: boolean): void;
  /** Sets `active` false and returns a snapshot for whatever summary UI the caller renders — does not clear the deck or stats. */
  endSession(): FlashcardSessionSummary;
  /** Clears the storage key and zeroes stats/answers — bug-for-bug faithful to flashcard.ts, which also zeroes `stats.total` here rather than leaving it at the deck length. Caller is responsible for any confirmation UI. */
  resetProgress(): void;
}

export function useFlashcardDeck(): UseFlashcardDeckResult {
  const [state, setState] = useState<EngineState>(createInitialState);

  const current = state.deck[state.index];
  const revealedCurrent = current ? state.revealed.has(current.id) : false;
  const frontIsTerm = computeFrontIsTerm(state.mode, state.mcAnswer, state.fitbAnswer);
  const isFront = revealedCurrent ? !frontIsTerm : frontIsTerm;
  const locked = revealedCurrent;

  const mcOptions = useMemo(() => {
    if (!current || state.mode !== 'mc') return [];
    const pool: Flashcard[] = state.deck.length ? state.deck : Object.values(FLASHCARD_UNITS).flat();
    return buildMcOptions(current, pool, state.mcAnswer === 'term');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the displayed card + mode/answer-target, matching renderCard's call sites (buildDeck, next/prev/restart, toggleAnswerTarget), not on every render — see the module comment on the MC lock.
  }, [current, state.mode, state.mcAnswer, state.deck]);

  const crumbs = `${Math.min(state.index + 1, state.deck.length)} / ${state.deck.length}`;
  const progressPct = state.stats.total ? Math.round((state.stats.done / state.stats.total) * 100) : 0;
  const accuracyPct = computeAccuracyPct(state.stats.correct, state.stats.done, state.stats.total);

  function buildDeckAction(units: string[], opts: BuildDeckOptions): boolean {
    if (!units.length) {
      showToast('Select at least one unit.');
      return false;
    }
    let deck = buildDeck(units, FLASHCARD_UNITS);
    if (opts.shuffleDeck) deck = shuffle(deck);

    const saved = readStorage();
    const ids = new Set(deck.map((c) => c.id));
    const { done, correct } = statsFromAnswers(saved.answers, ids);

    setState({
      deck,
      index: 0,
      active: true,
      mode: opts.mode,
      mcAnswer: opts.mcAnswer ?? 'term',
      fitbAnswer: opts.fitbAnswer ?? 'term',
      revealed: new Set(),
      stats: { total: deck.length, done, correct, streak: 0 },
      answers: saved.answers,
      feedback: null,
    });
    return true;
  }

  function gradeCurrent(next: EngineState, card: DeckCard, correct: boolean): void {
    const prev = next.answers[card.id];
    const alreadyCounted = !!prev;
    next.answers[card.id] = { correct, attempts: (prev?.attempts ?? 0) + 1, lastAt: Date.now() };
    if (!alreadyCounted) next.stats.done += 1;
    if (correct) {
      next.stats.correct += 1;
      next.stats.streak += 1;
    } else {
      next.stats.streak = 0;
    }
    persistProgress(next.answers);
  }

  function flip(): void {
    if (!current) return;
    if (state.revealed.has(current.id)) {
      showToast('This card is already revealed.');
      return;
    }
    const revealed = new Set(state.revealed);
    revealed.add(current.id);
    setState({ ...state, revealed });
  }

  function submitMc(value: string): void {
    if (!current) return;
    if (state.revealed.has(current.id)) {
      showToast('You revealed this card; answering is disabled.');
      return;
    }
    const useTermAnswers = state.mcAnswer === 'term';
    const correctValue = useTermAnswers ? current.term : current.definition;
    const correct = value === correctValue;

    const next: EngineState = { ...state, answers: { ...state.answers }, stats: { ...state.stats } };
    gradeCurrent(next, current, correct);
    next.feedback = { kind: 'mc', correct, correctValue, chosenValue: value };
    setState(next);
  }

  function submitFitb(rawInput: string): void {
    if (!current) return;
    if (state.revealed.has(current.id)) {
      showToast('You revealed this card; answering is disabled.');
      return;
    }
    const val = (rawInput || '').trim();
    if (!val) return;

    const target = state.fitbAnswer === 'term' ? current.term : current.definition;
    const correct = checkFitbAnswer(rawInput, target);

    const next: EngineState = { ...state, answers: { ...state.answers }, stats: { ...state.stats } };
    gradeCurrent(next, current, correct);
    next.feedback = { kind: 'fitb', correct, target };
    setState(next);
  }

  function showHint(): void {
    if (!current) return;
    const target = state.fitbAnswer === 'term' ? current.term : current.definition;
    const visible = Math.max(1, Math.ceil(target.length / 3));
    const hint = target.slice(0, visible) + '…';
    setState({ ...state, feedback: { kind: 'hint', hint } });
  }

  function toggleAnswerTarget(): void {
    if (state.mode === 'mc') {
      setState({ ...state, mcAnswer: state.mcAnswer === 'term' ? 'definition' : 'term' });
    } else {
      setState({ ...state, fitbAnswer: state.fitbAnswer === 'term' ? 'definition' : 'term' });
    }
  }

  function gotoRelative(delta: number): void {
    if (!state.deck.length) return;
    const index = (state.index + delta + state.deck.length) % state.deck.length;
    setState({ ...state, index, feedback: null });
  }

  function restart(shuffleDeck: boolean): void {
    const deck = shuffleDeck ? shuffle(state.deck) : state.deck;
    setState({ ...state, deck, index: 0, revealed: new Set(), feedback: null });
  }

  function endSession(): FlashcardSessionSummary {
    const { total, done, correct } = state.stats;
    const summary: FlashcardSessionSummary = {
      total,
      done,
      correct,
      accuracyPct: computeAccuracyPct(correct, done, total),
      revealedCount: state.revealed.size,
      units: Array.from(new Set(state.deck.map((c) => c.unit))),
    };
    setState({ ...state, active: false });
    return summary;
  }

  function resetProgress(): void {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...state, stats: { total: 0, done: 0, correct: 0, streak: 0 }, answers: {} });
    showToast('Progress reset.');
  }

  return {
    deck: state.deck,
    current,
    index: state.index,
    active: state.active,
    mode: state.mode,
    mcAnswer: state.mcAnswer,
    fitbAnswer: state.fitbAnswer,
    stats: state.stats,
    isFront,
    locked,
    mcOptions,
    feedback: state.feedback,
    crumbs,
    progressPct,
    accuracyPct,
    buildDeck: buildDeckAction,
    flip,
    submitMc,
    submitFitb,
    showHint,
    toggleAnswerTarget,
    next: () => gotoRelative(1),
    prev: () => gotoRelative(-1),
    restart,
    endSession,
    resetProgress,
  };
}
