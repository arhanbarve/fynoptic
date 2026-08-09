// React port of src/islands/course-one.ts's loadIdExercise() (course-one.ts:
// 856-950), mounted as a sibling of <Module unit={2}> inside #module-2 (see
// CourseOne.tsx's IdExerciseProps / IdExercisePlaceholder call site — that
// file documents the exact contract this component implements).
//
// Grading is all-or-nothing: `onComplete()` (-> useCourseState's
// completeIdExercise(), which sets CourseState.m2.idExercise) only fires
// when every item in the same submit pass is correct. A wrong pass re-shows
// per-item correct/incorrect feedback and leaves the button enabled so the
// learner can fix and resubmit — it does not gate item-by-item.
//
// Faithful behavioral quirk kept from the original: changing any single
// radio after a graded pass clears ONLY that item's feedback (course-one.ts's
// change listener: `card.classList.remove('correct','incorrect')`), and
// because the original's submit-button enable check
// (`items.every(x => x.choice !== null)`) runs again on every change with no
// separate "already succeeded" flag, touching any radio after an all-correct
// pass re-enables the button (`successLock` below reproduces that exactly:
// it is set on a correct submit and cleared by any subsequent choice change,
// not persisted any other way).
//
// Data comes from public/data/id-exercise.json, parsed with the existing
// zod schema (src/schemas.ts's parseIdExercise) rather than duplicating
// validation here.
import { useEffect, useRef, useState } from 'react';
import { parseIdExercise } from '../../schemas';
import type { IdExerciseItem } from '../../types';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';
import type { IdExerciseProps } from './CourseOne';

export function IdExercise({ locked, onComplete }: IdExerciseProps) {
  const [items, setItems] = useState<IdExerciseItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [choices, setChoices] = useState<Array<number | null>>([]);
  // Parallel to `items`: the choice each item was graded against on the
  // last submit, or null if that item has never been graded, or was
  // graded and then changed (see header comment). null => render no
  // correct/incorrect state for that item, matching the original's
  // untouched `.q-item` (no `correct`/`incorrect` class yet).
  const [graded, setGraded] = useState<Array<number | null>>([]);
  const [resultText, setResultText] = useState('');
  const [successLock, setSuccessLock] = useState(false);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Idempotent-loader pattern 2 (gate on real target state, not a latch):
  // only fetches while unlocked and not already loaded/errored, so
  // StrictMode's double-invoke is a harmless redundant fetch at worst.
  useEffect(() => {
    if (locked || items !== null || loadError) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/id-exercise.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('id-exercise.json not reachable');
        const raw = await res.json();
        const parsed = parseIdExercise(raw);
        if (!parsed.length) throw new Error('No items in id-exercise.json');
        if (cancelled) return;
        setItems(parsed);
        setChoices(parsed.map(() => null));
        setGraded(parsed.map(() => null));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, items, loadError]);

  const canSubmit = items !== null && items.length > 0 && choices.length === items.length && choices.every((c) => c !== null);
  const submitDisabled = !canSubmit || successLock;

  function handleChoice(idx: number, value: number): void {
    setChoices((prev) => prev.map((c, i) => (i === idx ? value : c)));
    setGraded((prev) => prev.map((g, i) => (i === idx ? null : g)));
    setSuccessLock(false);
  }

  function handleSubmit(): void {
    if (!items || submitDisabled) return;
    let correct = 0;
    items.forEach((it, idx) => {
      if ((choices[idx] ?? null) === it.answer_index) correct++;
    });
    setGraded(choices.slice());

    const total = items.length;
    const allCorrect = correct === total;
    setResultText(allCorrect ? `All ${total}/${total} correct.` : `${total - correct} incorrect. Fix and check again.`);

    if (allCorrect) {
      setSuccessLock(true);
      track('id_exercise_complete', { items: total, correct });
      showToast('Identification exercise completed.', 'success');
      onComplete();
    } else {
      const firstBadIdx = items.findIndex((it, idx) => (choices[idx] ?? null) !== it.answer_index);
      if (firstBadIdx !== -1) {
        itemRefs.current[firstBadIdx]?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
      }
    }
  }

  return (
    <div className="content-card mt-1">
      <h3>Identification Exercise (text-only, 10 items, 6–8 minutes)</h3>
      <div id="id-ex-root" className="id-grid" aria-live="polite">
        {loadError && (
          <div className="subtle">
            Couldn&apos;t load <code>id-exercise.json</code>. If this page is opened via <code>file://</code>, some browsers block local fetch. Run a
            local server or keep using the fallback.
          </div>
        )}
        {items?.map((it, idx) => {
          const gradedChoice = graded[idx] ?? null;
          const isGraded = gradedChoice !== null;
          const isCorrect = isGraded && gradedChoice === it.answer_index;
          return (
            <div
              key={it.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className={`q-item${isGraded ? (isCorrect ? ' correct' : ' incorrect') : ''}`}
            >
              <div className="q-title">{it.vignette}</div>
              <div className="q-options">
                {it.options.map((opt, i) => (
                  <label key={i}>
                    <input type="radio" name={`id${idx}`} value={i} checked={(choices[idx] ?? null) === i} onChange={() => handleChoice(idx, i)} />
                    {opt}
                  </label>
                ))}
              </div>
              <div className="result">
                {isGraded &&
                  (isCorrect ? (
                    <>
                      {`Correct. Recommended counter-move: ${it.countermove}`}
                      <div className="drawer">{`Rationale: ${it.rationale}`}</div>
                    </>
                  ) : (
                    'Incorrect — try again.'
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="gate">
        <button id="id-ex-submit" className="btn btn-primary" aria-disabled={submitDisabled} disabled={submitDisabled} onClick={handleSubmit}>
          Finish exercise
        </button>
        <span className="locknote">Answer all items (instant feedback shown).</span>
      </div>
      <div id="id-ex-result" className="result">
        {resultText}
      </div>
    </div>
  );
}
