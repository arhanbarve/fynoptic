// The in-session flashcard UI — `#fc-stage` and `aside#block-progress` from
// flashcard.astro:75-143. This is the presentational counterpart to
// useFlashcardDeck.ts: that hook owns the deck/grading/persistence state,
// this component owns rendering it plus the actual flip-card (via
// FlashcardCard.tsx). Mount it once a deck exists — the wizard/setup steps
// (`.fc-controls[data-step]`, unit + mode selection), the reset-progress
// confirmation dialog, and the session-summary modal are a parallel
// conversion and are NOT part of this file; see the two callback props
// below for the exact seam;
//   - onRequestResetProgress: the Reset Progress button just asks — the
//     confirmation UI (native confirm() today, a Radix dialog after this
//     phase) lives elsewhere and calls `engine.resetProgress()` itself once
//     confirmed.
//   - onRequestEndSession: the End Session button just asks — the original
//     had no confirmation step here (unlike practice's O7), it opened the
//     summary immediately, so the caller is expected to call
//     `engine.endSession()` and open its modal in the same handler.
//
// Preserves exactly (Appendix D, I3/I4):
//   - `is-front` / `is-locked` / `is-correct` / `is-wrong` class names.
//   - The MC-specific lock: answering multiple choice disables its own
//     buttons immediately, independent of `locked` (see useFlashcardDeck's
//     module comment) — driven here by `mcAnswered`, which is exactly
//     `feedback?.kind === 'mc'` (feedback always resets on card change, so
//     this can never "leak" onto a different card).
//   - Fill-in-the-blank has no such self-lock; it stays submittable (and
//     re-gradable) until the card is flipped — only `locked` disables it.
//   - The FITB input's value resets to '' on a new card and autofocuses
//     unless the card is already revealed (flashcard.ts:631-634); it is
//     NOT cleared after a submission on the same card.
import { useEffect, useRef, type CSSProperties, type FormEvent } from 'react';
import type { UseFlashcardDeckResult } from '@/hooks/useFlashcardDeck';
import { FlashcardCard } from './FlashcardCard';

export interface FlashcardViewProps {
  engine: UseFlashcardDeckResult;
  /** The wizard step 2 "Shuffle deck" checkbox's live `checked` state (`els.shuffleToggle?.checked`, flashcard.ts:573) — that control is owned by the wizard step, not this component, but "Restart Deck" needs its current value. */
  shuffleDeck: boolean;
  onRequestResetProgress: () => void;
  onRequestEndSession: () => void;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function answerTargetLabel(target: 'term' | 'definition'): string {
  return target === 'term' ? 'Answer with Term' : 'Answer with Definition';
}

export function FlashcardView({ engine, shuffleDeck, onRequestResetProgress, onRequestEndSession }: FlashcardViewProps) {
  const { current, mode, mcAnswer, fitbAnswer, isFront, locked, mcOptions, feedback, stats, crumbs, progressPct, accuracyPct } = engine;
  const fitbInputRef = useRef<HTMLInputElement>(null);

  // flashcard.ts:631-634 — a fresh card clears the input and autofocuses it
  // unless already revealed. Deliberately keyed on `current?.id` only, not
  // on every feedback/state change, so a submission on the SAME card never
  // clears what was typed.
  useEffect(() => {
    if (!fitbInputRef.current) return;
    fitbInputRef.current.value = '';
    if (!locked) fitbInputRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on card identity only, matching renderCard's call sites.
  }, [current?.id]);

  const mcFeedback = feedback?.kind === 'mc' ? feedback : null;
  const fitbFeedback = feedback?.kind === 'fitb' ? feedback : null;
  const hintFeedback = feedback?.kind === 'hint' ? feedback : null;
  const mcAnswered = mcFeedback !== null;
  const isMc = mode === 'mc';
  const answerTarget = isMc ? mcAnswer : fitbAnswer;

  function handleFitbSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    engine.submitFitb(fitbInputRef.current?.value ?? '');
  }

  return (
    <>
      <aside className="fc-block fc-progress" id="block-progress">
        <h3 className="fc-label">Progress</h3>
        <div className="bar">
          <div id="progress-fill" className="fill" style={{ '--p': `${progressPct}%`, width: `${progressPct}%` } as CSSProperties} />
        </div>
        <ul className="stats">
          <li>
            <strong id="stat-total">{stats.total}</strong>
            <span>Total</span>
          </li>
          <li>
            <strong id="stat-done">{stats.done}</strong>
            <span>Completed</span>
          </li>
          <li>
            <strong id="stat-correct">{stats.correct}</strong>
            <span>Correct</span>
          </li>
          <li>
            <strong id="stat-acc">{accuracyPct}%</strong>
            <span>Accuracy</span>
          </li>
          <li>
            <strong id="stat-streak">{stats.streak}</strong>
            <span>Streak</span>
          </li>
        </ul>
      </aside>

      <div id="fc-stage" className="fc-stage card" aria-live="polite">
        <div className="fc-top">
          <div className="crumbs">
            <span id="crumbs-text">{crumbs}</span>
          </div>
          <div className="stage-actions">
            <button id="reset-progress" className="btn btn-ghost" type="button" title="Clear saved progress" onClick={onRequestResetProgress}>
              Reset Progress
            </button>
            <button id="end-btn" className="btn btn-ghost" type="button" onClick={onRequestEndSession}>
              End Session
            </button>
          </div>
        </div>

        {current && <FlashcardCard term={current.term} definition={current.definition} isFront={isFront} />}

        <div id="answer-area">
          <button id="mc-toggle-answer" className="pill-toggle" type="button" onClick={engine.toggleAnswerTarget}>
            {answerTargetLabel(answerTarget)}
          </button>

          <div id="mc-area" className={cx('mc-area', locked && 'is-locked')} role="group" aria-label="Multiple choice options" hidden={!isMc}>
            {mcOptions.map((opt) => {
              const isCorrectOpt = mcFeedback !== null && opt === mcFeedback.correctValue;
              const isWrongOpt = mcFeedback !== null && opt === mcFeedback.chosenValue && !mcFeedback.correct;
              const disabled = mcAnswered || locked;
              return (
                <button
                  key={opt}
                  type="button"
                  className={cx('mc-option', isCorrectOpt && 'is-correct', isWrongOpt && 'is-wrong')}
                  data-value={opt}
                  disabled={disabled}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  onClick={() => engine.submitMc(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <form id="fitb-form" className="fitb-area" hidden={isMc} onSubmit={handleFitbSubmit}>
            <label htmlFor="fitb-input" className="sr-only">
              Type your answer
            </label>
            <input
              id="fitb-input"
              ref={fitbInputRef}
              type="text"
              placeholder={fitbAnswer === 'term' ? 'Type the term…' : 'Type the definition…'}
              autoComplete="off"
              disabled={locked}
            />
            <button className="btn btn-primary" type="submit" disabled={locked}>
              Check
            </button>
            <button className="btn btn-ghost" type="button" id="fitb-hint" disabled={locked} onClick={engine.showHint}>
              Hint
            </button>
          </form>

          <div
            id="feedback"
            className={cx('feedback', feedback && (feedback.kind === 'hint' || feedback.correct ? 'ok' : 'bad'))}
            aria-live="polite"
            hidden={!feedback}
          >
            {mcFeedback && (mcFeedback.correct ? 'Nice! ✅' : (
              <>
                Not quite. The answer is <strong>{mcFeedback.correctValue}</strong>.
              </>
            ))}
            {fitbFeedback && (fitbFeedback.correct ? 'Correct! ✅' : (
              <>
                Answer: <strong>{fitbFeedback.target}</strong>
              </>
            ))}
            {hintFeedback && (
              <>
                Hint: <strong>{hintFeedback.hint}</strong>
              </>
            )}
          </div>
        </div>

        <div className="fc-nav">
          <button id="prev-btn" className="btn btn-ghost" onClick={engine.prev}>
            ← Prev
          </button>
          <div className="gap" />
          <button id="flip-btn" className="btn btn-primary btn-flip-big" type="button" onClick={engine.flip} disabled={locked} aria-disabled={locked}>
            Flip Card
          </button>
          <div className="gap" />
          <button id="next-btn" className="btn btn-ghost" onClick={engine.next}>
            Next →
          </button>
        </div>

        <div className="fc-bottom">
          <button id="restart-btn" className="btn btn-ghost" onClick={() => engine.restart(shuffleDeck)}>
            Restart Deck
          </button>
        </div>
      </div>
    </>
  );
}
