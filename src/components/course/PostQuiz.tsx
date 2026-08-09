// Faithful port of src/islands/course-one.ts's loadPOST() (post-quiz render/
// grade/retake, course-one.ts:1138-1218) plus the #post-quiz markup
// (courseone.astro:349-361). See CourseOne.tsx's PostQuizProps for the exact
// contract this component is built against.
//
// Key departure from the original's DOM-closure model: course-one.ts kept
// each GradableItem's `choice` as a mutable field on a plain object captured
// by renderQuiz's event listeners. Here `state.answers` (persisted via
// useCourseState, autosaved on every radio change through onAnswerChange)
// IS that mutable slot — there is no parallel local copy to keep in sync.
// Only the fetched quiz content itself (stem/options/answer index/rationale)
// is local component state, following the "gate on the real target state"
// idempotent-loader shape from CourseOne.tsx's header comment: the effect
// re-runs harmlessly under StrictMode's double-invoke because it bails out
// the instant `items` is non-null.
//
// Retake (course-one.ts:1149-1157's resetPostQuiz): clears answers/
// correctness and re-enables submission — it does NOT refetch quiz.json,
// so `items` (the loaded question bank) is left alone across a retake.
// actions.retakePostQuiz() already does the state reset; this component's
// onRetake handler only adds the matching toast, exactly like the original.
import { useEffect, useState } from 'react';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';
import { parseQuiz } from '../../schemas';
import type { PostQuizSubmission } from '../../hooks/useCourseState';
import type { PostQuizProps } from './CourseOne';

interface PostQuizItem {
  stem: string;
  options: string[];
  answerIndex: number;
  rationale: string;
}

export function PostQuiz({ state, locked, onAnswerChange, onSubmit, onRetake }: PostQuizProps) {
  const [items, setItems] = useState<PostQuizItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (locked || items !== null || loadFailed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/quiz.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const parsed = parseQuiz(raw).map((item) => ({
          stem: item.stem,
          options: item.options,
          answerIndex: item.answer_index,
          rationale: item.rationale,
        }));
        if (!cancelled) setItems(parsed);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, items, loadFailed]);

  if (loadFailed) {
    return (
      <div className="subtle">
        Couldn't load <code>quiz.json</code>. If this page is opened via <code>file://</code>, some browsers block local fetch. Run a small local
        server (e.g., <code>python -m http.server</code>), or host the files.
      </div>
    );
  }

  const allAnswered = items !== null && items.every((_item, idx) => state.answers[idx] !== null && state.answers[idx] !== undefined);
  const showRetake = state.completed && !state.pass;

  function handleSubmit(): void {
    if (!items || !allAnswered) return;
    let correct = 0;
    const correctness = items.map((q, idx) => {
      const ok = state.answers[idx] === q.answerIndex;
      if (ok) correct += 1;
      return ok;
    });
    const total = items.length;
    const pct = Math.round((correct / total) * 100);
    const pass = pct >= 80;
    const result: PostQuizSubmission = { score: pct, answers: [...state.answers], correctness, pass };
    onSubmit(result);
    track('post_quiz_submit', { score: pct, pass });

    if (pass) {
      showToast('Assessment passed. Certificate unlocked.', 'success');
      // Deferred one frame so the certificate section (mounted by the
      // parent off this same `pass` flip) exists in the DOM before we try
      // to scroll to it — course-one.ts didn't need this because its
      // #certificate section was always present in markup, just visually
      // gated by CSS; here it doesn't render at all until `pass` is true.
      requestAnimationFrame(() => {
        document.querySelector('#certificate')?.scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      showToast('Score below 80%. You can retake the assessment.', 'error');
    }
  }

  function handleRetake(): void {
    onRetake();
    showToast('You can retake the assessment now.', 'info');
  }

  return (
    <>
      <h2 id="post-title">Post-Quiz — scenario-rich assessment</h2>
      <p className="subtle">Notes: each item tests judgment, sequencing, or evidence quality; explanations shown after submit.</p>

      <div id="post-quiz-root" className="quiz-card" aria-live="polite">
        {items?.map((q, idx) => {
          const choice = state.answers[idx] ?? null;
          const ok = state.correctness[idx];
          const cardClass = ['q-item', ok === true ? 'correct' : '', ok === false ? 'incorrect' : ''].join(' ').trim();
          return (
            <div className={cardClass} key={idx}>
              <div className="q-title">
                {idx + 1}. {q.stem}
              </div>
              <div className="q-options">
                {q.options.map((opt, i) => (
                  <label key={i}>
                    <input type="radio" name={`q${idx}`} value={i} checked={choice === i} onChange={() => onAnswerChange(idx, i)} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              <div className="result">
                {ok !== null && ok !== undefined && (
                  <>
                    {ok ? 'Correct.' : 'Incorrect.'}
                    {q.rationale && <div className="drawer">Rationale: {q.rationale}</div>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="gate">
        <button className="btn btn-primary" id="post-submit" aria-disabled={!allAnswered} disabled={!allAnswered} onClick={handleSubmit}>
          Submit Assessment
        </button>
        {showRetake && (
          <button className="btn btn-ghost" id="post-retake" onClick={handleRetake}>
            Retake Assessment
          </button>
        )}
        <span className="locknote">Score ≥ 80% to unlock certificate.</span>
      </div>
      <div id="post-result" className="result">
        {state.completed && items && `Score: ${state.correctness.filter(Boolean).length}/${items.length} (${state.score}%). ${
          state.pass ? 'Pass ✅' : 'Below 80% — review and try again.'
        }`}
      </div>
    </>
  );
}
