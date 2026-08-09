// Port of src/islands/course-one.ts's initPreQuiz() (lines 793-847) plus the
// module-level PRE_ITEMS content (598-719) and the renderQuiz/gradeQuiz
// helpers as they apply to a diagnostic, no-rationale-shown quiz (see below).
//
// Per CourseOne.tsx's contract, PreQuiz owns its own grading and its own
// toast/track/scroll side effects — useCourseState only ever receives the
// already-graded QuizSubmission via `onSubmit`.
//
// Deliberately NOT reproduced: the rationale <div class="drawer"> that
// gradeQuiz() appends to `.result` (course-one.ts:582-587). That mutation is
// applied to the DOM and then immediately clobbered in the same click
// handler by the very next statement, `renderQuiz(preRoot, PRE_ITEMS,
// undefined, { ..., revealMarks: true })` (course-one.ts:835-839), which
// does `root.innerHTML = ''` and rebuilds every `.result` with only
// `textContent = ok ? 'Correct.' : 'Incorrect.'` — no rationale. No paint
// happens between those two statements, so the rationale has never been
// visible to a user; reproducing it here would be a new, visible behavior,
// not a faithful port.
import { useState } from 'react';
import type { PreQuizProps } from './CourseOne';
import type { QuizSubmission } from '../../hooks/useCourseState';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';

interface PreItem {
  stem: string;
  options: string[];
  answerIndex: number;
}

const PRE_ITEMS: readonly PreItem[] = [
  {
    stem: 'A checkout shows a $19 warranty box pre-checked. What do you do first?',
    options: [
      'Uncheck the warranty, screenshot the cart, then continue checkout. ✅',
      'Uncheck the warranty and proceed without taking any screenshots.',
      'Leave the warranty checked, then contact support after receiving any charges.',
      'Close the tab and search for a cheaper seller before buying.',
    ],
    answerIndex: 0,
  },
  {
    stem: 'The cancel flow highlights “Pause” with a large button while “Cancel” is tiny and gray. Best next step?',
    options: [
      'Click the prominent Pause option and assume it cancels later.',
      'Search the page for explicit cancel wording, screenshot the UI, then choose cancel. ✅',
      'Call support immediately to ask what Pause actually does.',
      'Close the site and try again another day without screenshots.',
    ],
    answerIndex: 1,
  },
  {
    stem: 'A service requires phone calls only, weekdays 9–5 to cancel. You can call once this week. What protects you most?',
    options: [
      'Call once, request cancellation, and keep a dated note of the agent’s name. ✅',
      'Call multiple times until you reach a supervisor and take no notes.',
      'Skip calling; instead file a complaint with your card issuer immediately.',
      'Visit the company in person and rely on verbal confirmation.',
    ],
    answerIndex: 0,
  },
  {
    stem: 'A banner says “62 people viewing now” with no source. What’s the reasonable consumer action?',
    options: [
      'Rush to buy because the number likely means low stock.',
      'Ignore the banner and open another tab to compare price and stock. ✅',
      'Ask chat support to confirm the banner’s accuracy before deciding.',
      'Add to cart, then wait 24 hours to see if price drops.',
    ],
    answerIndex: 1,
  },
  {
    stem: 'After clicking “No thanks,” a modal re-labels buttons with vague text. What should you do before clicking?',
    options: [
      'Use keyboard/tab keys to select the intended action, then screenshot before and after. ✅',
      'Click the large button quickly to avoid extra popups.',
      'Reload the page and attempt the flow without any screenshots.',
      'Contact support to ask which button is correct before proceeding.',
    ],
    answerIndex: 0,
  },
  {
    stem: 'A free trial requires a credit card and hides renewal terms in Billing Details. What’s the safest pre-signup step?',
    options: [
      'Sign up and rely on your calendar memory to cancel in time.',
      'Record the billing page, note trial length, and set a calendar reminder before signing. ✅',
      'Never use free trials; ignore the product entirely.',
      'Use your main email and enable autofill to speed registration.',
    ],
    answerIndex: 1,
  },
  {
    stem: 'You notice an unexpected line item in your cart total you didn’t add. Which evidence is most useful?',
    options: [
      'Screenshot of the cart showing the unexpected line item and the full total. ✅',
      'Photo of the product page after checkout.',
      'The merchant’s merchant ID number on their homepage.',
      'A comment from another buyer complaining about extra charges.',
    ],
    answerIndex: 0,
  },
  {
    stem: 'The signup form bundles marketing emails with required consent. What’s the safest approach?',
    options: [
      'Check the box and assume you can opt out later from settings.',
      'Look for separate marketing or communications settings, or use an alternate email address. ✅',
      'Abandon the signup entirely because bundled consent is always enforceable.',
      'Call support to request the checkbox be removed before signing up.',
    ],
    answerIndex: 1,
  },
  {
    stem: 'You see a pop-up claiming “Only loyal customers keep this.” What does this aim to do and what should you do?',
    options: [
      'It is a loyalty program notice; enroll now for benefits.',
      'It uses guilt to discourage leaving; proceed with your plan and save confirmation. ✅',
      'It is a legal requirement to disclose fees; read the TOS immediately.',
      'It’s a sign of a broken site; try again later.',
    ],
    answerIndex: 1,
  },
  {
    stem: 'You were unsuccessful with several pre-quiz items. Which short remediation would help you most?',
    options: [
      'Read a two-minute example showing one cancellation and one refund scenario with screenshots. ✅',
      'Re-take the pre-quiz immediately without additional materials.',
      'Jump ahead to Module 3 and assume practice will fill gaps.',
      'Read the full platform T&Cs for each merchant in the course examples.',
    ],
    answerIndex: 0,
  },
];

/* hide "✅" until reveal=true — course-one.ts:466-468 */
function sanitizeOptionText(opt: string, reveal: boolean): string {
  return reveal ? opt : opt.replace(/\s*✅/g, '');
}

export function PreQuiz({ state, onAnswerChange, onSubmit }: PreQuizProps) {
  const completed = state.completed;

  const [choices, setChoices] = useState<(number | null)[]>(() =>
    PRE_ITEMS.map((_, idx) => {
      const saved = state.answers[idx];
      return typeof saved === 'number' ? saved : null;
    }),
  );

  const allAnswered = choices.every((c) => c !== null);

  function handleChoice(idx: number, value: number): void {
    if (completed) return;
    setChoices((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
    onAnswerChange(idx, value);
  }

  function handleSubmit(): void {
    if (completed || !allAnswered) return;
    const correctness = PRE_ITEMS.map((q, idx) => choices[idx] === q.answerIndex);
    const correct = correctness.filter(Boolean).length;
    const pct = Math.round((correct / PRE_ITEMS.length) * 100);
    const result: QuizSubmission = { score: pct, answers: [...choices], correctness };
    onSubmit(result);
    track('pre_quiz_submit', { score: pct });
    showToast('Pre-quiz completed. Module 1 video unlocked.', 'success');
    document.querySelector('#module-1')?.scrollIntoView({ behavior: 'smooth' });
  }

  const correctCount = state.correctness.filter(Boolean).length;
  const resultText = completed ? `Score: ${correctCount}/${PRE_ITEMS.length} (${state.score}%). Diagnostic only.` : '';

  return (
    <>
      <h2 id="pre-title">Pre-Quiz — 10 items (diagnostic)</h2>
      <p className="subtle">Notes: low-jargon, stimulus-focused. Read time ~6–8 minutes.</p>

      <div id="pre-quiz-root" className="quiz-card" aria-live="polite">
        {PRE_ITEMS.map((q, idx) => {
          const ok = state.correctness[idx];
          const cardClass = completed ? `q-item ${ok ? 'correct' : 'incorrect'}` : 'q-item';
          return (
            <div className={cardClass} key={idx}>
              <div className="q-title">
                {idx + 1}. {q.stem}
              </div>
              <div className="q-options">
                {q.options.map((opt, i) => (
                  <label key={i}>
                    <input
                      type="radio"
                      name={`q${idx}`}
                      value={i}
                      checked={choices[idx] === i}
                      disabled={completed}
                      onChange={() => handleChoice(idx, i)}
                    />
                    <span>{sanitizeOptionText(opt, completed)}</span>
                  </label>
                ))}
              </div>
              <div className="result">{completed ? (ok ? 'Correct.' : 'Incorrect.') : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="gate">
        <button
          className="btn btn-primary"
          id="pre-submit"
          type="button"
          disabled={completed || !allAnswered}
          aria-disabled={completed || !allAnswered}
          onClick={handleSubmit}
        >
          Submit Pre-Quiz
        </button>
        <span className="locknote">Complete all 10 items to continue.</span>
      </div>
      <div id="pre-result" className="result">
        {resultText}
      </div>
    </>
  );
}
