// Orchestrator for the Phase 10e flashcards island — mounted as
// <Flashcards client:load /> once flashcard.astro is ready to retire
// islands/flashcard.ts (not yet: see the note at the bottom of this file).
//
// Composes:
//   - FlashcardWizard.tsx    — unit/mode setup steps 1-3 (this task's scope).
//   - useFlashcardDeck.ts    — deck engine: builds the deck, owns mode +
//     the two independent per-mode answer-target flags, grading, MC
//     distractors, feedback, progress/accuracy, and localStorage
//     persistence (a parallel task's scope — see that file's header).
//   - FlashcardView.tsx      — the in-session stage (flip card + answer
//     area + nav), also a parallel task's scope. It only *asks* to reset
//     progress or end the session via its two callback props; this file
//     owns what happens next (opening the confirmation dialog / summary
//     modal), matching the seam documented in its own header comment.
//   - ResetProgressDialog.tsx / SummaryModal.tsx (this task's scope).
//
// Mode + per-mode answer-target ownership: the hook keeps `mcAnswer` and
// `fitbAnswer` as two independent fields, both seeded here from the
// wizard's own local `wizardMode` state (defaulting to 'term' each,
// flashcard.ts's original default) when `buildDeck` is called.
// `toggleAnswerTarget()` — rendered inside FlashcardView, called on the
// engine — only ever flips whichever one matches the current session's
// mode; switching modes never resets or reads the other mode's flag. That
// independence lives entirely in the hook; this file only ever reads it
// back out when summarizing a session or reseeding a new one.
import { useEffect, useRef, useState } from 'react';
import { FLASHCARD_UNITS } from '../../data/flashcard-units';
import { useFlashcardDeck } from '../../hooks/useFlashcardDeck';
import { FlashcardView } from './FlashcardView';
import { FlashcardWizard, type Mode } from './FlashcardWizard';
import { ResetProgressDialog } from './ResetProgressDialog';
import { SummaryModal, type SummaryStats } from './SummaryModal';

const ALL_UNITS = Object.keys(FLASHCARD_UNITS);

const EMPTY_SUMMARY: SummaryStats = { total: 0, done: 0, correct: 0, accuracyPct: 0, revealedCount: 0 };

export function Flashcards() {
  const [unitsSelected, setUnitsSelected] = useState<Set<string>>(new Set());
  const [wizardMode, setWizardMode] = useState<Mode>('mc');
  const [shuffleDeck, setShuffleDeck] = useState(true);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [endedSummary, setEndedSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [endedUnits, setEndedUnits] = useState<string[]>([]);
  const [showEndChip, setShowEndChip] = useState(false);
  const endChipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engine = useFlashcardDeck();

  useEffect(() => {
    return () => {
      if (endChipTimer.current) clearTimeout(endChipTimer.current);
    };
  }, []);

  // flashcard.ts's mcAnswer/fitbAnswer live at module scope and are set once
  // at page load — starting a new session never reset them, so toggling
  // "Answer with Definition" in one session and then ending it, reselecting
  // units, and starting a new session left that choice in place. The hook's
  // buildDeck defaults each to 'term' when its opts omit them (a fresh-state
  // reset on every build), so the current values have to be threaded
  // through explicitly here to preserve that carry-over across session
  // restarts within the same page load.
  function handleStart(): void {
    engine.buildDeck(Array.from(unitsSelected), {
      mode: wizardMode,
      shuffleDeck,
      mcAnswer: engine.mcAnswer,
      fitbAnswer: engine.fitbAnswer,
    }); // toasts internally ('Select at least one unit.') on failure
  }

  // "End Session" ends immediately and opens the summary — flashcard.ts's
  // endSession() has no separate confirmation step (unlike reset-progress,
  // which does). Closing the summary afterwards is never destructive (the
  // session has already ended), so it's safe to let Radix's normal
  // Escape/backdrop dismissal apply to it too — see SummaryModal.tsx's
  // header comment for why that's a deliberate relaxation from the original.
  function handleEndSession(): void {
    const summary = engine.endSession();
    setEndedSummary({
      total: summary.total,
      done: summary.done,
      correct: summary.correct,
      accuracyPct: summary.accuracyPct,
      revealedCount: summary.revealedCount,
    });
    setEndedUnits(summary.units);
    setSummaryOpen(true);
  }

  // Fires on ANY summary-modal dismissal (×, Escape, backdrop). Mirrors
  // returnToUnitSelection()'s "Session ended" chip, shown for 6s.
  function handleSummaryOpenChange(open: boolean): void {
    setSummaryOpen(open);
    if (!open) {
      setShowEndChip(true);
      if (endChipTimer.current) clearTimeout(endChipTimer.current);
      endChipTimer.current = setTimeout(() => setShowEndChip(false), 6000);
    }
  }

  return (
    <>
      {!engine.active && (
        <FlashcardWizard
          allUnits={ALL_UNITS}
          unitsSelected={unitsSelected}
          onUnitsSelectedChange={setUnitsSelected}
          mode={wizardMode}
          onModeChange={setWizardMode}
          shuffleDeck={shuffleDeck}
          onShuffleDeckChange={setShuffleDeck}
          onStart={handleStart}
        />
      )}

      {showEndChip && (
        <div className="end-chip">
          <span className="dot" aria-hidden="true" />
          Session ended
        </div>
      )}

      {engine.active && (
        <FlashcardView engine={engine} shuffleDeck={shuffleDeck} onRequestResetProgress={() => setResetDialogOpen(true)} onRequestEndSession={handleEndSession} />
      )}

      <ResetProgressDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} onConfirm={engine.resetProgress} />
      <SummaryModal open={summaryOpen} onOpenChange={handleSummaryOpenChange} stats={endedSummary} units={endedUnits} />
    </>
  );
}

// NOTE ON MOUNTING: flashcard.astro still runs the vanilla
// islands/flashcard.ts (production behavior is unaffected by this file).
// This component is not wired into that page yet — wire up
// `<Flashcards client:load />` in flashcard.astro (replacing the
// `initFlashcards()` script block and the markup it drives) once this whole
// tree has an e2e pass against flashcards.spec.ts.
