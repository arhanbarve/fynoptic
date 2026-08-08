// React port of flashcard.ts's #summary-modal (openSummaryModal /
// onSummaryModalClick), shown when a session is ended via the "End Session"
// button.
//
// Stats shown, unchanged from the original's #summary-grid:
//   - Completed  -> `${done} / ${total}`
//   - Correct    -> `${correct}`
//   - Accuracy   -> `${acc}%`, where acc = total ? round(correct/(done||1)*100) : 0
//   - Revealed Cards -> the session's `revealed` set size (cards flipped/peeked)
// plus the selected units as chips (#summary-units), or "None" if empty.
//
// Deliberate relaxation from the original: the vanilla modal only closed via
// its × button (onSummaryModalClick matched `[data-modal-close]` and nothing
// else — Escape/backdrop-click did nothing because this modal was toggled by
// hand, outside modal.ts's shared open/close system). Ending a session isn't
// destructive by the time this modal is showing (the session already ended
// when "End Session" was pressed), so there's no O7-style asymmetry risk in
// letting Radix's normal Escape/backdrop dismissal apply here too, same as
// every other <Modal> in this codebase (see EndSessionModal.tsx's comment
// for the case where that WOULD matter).
import { Modal, ModalClose } from '../ui/Modal';

export interface SummaryStats {
  total: number;
  done: number;
  correct: number;
  /** round(correct / (done || 1) * 100), 0 when total is 0 — the original's exact formula. */
  accuracyPct: number;
  revealedCount: number;
}

export interface SummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: SummaryStats;
  /** The units the ended session was built from. */
  units: string[];
}

export function SummaryModal({ open, onOpenChange, stats, units }: SummaryModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Session Summary" id="summary-modal">
      <ModalClose />
      <div className="summary-grid" id="summary-grid">
        <div className="summary-item">
          <span>Completed</span>
          <strong>
            {stats.done} / {stats.total}
          </strong>
        </div>
        <div className="summary-item">
          <span>Correct</span>
          <strong>{stats.correct}</strong>
        </div>
        <div className="summary-item">
          <span>Accuracy</span>
          <strong>{stats.accuracyPct}%</strong>
        </div>
        <div className="summary-item">
          <span>Revealed Cards</span>
          <strong>{stats.revealedCount}</strong>
        </div>
      </div>
      <div className="summary-units" id="summary-units" aria-live="polite">
        {units.length ? (
          units.map((u) => (
            <span className="chip" key={u}>
              {u}
            </span>
          ))
        ) : (
          <span className="muted">None</span>
        )}
      </div>
    </Modal>
  );
}
