// React port of the setup-wizard half of src/islands/flashcard.ts (Phase
// 10e): the three-step "pick units -> pick mode -> confirm & start" flow.
// The in-session stage (flip UI, MC/FITB answering) is a different task's
// scope — see FlashcardStagePlaceholder.tsx and Flashcards.tsx for the
// handoff point.
//
// Preserved exactly from flashcard.ts:
//   - Units render as a checkbox list (native <input type="checkbox">,
//     replacing the original's plain buttons — same `unit-chip`/`is-active`
//     visual class pair so legacy.css's existing styling still applies) with
//     Select all / Clear controls.
//   - "Select at least one unit" gate on step 1 -> 2 (`confirmUnits`),
//     toast text unchanged: 'Select at least one unit to continue.'
//   - Step 3's summary line and pluralization: "You selected N unit(s) in
//     <Multiple Choice|Fill in the Blank> mode." / "No units selected yet."
//   - `data-step` on the wizard container (legacy.css:5161-5163 drives step
//     layout off that attribute) plus the flip-out/flip-in transition
//     classes on every step change (220ms out, then 420ms in).
//   - Shuffle-deck checkbox lives on step 2, defaulting checked, exactly as
//     `#shuffle` did.
//
// NOT ported here (out of scope, owned elsewhere): the mode-switch-mid-
// session guard from hookControls() (a toast + radio revert if you try to
// change mode while `state.active`) is dead weight in the new architecture
// — Flashcards.tsx only mounts this wizard while no session is running, the
// same pattern Practice.tsx already established for PracticeWizard, so the
// guard's precondition can never occur.
import { useEffect, useRef, useState } from 'react';
import { showToast } from '../../lib/toast';

export type Mode = 'mc' | 'fitb';
type WizardStep = 1 | 2 | 3;

export interface FlashcardWizardProps {
  /** All unit names, in display order — flashcard-units.ts's keys. */
  allUnits: string[];
  unitsSelected: Set<string>;
  onUnitsSelectedChange: (next: Set<string>) => void;
  mode: Mode;
  onModeChange: (next: Mode) => void;
  shuffleDeck: boolean;
  onShuffleDeckChange: (next: boolean) => void;
  /** Fired on step 3's "Start Session" — caller owns buildDeck() from here. */
  onStart: () => void;
}

export function FlashcardWizard({
  allUnits,
  unitsSelected,
  onUnitsSelectedChange,
  mode,
  onModeChange,
  shuffleDeck,
  onShuffleDeckChange,
  onStart,
}: FlashcardWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [flipClass, setFlipClass] = useState<'' | 'flip-out' | 'flip-in'>('');
  const isInitialRender = useRef(true);

  // Mirrors flashcard.ts's setStepHiddenState transition: 220ms flip-out,
  // then flip-in for 420ms, on every step change after the first render.
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    setFlipClass('flip-out');
    const outTimer = setTimeout(() => {
      setFlipClass('flip-in');
      const inTimer = setTimeout(() => setFlipClass(''), 420);
      return () => clearTimeout(inTimer);
    }, 220);
    return () => clearTimeout(outTimer);
  }, [step]);

  function toggleUnit(unit: string): void {
    const next = new Set(unitsSelected);
    if (next.has(unit)) next.delete(unit);
    else next.add(unit);
    onUnitsSelectedChange(next);
  }

  function selectAll(): void {
    onUnitsSelectedChange(new Set(allUnits));
  }

  function clearAll(): void {
    onUnitsSelectedChange(new Set());
  }

  function confirmUnits(): void {
    if (unitsSelected.size === 0) {
      showToast('Select at least one unit to continue.');
      return;
    }
    setStep(2);
  }

  const modeLabel = mode === 'mc' ? 'Multiple Choice' : 'Fill in the Blank';
  const count = unitsSelected.size;
  const summaryText = count
    ? `You selected ${count} unit${count > 1 ? 's' : ''} in ${modeLabel} mode.`
    : 'No units selected yet.';

  return (
    <div
      className={`fc-controls card is-wizard${flipClass ? ` ${flipClass}` : ''}`}
      role="region"
      aria-label="Flashcard controls"
      data-step={step}
    >
      <div className="fc-grid">
        {/* STEP 1: Units */}
        <div className="fc-block" id="block-units" hidden={step !== 1} aria-hidden={step !== 1}>
          <h3 className="fc-label">Units</h3>
          <div id="unit-list" className="unit-list" aria-live="polite">
            {allUnits.map((unit) => {
              const checked = unitsSelected.has(unit);
              return (
                <label
                  key={unit}
                  className={checked ? 'chip unit-chip is-active' : 'chip unit-chip'}
                  // legacy.css never sets text-align on .unit-chip — the
                  // original markup was a <button>, which centers its label
                  // text via the UA stylesheet for free. A <label> has no
                  // such default, so it's restored explicitly here rather
                  // than by adding a new rule to legacy.css for one caller.
                  style={{ textAlign: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUnit(unit)}
                    className="sr-only"
                  />
                  {unit}
                </label>
              );
            })}
          </div>
          <div className="fc-actions">
            <button id="select-all" className="btn btn-ghost" type="button" onClick={selectAll}>
              Select all
            </button>
            <button id="clear-all" className="btn btn-ghost" type="button" onClick={clearAll}>
              Clear
            </button>
            <button id="confirm-units" className="btn btn-primary btn-next" type="button" onClick={confirmUnits}>
              Continue
            </button>
          </div>
        </div>

        {/* STEP 2: Mode */}
        <div className="fc-block" id="block-mode" hidden={step !== 2} aria-hidden={step !== 2}>
          <h3 className="fc-label">Mode</h3>
          <div className="mode-row" role="group" aria-label="Practice mode">
            <label className="mode-chip">
              <input type="radio" name="mode" value="mc" checked={mode === 'mc'} onChange={() => onModeChange('mc')} />
              <span>Multiple Choice</span>
            </label>
            <label className="mode-chip">
              <input type="radio" name="mode" value="fitb" checked={mode === 'fitb'} onChange={() => onModeChange('fitb')} />
              <span>Fill in the Blank</span>
            </label>
          </div>

          <div className="opt-row">
            <label className="toggle">
              <input type="checkbox" id="shuffle" checked={shuffleDeck} onChange={(e) => onShuffleDeckChange(e.target.checked)} />
              <span>Shuffle deck</span>
            </label>
          </div>

          <div className="fc-actions">
            <button id="confirm-mode" className="btn btn-primary btn-next" type="button" onClick={() => setStep(3)}>
              Continue
            </button>
            <button id="start-btn" className="btn btn-primary" type="button" onClick={onStart}>
              Start Session
            </button>
          </div>
        </div>

        {/* STEP 3: Start */}
        <div className="fc-block" id="block-start" hidden={step !== 3} aria-hidden={step !== 3}>
          <h3 className="fc-label">Ready to begin?</h3>
          <div className="start-hero">
            <p id="start-summary" className="muted">
              {summaryText}
            </p>
            <button id="start-btn-big" className="btn btn-primary btn-giant" type="button" onClick={onStart}>
              Start Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
