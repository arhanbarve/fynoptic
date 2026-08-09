// React port of the setup wizard half of islands/practice.ts (Phase 10d).
// Scope: steps 1-3 (category/questions/adaptive -> units -> confirm+start).
// The in-session question UI (Session.tsx) and the adaptive engine
// (usePracticeSession.ts) belong to a different task and are NOT built
// here — see PracticeWizardProps.onComplete below for the handoff point.
//
// Behavior preserved exactly from islands/practice.ts:
//   - The hidden <select multiple> becomes a Set<string> in state, but
//     changing category still clears the topic selection immediately
//     (refreshTopicsUIForCategory() used to rebuild the hidden <select>'s
//     <option>s from scratch on category 'change', which drops all prior
//     selections as a side effect — replicated here by resetting the Set
//     in the same handler that changes `category`).
//   - "Select at least one unit" gate lives on step 2 -> 3, not on Start;
//     the toast text is byte-identical to today's: 'Please select at least
//     one unit.' (islands/practice.ts:154). Do not "fix" the wording to
//     match startPractice()'s differently-worded, currently-unreachable
//     'Please select at least one topic.' check (:624) — that check can
//     never fire once step 2 already guarantees a non-empty selection, so
//     it isn't ported here at all (dead code, not carried forward).
//   - Step 3's summary line (#wiz-summary) keeps its exact punctuation and
//     pluralization; it's now the accessible text companion (sr-only) to
//     the visual summary card below, rather than the only summary on-screen.
//
// Design-fixes batch, commit 8 (2026-08-09): all three steps got a visual
// pass — a step indicator, bank cards, pill groups, per-topic counts, and a
// structured step-3 summary card.
//   - #category / #question-count / #adapt-every stay real <select>
//     elements (visually hidden via .sr-only, never display:none), because
//     practice.spec.ts drives them with page.selectOption(...) and
//     body[data-cat] (legacy.css contract I3) is keyed off #category's
//     value. The new cards/pills call the same state setters the selects
//     do — they don't replace them, they front them.
//   - .topic-btn's role="checkbox" now pairs with aria-checked (was
//     aria-pressed, a genuine ARIA mismatch). practice.spec.ts asserts on
//     .is-selected, not the ARIA attribute, so fixing this is safe.
//   - The comment that used to live here claiming topic chips show raw
//     slugs like "cash_flow" described a bank that's no longer shipped —
//     the shipped topic keys are already human-readable ("Macroeconomic
//     Theory", "Fixed Income & Bonds"). There's no prettification to
//     build; the per-topic question count shown alongside each chip is
//     computed straight from `bank`.
import { useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/toast';
import type { PracticeBank } from '@/types';

export interface WizardSelection {
  category: string;
  topics: string[];
  totalQuestions: number;
  adaptWindow: number;
  adaptive: boolean;
}

export interface PracticeWizardProps {
  /** Merged question bank (Personal Finance + Economics), already fetched by the caller. */
  bank: PracticeBank;
  /** Category options, in display order. Listed explicitly (not derived from `bank`'s keys) because the <select> must render before any bank fetch resolves — matches practice.astro's static <option>s. */
  categories: string[];
  /**
   * `session !== null` from usePracticeSession. This wizard only ever mounts
   * while there is no session (Practice.tsx unmounts it once one starts), so
   * this is always false in practice today — passed through anyway so
   * `#reset-btn`'s disabled state is wired to the real source of truth
   * rather than a hardcoded literal, matching practice.ts's own
   * `elReset.disabled = false` (on session start) / `= true` (on reset)
   * pairing (10d fix: it used to ship enabled with no session at all).
   */
  hasSession: boolean;
  /** Fired when the user presses "Start Practice" on step 3. The caller owns createSession()/session state from here. */
  onComplete: (selection: WizardSelection) => void;
}

const QUESTION_COUNT_OPTIONS = [10, 20, 30, 40, 50] as const;
const ADAPT_EVERY_OPTIONS = [5, 10, 15, 20] as const;
const STEP_LABELS = ['Build session', 'Choose units', 'Start practice'] as const;

/** Sum of a topic's question counts across its difficulty buckets. */
function countTopicQuestions(byDifficulty: Record<string, unknown[]> | undefined): number {
  if (!byDifficulty) return 0;
  return Object.values(byDifficulty).reduce((sum, items) => sum + items.length, 0);
}

export function PracticeWizard({ bank, categories, hasSession, onComplete }: PracticeWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState(categories[0] ?? '');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [totalQuestions, setTotalQuestions] = useState(20);
  const [adaptive, setAdaptive] = useState(true);
  const [adaptWindow, setAdaptWindow] = useState(10);

  const topics = useMemo(() => Object.keys(bank[category] ?? {}).sort(), [bank, category]);

  // Per-topic question counts for the current category (step 2 chip badges,
  // step 3's "Drawing from" total). Derived from the real bank data rather
  // than any hardcoded table, so it can't go stale the way a comment can.
  const topicCounts = useMemo(() => {
    const catBank = bank[category] ?? {};
    const counts: Record<string, number> = {};
    for (const t of Object.keys(catBank)) counts[t] = countTopicQuestions(catBank[t]);
    return counts;
  }, [bank, category]);

  // Per-category topic/question totals for the step 1 bank cards.
  const bankStats = useMemo(() => {
    const stats: Record<string, { topics: number; questions: number }> = {};
    for (const cat of categories) {
      const catBank = bank[cat] ?? {};
      const topicKeys = Object.keys(catBank);
      const questions = topicKeys.reduce((sum, t) => sum + countTopicQuestions(catBank[t]), 0);
      stats[cat] = { topics: topicKeys.length, questions };
    }
    return stats;
  }, [bank, categories]);

  const drawingFrom = useMemo(
    () => [...selectedTopics].reduce((sum, t) => sum + (topicCounts[t] ?? 0), 0),
    [selectedTopics, topicCounts],
  );

  // I3: `data-cat` on <body> drives legacy.css's `body[data-cat="Economics"]`
  // rules (topics-card sizing/typography). practice.ts kept this in sync on
  // #category's 'change' event plus once at init; this effect covers both.
  useEffect(() => {
    document.body.setAttribute('data-cat', category);
  }, [category]);

  function handleCategoryChange(next: string): void {
    setCategory(next);
    setSelectedTopics(new Set()); // category change always clears topic selection
  }

  function toggleTopic(t: string): void {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function selectAllTopics(): void {
    setSelectedTopics(new Set(topics));
  }

  function clearAllTopics(): void {
    setSelectedTopics(new Set());
  }

  function goNext2(): void {
    if (selectedTopics.size === 0) {
      showToast('Please select at least one unit.');
      return;
    }
    setStep(3);
  }

  function handleStart(): void {
    onComplete({
      category,
      topics: [...selectedTopics],
      totalQuestions,
      adaptWindow,
      adaptive,
    });
  }

  const adaptiveLabel = adaptive ? `Adaptive every ${adaptWindow}` : 'Non-adaptive';
  const summary = `${category} • ${selectedTopics.size} unit${selectedTopics.size > 1 ? 's' : ''} • ${totalQuestions} questions • ${adaptiveLabel}`;

  return (
    <div id="practice-wizard" className="wizard" aria-live="polite" data-step={step}>
      <ol className="wizard-progress" aria-hidden="true">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? 'is-done' : n === step ? 'is-current' : 'is-upcoming';
          return (
            <li key={label} className={`wizard-progress-step ${state}`}>
              <span className="wizard-progress-index">{n}</span>
              <span className="wizard-progress-label">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section id="step-1" className="wizard-panel" aria-label="Step 1: Build your session">
          <h2 className="topics-title center">Build your session</h2>
          <div className="wizard-fields">
            <div>
              <span className="pc-label" id="category-label">
                Category
              </span>
              <div className="bank-cards" role="group" aria-labelledby="category-label">
                {categories.map((c) => {
                  const stats = bankStats[c] ?? { topics: 0, questions: 0 };
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={active ? 'bank-card is-selected' : 'bank-card'}
                      aria-pressed={active}
                      onClick={() => handleCategoryChange(c)}
                    >
                      <span className="bank-card-name">{c}</span>
                      <span className="bank-card-meta">
                        {stats.topics} topic{stats.topics === 1 ? '' : 's'} · {stats.questions} questions
                      </span>
                    </button>
                  );
                })}
              </div>
              <select
                id="category"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="pc-label" id="question-count-label">
                Questions
              </span>
              <div className="pill-group" role="group" aria-labelledby="question-count-label">
                {QUESTION_COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n === totalQuestions ? 'pill is-selected' : 'pill'}
                    aria-pressed={n === totalQuestions}
                    onClick={() => setTotalQuestions(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <select
                id="question-count"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
              >
                {QUESTION_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div id="adapt-every-field" className="pc-field">
              <span className="pc-label" id="adapt-every-label">
                Adapt Every
              </span>
              <div className="pill-group" role="group" aria-labelledby="adapt-every-label" aria-disabled={!adaptive}>
                {ADAPT_EVERY_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!adaptive}
                    className={n === adaptWindow ? 'pill is-selected' : 'pill'}
                    aria-pressed={n === adaptWindow}
                    onClick={() => setAdaptWindow(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <select
                id="adapt-every"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                disabled={!adaptive}
                value={adaptWindow}
                onChange={(e) => setAdaptWindow(Number(e.target.value))}
              >
                {ADAPT_EVERY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} questions
                  </option>
                ))}
              </select>
            </div>

            <div id="adaptive-field" className="pc-field pc-toggle">
              <label className="pc-label" htmlFor="adaptive-toggle">
                Adaptive
              </label>
              <label className="switch" aria-label="Adaptive mode">
                <input
                  type="checkbox"
                  id="adaptive-toggle"
                  checked={adaptive}
                  onChange={(e) => setAdaptive(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="wizard-actions">
            <button id="wiz-next-1" className="btn btn-primary" type="button" onClick={() => setStep(2)}>
              Confirm &amp; Continue
            </button>
          </div>
          <p className="note tiny center">We&rsquo;ll step up or down difficulty based on your recent accuracy.</p>
        </section>
      )}

      {step === 2 && (
        <section id="step-2" className="wizard-panel" aria-label="Step 2: Choose units">
          <h2 className="topics-title center">Choose units</h2>

          <div id="topics-scroller" className="topics-scroller">
            <div id="topics-list" className="topics-list" aria-label="Topics" role="group">
              {topics.length === 0 ? (
                <div className="muted">No topics available for this category.</div>
              ) : (
                topics.map((t) => {
                  const selected = selectedTopics.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={selected ? 'topic-btn is-selected' : 'topic-btn'}
                      data-value={t}
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleTopic(t)}
                    >
                      <span className="topic-btn-name">{t}</span>
                      <span className="topic-btn-count">{topicCounts[t] ?? 0}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <p className="topics-selected-count muted tiny center">
            {selectedTopics.size} of {topics.length} selected
          </p>

          <div className="topics-actions center">
            <button id="topics-select-all" className="btn btn-ghost" type="button" onClick={selectAllTopics}>
              Select All
            </button>
            <button id="topics-clear" className="btn btn-ghost" type="button" onClick={clearAllTopics}>
              Clear
            </button>
          </div>

          <div className="wizard-actions">
            <button id="wiz-back-2" className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button id="wiz-next-2" className="btn btn-primary" type="button" onClick={goNext2}>
              Confirm Units
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section id="step-3" className="wizard-panel" aria-label="Step 3: Start practice">
          <h2 className="topics-title center">Ready to start?</h2>
          <h3 className="topics-title center">Right-click to cross out answers</h3>

          <div className="summary-card">
            <div className="summary-row">
              <span className="summary-label">Bank</span>
              <span className="summary-value">{category}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Topics</span>
              <span className="summary-value">
                {selectedTopics.size} of {topics.length}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Drawing from</span>
              <span className="summary-value">
                {drawingFrom} question{drawingFrom === 1 ? '' : 's'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Session length</span>
              <span className="summary-value">{totalQuestions} questions</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Adaptive</span>
              <span className="summary-value">{adaptive ? `On · adjusts every ${adaptWindow}` : 'Off'}</span>
            </div>
          </div>

          <p id="wiz-summary" className="sr-only">
            {summary}
          </p>

          <div className="wizard-actions">
            <button id="wiz-back-3" className="btn btn-ghost" type="button" onClick={() => setStep(2)}>
              Back
            </button>
            <button id="start-btn" className="btn btn-primary" type="button" onClick={handleStart}>
              Start Practice
            </button>
            {/* 10d fix: shipped permanently enabled in the vanilla markup
                regardless of session state. Wired to hasSession (see the
                prop doc above) — this wizard only mounts while there is no
                session, so it is always disabled in the current
                architecture, which is the correct state for "no session". */}
            <button id="reset-btn" className="btn btn-ghost" type="button" disabled={!hasSession} onClick={() => setStep(1)}>
              Reset
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
