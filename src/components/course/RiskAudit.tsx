// React port of src/islands/course-one.ts's #audit-form submit handler
// (course-one.ts:1065-1126), mounted as a sibling of <Module unit={4}>
// inside #module-4 (see CourseOne.tsx's RiskAuditProps / RiskAuditPlaceholder
// call site for the exact contract this component implements).
//
// `ff_risk_audits` (Appendix B) is a SEPARATE localStorage key from
// CourseState — an append-only array of full audit entries. This component
// owns reading/writing it directly via src/lib/storage.ts's
// getRiskAudits/appendRiskAudit (following the getCourseProgress/
// getArticlesRead convention already there), then calls `onSubmit(auditId)`
// to update the shared CourseState (m4.auditSubmitted/auditId) through the
// hook. The form itself intentionally does not read `auditSubmitted`/
// `auditId` on mount — the original never restored a previous audit into
// the form either; every submit (including a second one) appends a new
// timestamped entry and is a legitimate action, not a resubmission guard.
//
// `#print-audit` (course-one.ts:1135) is dead code (Appendix E: the button
// it binds to does not exist in the markup) and is not ported.
import { useState, type FormEvent } from 'react';
import { appendRiskAudit } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';
import type { RiskAuditProps } from './CourseOne';

function fdStr(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

// Faithful port of course-one.ts:1078-1084's nextStep IIFE.
function nextStepFor(action: string): string {
  if (action === 'cancel') return 'Send a concise, dated cancellation via required channel; request written confirmation.';
  if (action === 'refund') return 'Quote policy, attach proof, and request refund by a clear deadline.';
  if (action === 'opt-out') return 'Change settings, capture before/after, and verify by email.';
  if (action === 'delete account') return 'Submit deletion request and archive confirmation.';
  return 'Document and set a follow-up date.';
}

export function RiskAudit({ onSubmit }: RiskAuditProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const merchant = fdStr(fd, 'merchant');
    const action = fdStr(fd, 'action');
    const date = fdStr(fd, 'date');
    const channel = fdStr(fd, 'channel');
    const saw = fdStr(fd, 'saw');
    const patterns = fd.getAll('patterns').map(String).join(', ');
    const evidence = fd.getAll('evidence').map(String).join(', ') || '—';
    const nextStep = nextStepFor(action);

    const lines = [
      `Merchant/platform: ${merchant}`,
      `Action attempted: ${action}`,
      `Date/time: ${date} via ${channel}`,
      `What you saw: ${saw}`,
      `Pattern(s) observed: ${patterns}`,
      `Evidence captured: ${evidence}`,
      `Next two actions:`,
      `  1) ${nextStep}`,
      `  2) If ignored, escalate to platform/payment rails with your proof pack.`,
    ];
    setOutput(lines.join('\n'));
    setActionsVisible(true);

    const entry = {
      id: `AUD-${Date.now()}`,
      dateISO: new Date().toISOString(),
      merchant,
      action,
      date,
      channel,
      saw,
      patterns,
      evidence,
    };
    appendRiskAudit(entry);

    track('audit_submitted', { id: entry.id, merchant, action });
    showToast('Risk Audit generated.', 'success');
    onSubmit(entry.id);
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(output ?? '');
      showToast('Copied to clipboard.', 'success');
    } catch {
      showToast('Copy failed.', 'error');
    }
  }

  return (
    <div className="content-card mt-1">
      <h3>Risk Audit (guided form, ~5–7 minutes)</h3>
      <form id="audit-form" className="audit-form" onSubmit={handleSubmit}>
        <div className="row-2">
          <label>
            Merchant/platform name
            <input required name="merchant" />
          </label>
          <label>
            Action attempted
            <select required name="action" defaultValue="">
              <option value="">Select</option>
              <option>opt-out</option>
              <option>cancel</option>
              <option>refund</option>
              <option>delete account</option>
            </select>
          </label>
        </div>
        <div className="row-2">
          <label>
            Date/time of action
            <input required name="date" type="datetime-local" />
          </label>
          <label>
            Channel used
            <select required name="channel" defaultValue="">
              <option value="">Select</option>
              <option>web</option>
              <option>email</option>
              <option>chat</option>
              <option>phone</option>
            </select>
          </label>
        </div>
        <label>
          What you saw (2–3 sentences)
          <textarea required name="saw" rows={3} />
        </label>
        <label>
          Pattern(s) observed
          <select required name="patterns" multiple size={5} aria-describedby="patterns-help">
            <option>Obstruction</option>
            <option>Forced action</option>
            <option>Sneaking</option>
            <option>Interface interference</option>
            <option>Confirmshaming</option>
            <option>Nagging</option>
            <option>Social proofing</option>
            <option>Misdirection</option>
          </select>
        </label>
        <div id="patterns-help" className="subtle">
          Hold <span className="kbd">Ctrl</span>/<span className="kbd">⌘</span> to select multiple.
        </div>
        <fieldset>
          <legend>Evidence captured</legend>
          <div className="row-3">
            <label>
              <input type="checkbox" name="evidence" value="before/after screens" /> before/after screens
            </label>
            <label>
              <input type="checkbox" name="evidence" value="totals" /> totals
            </label>
            <label>
              <input type="checkbox" name="evidence" value="your action" /> your action
            </label>
            <label>
              <input type="checkbox" name="evidence" value="confirmation" /> confirmation
            </label>
            <label>
              <input type="checkbox" name="evidence" value="policy excerpt" /> policy excerpt
            </label>
          </div>
        </fieldset>
        <div className="gate">
          <button id="audit-generate" className="btn btn-primary" type="submit">
            Generate Risk Audit
          </button>
        </div>
      </form>
      <div id="audit-output" className="audit-output" hidden={output === null}>
        {output}
      </div>
      <div id="audit-actions" className="gate" hidden={!actionsVisible}>
        <button id="copy-audit" className="btn btn-ghost" type="button" onClick={handleCopy}>
          Copy Summary
        </button>
      </div>
    </div>
  );
}
