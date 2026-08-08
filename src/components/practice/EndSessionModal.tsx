// React port of islands/practice.ts's #end-session-modal (Phase 10d),
// resolving O7: dismiss-only.
//
// Deliberate behavior CHANGE from the shipped vanilla island: there, the ×
// button called closeEndSessionModalAndReturn(), which wiped the running
// session — while Escape/backdrop-click (handled by lib/modal.ts) only hid
// the modal. That asymmetry meant a destructive action could be triggered
// by the same gesture (×) a user reaches for to "just close this." Here,
// closing the dialog by ANY route — ×, Escape, or a backdrop click, all of
// which land on `onOpenChange` via Radix (see Modal.tsx) — only ever calls
// `onOpenChange(false)` and never touches the session. The single
// destructive action is the explicit, danger-styled "End Session" button
// below, which is not a ModalClose and must call `onEndSession` itself.
import { Modal, ModalClose } from '@/components/ui/Modal';

export interface SessionEndStats {
  answered: number;
  total: number;
  correct: number;
  streak: number;
  /** correct/answered, via computeAccuracyPct — the single formula (10d fix) that replaced this modal's own inline `answered ? round(correct/answered*100) : 0`, one of the three divergent copies the plan called out. */
  accuracyPct: number;
  /** Pre-formatted, e.g. "Medium" or "—" — matches updateDiffChip()'s casing. */
  difficulty: string;
  /** Pre-formatted, comma-joined, underscores/hyphens replaced with spaces, or "—" if none. */
  topicsLabel: string;
}

export interface EndSessionModalProps {
  open: boolean;
  /** Fired for × / Escape / backdrop click alike. Must only ever close the dialog — never destructive. */
  onOpenChange: (open: boolean) => void;
  stats: SessionEndStats;
  /** The one and only destructive path. Caller is responsible for also closing the dialog (e.g. by also flipping its `open` state) as part of handling this. */
  onEndSession: () => void;
}

export function EndSessionModal({ open, onOpenChange, stats, onEndSession }: EndSessionModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Session Summary" id="end-session-modal">
      <ModalClose />
      <div id="end-session-stats" className="session-stats">
        <div className="stat-grid">
          <div className="session-stat">
            <div className="k">
              {stats.answered}/{stats.total}
            </div>
            <div className="l">Answered</div>
          </div>
          <div className="session-stat">
            <div className="k">{stats.correct}</div>
            <div className="l">Correct</div>
          </div>
          <div className="session-stat">
            <div className="k">{stats.accuracyPct}%</div>
            <div className="l">Accuracy</div>
          </div>
          <div className="session-stat">
            <div className="k">{stats.streak}</div>
            <div className="l">Current Streak</div>
          </div>
          <div className="session-stat">
            <div className="k">{stats.difficulty}</div>
            <div className="l">Difficulty</div>
          </div>
          <div className="session-stat wide">
            <div className="k">{stats.topicsLabel}</div>
            <div className="l">Units</div>
          </div>
        </div>
      </div>
      <div className="end-session-actions">
        <button
          id="end-session-end-btn"
          type="button"
          className="btn btn-danger"
          onClick={() => {
            onEndSession();
            onOpenChange(false);
          }}
        >
          End Session
        </button>
      </div>
    </Modal>
  );
}
