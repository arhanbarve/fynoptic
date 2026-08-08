// Replaces flashcard.ts's native `confirm('Reset all saved flashcard
// progress?')` (hookControls(), #reset-progress) with a Radix dialog on top
// of the Phase 5 Modal wrapper.
//
// Clearing behavior, confirmed against the original before porting: the
// handler calls `localStorage.removeItem(STORAGE_KEY)` unconditionally — it
// wipes the ENTIRE `fynoptic.flashcards.v1` key, i.e. every unit's saved
// answers, not just the units in the active session's deck. The copy below
// says so explicitly instead of leaving it ambiguous, which a native
// `confirm()` dialog had no room to do.
import { Modal, ModalClose } from '../ui/Modal';

export interface ResetProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The one destructive action — caller wires this to useFlashcardDeck().resetProgress(). */
  onConfirm: () => void;
}

export function ResetProgressDialog({ open, onOpenChange, onConfirm }: ResetProgressDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Reset saved flashcard progress?" id="reset-progress-modal">
      <ModalClose />
      <p className="muted">
        This clears every saved answer for <strong>all units</strong>, not just the ones in your current session.
        This can&rsquo;t be undone.
      </p>
      <div className="end-session-actions">
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          id="reset-progress-confirm"
          type="button"
          className="btn btn-danger"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          Reset Progress
        </button>
      </div>
    </Modal>
  );
}
