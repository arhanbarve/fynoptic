// Orchestrator / mount point for the Phase 10d practice island, mounted as
// <Practice client:load /> from src/pages/practice.astro (the hero section
// above stays static Astro markup; everything interactive below it —
// wizard, progress/stage cards, and the end-session modal — is this tree).
// Composes:
//   - PracticeWizard.tsx — setup steps 1-3.
//   - usePracticeSession.ts — bank loading + engine session.
//   - Session.tsx — in-session question UI (progress card + stage card).
//   - EndSessionModal.tsx (O7) — dismiss-only confirmation.
import { useEffect, useState, type CSSProperties } from 'react';
import { computeAccuracyPct, usePracticeSession } from '@/hooks/usePracticeSession';
import { EndSessionModal, type SessionEndStats } from './EndSessionModal';
import { PracticeWizard, type WizardSelection } from './PracticeWizard';
import { Session } from './Session';

const CATEGORIES = ['Personal Finance', 'Economics'];

export function Practice() {
  const {
    questions,
    banksLoading,
    session,
    finishSummary,
    start,
    selectChoice,
    toggleEliminate,
    submit,
    next,
    prev,
    restart,
    endSession,
  } = usePracticeSession();
  const [endModalOpen, setEndModalOpen] = useState(false);
  const hasSession = session !== null;

  // practice.ts's initPractice() added this to <body> as its very first
  // statement. legacy.css scopes most of the page's chrome off it via
  // descendant selectors (`.practice-shell .practice-hero`, `.practice-shell
  // .stage.card`, ...) — including the hero section, which lives in
  // practice.astro outside this component's own subtree, so the class has
  // to land on <body> rather than on a wrapper div here.
  useEffect(() => {
    document.body.classList.add('practice-shell');
    return () => {
      document.body.classList.remove('practice-shell');
    };
  }, []);

  function handleWizardComplete(selection: WizardSelection): void {
    start(selection); // toasts internally ('No questions available...' / 'Question pool is empty.') on failure
  }

  // The ONE destructive action (O7) — reachable only from EndSessionModal's
  // explicit "End Session" button, never from ×/Escape/backdrop.
  function handleEndSessionConfirmed(): void {
    endSession();
    setEndModalOpen(false);
  }

  const stats: SessionEndStats = session
    ? {
        answered: session.asked,
        total: session.totalQuestions,
        correct: session.correct,
        accuracyPct: computeAccuracyPct(session.correct, session.asked),
        streak: session.streak,
        difficulty: session.currentDiff ? session.currentDiff[0]!.toUpperCase() + session.currentDiff.slice(1) : '—',
        topicsLabel: session.topics.map((t) => t.replace(/[_-]/g, ' ')).join(', ') || '—',
      }
    : { answered: 0, total: 0, correct: 0, accuracyPct: 0, streak: 0, difficulty: '—', topicsLabel: '—' };

  return (
    <>
      <div className="container">
        {/* practice.astro's original `.card.practice-controls` wrapper —
            required for legacy.css/redesign.css's card-nesting flattening
            (`html body .card.practice-controls` zeroes its own chrome so
            `.wizard-panel` inside carries the single skin). */}
        <div className="card practice-controls">
          {!session && banksLoading && <p className="muted center">Loading questions…</p>}
          {!session && !banksLoading && (
            <PracticeWizard bank={questions} categories={CATEGORIES} hasSession={hasSession} onComplete={handleWizardComplete} />
          )}
        </div>

        {/* Pre-session zero state — the progress + stage cards were always
            present in the static markup (with placeholder stats and the
            "choose a category…" message) regardless of wizard step; Session
            below only mounts once a session exists, so this reproduces the
            same two cards for the setup phase. */}
        {!session && !banksLoading && (
          <>
            <div className="card progress-card">
              <div className="pc-progress" aria-hidden="true">
                <span className="pc-progress-fill" id="pc-progress-fill" style={{ '--p': '0%' } as CSSProperties} />
              </div>
              <div className="pc-stats" id="pc-stats" aria-live="polite" style={{ marginTop: '.5rem' }}>
                <span>
                  <strong id="stat-answered">0</strong>/<span id="stat-total">0</span> answered
                </span>
                <span className="sep">•</span>
                <span>
                  Correct: <strong id="stat-correct">0</strong>
                </span>
                <span className="sep">•</span>
                <span>
                  Streak: <strong id="stat-streak">0</strong>
                </span>
                <span className="sep">•</span>
                <span>
                  Difficulty: <strong id="stat-diff">—</strong>
                </span>
              </div>
            </div>

            <div className="card stage" id="stage">
              <div id="stage-empty" className="empty">
                Choose a category and topic(s), then press <strong>Start Practice</strong>.
              </div>
            </div>
          </>
        )}

        {session && (
          <Session
            session={session}
            finishSummary={finishSummary}
            onSelectChoice={selectChoice}
            onToggleEliminate={toggleEliminate}
            onSubmit={submit}
            onNext={next}
            onPrev={prev}
            onRestart={restart}
            onRequestEndSession={() => setEndModalOpen(true)}
            onFinish={endSession}
          />
        )}
      </div>

      <EndSessionModal open={endModalOpen} onOpenChange={setEndModalOpen} stats={stats} onEndSession={handleEndSessionConfirmed} />
    </>
  );
}
