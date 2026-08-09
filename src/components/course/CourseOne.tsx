// Phase 10f shell/router for src/pages/courseone.astro's 431-line markup,
// replacing src/islands/course-one.ts's initCourseOne(). Mounted into
// courseone.astro as `<CourseOne client:load />`.
//
// The seven section components below (PreQuiz, Module, IdExercise,
// RiskAudit, PostQuiz, Certificate, ProgressSidebar) were built in parallel
// against the prop contracts declared here and are now wired in for real.
//
// ---------------------------------------------------------------------------
// How locking works now (read this before wiring a loader)
// ---------------------------------------------------------------------------
// `useCourseState()` gives you `locks`, a map from the 7 section ids to
// `{ complete, current, locked, message }`. `locked` is the single signal
// every section needs:
//   - true  -> render normally, but do NOT fetch/attach anything yet. The
//              wrapping <LockableSection> already sets `inert` + `aria-hidden`
//              and renders the `.locked-scrim` (Appendix D), so you don't
//              need to disable inputs yourself.
//   - false -> the section is either the current frontier step OR already
//              fully complete. In both cases the original course-one.ts ran
//              the section's loader (course-one.ts:1284-1290's
//              `current.loader()` + the "also load completed sections"
//              forEach) — so `locked === false` is exactly the right signal
//              to start loading, on every render where it's false, not just
//              the render where it *becomes* false (a returning user reloads
//              straight into an unlocked-and-complete module).
//
// THE IDEMPOTENT-LOADER PATTERN (the highest-risk item in this phase)
// ---------------------------------------------------------------------------
// course-one.ts guarded every lazy loader with a boolean latch:
//   let m1Loaded = false;
//   function loadM1() { if (m1Loaded) return; m1Loaded = true; ...attach listeners, inject overlay DOM, fetch markdown... }
// Ported directly into a `useEffect(() => { loadM1(); }, [locked])`, this
// breaks under React 18/19 StrictMode: dev intentionally mounts -> cleans up
// -> re-mounts every component once. If cleanup tears down what the effect
// built (removes listeners, removes the injected overlay button) but the
// latch (a ref or module `let`) is NOT reset by that cleanup, the second
// mount's effect sees "already loaded" and skips setup — so the component
// ends up on screen with no listeners and no content at all.
//
// Fix: never guard with a latch that outlives the effect's own cleanup.
// Two safe shapes:
//
//   1) Symmetric effect (preferred for gateVideo-style listener attachment):
//        useEffect(() => {
//          if (locked) return;
//          const el = videoRef.current;
//          if (!el) return;
//          el.addEventListener('timeupdate', onTimeUpdate);
//          el.addEventListener('seeking', onSeeking);
//          return () => {
//            el.removeEventListener('timeupdate', onTimeUpdate);
//            el.removeEventListener('seeking', onSeeking);
//          };
//        }, [locked]);
//      Attach and detach are perfectly symmetric, so re-running from a clean
//      slate is always correct — StrictMode's double-invoke is a no-op.
//      The overlay "play" button course-one.ts injected via
//      `document.createElement`/`appendChild` should just be JSX rendered
//      conditionally (`{!completed && <button className="video-overlay-btn" .../>}`),
//      not imperative DOM — that sidesteps the inject/remove problem for it
//      entirely.
//
//   2) Gate on the real target state, not a separate flag (preferred for
//      loadMarkdownSmart/loadIdExercise/loadPOST-style fetches):
//        const [html, setHtml] = useState<string | null>(null);
//        useEffect(() => {
//          if (locked || html !== null) return; // already have content — covers the second StrictMode invoke after the first already resolved
//          let cancelled = false;
//          fetchText(mdPath).then((text) => { if (!cancelled) setHtml(renderArticleHtml(text)); });
//          return () => { cancelled = true; };
//        }, [locked, html, mdPath]);
//      Two fetches can still fire in dev (harmless, standard cancelled-flag
//      abort pattern — this is the same shape React's own docs use for
//      StrictMode-safe data fetching); at most one ever calls `setHtml`.
//
// `useCourseState` itself only needed the trivial end of this spectrum: its
// mount-time hydration (`refreshProgressSnapshot()`) is a pure read-and-set
// with no listeners/DOM/requests to leak, so it runs unguarded every mount —
// see that file's comment. The loaders above are the risky end; get them
// right using one of the two shapes above, not a boolean latch.
//
// mdToHtml / enhanceArticle
// ---------------------------------------------------------------------------
// src/lib/md-to-html.ts exports `mdToHtml` (byte-identical to
// course-one.ts:193-238, pinned by tests/unit/md-to-html.test.ts) and
// `renderArticleHtml` (mdToHtml + enhanceArticle's lead/TOC/heading-id
// logic, folded into one string->string transform via a detached, never-
// mounted scratch element — see that file's header for why). Module.tsx
// must call `renderArticleHtml(md)`, not `mdToHtml(md)` directly, and render
// the result via a single `dangerouslySetInnerHTML` — never mutate that
// subtree again afterwards.
import { useMemo, type ReactNode } from 'react';
import { useCourseState, type PostQuizSubmission, type QuizSubmission, type SectionId, type StepStatus } from '../../hooks/useCourseState';
import type { CourseState } from '../../lib/progress';
import { PreQuiz } from './PreQuiz';
import { Module } from './Module';
import { IdExercise } from './IdExercise';
import { RiskAudit } from './RiskAudit';
import { PostQuiz } from './PostQuiz';
import { Certificate } from './Certificate';
import { ProgressSidebar } from './ProgressSidebar';

// ---------------------------------------------------------------------------
// Section component prop contracts — the exact shapes the other three
// agents' files must accept. `locked`/`lockMessage` are informational for
// content components that want to skip work while locked (see the loader
// pattern above); the visual lock chrome itself is handled once, generically,
// by <LockableSection> below — section components do not need to render
// their own scrim/inert/aria-hidden.
// ---------------------------------------------------------------------------

export interface PreQuizProps {
  state: CourseState['preQuiz'];
  locked: boolean;
  /** Fires on every choice change, before submit (autosave parity with course-one.ts:800-803). */
  onAnswerChange(idx: number, value: number): void;
  /** Caller grades PRE_ITEMS itself and passes the result; toast/track/scroll-into-view stay here, not in the hook. */
  onSubmit(result: QuizSubmission): void;
}

export type ModuleProps =
  | {
      unit: 1 | 2 | 3;
      locked: boolean;
      videoDone: boolean;
      articleDone: boolean;
      mdPath: string;
      onVideoDone(): void;
      onArticleDone(): void;
      /** unit 3 only — #drills/#drills-check/#drill-checklist (course-one.ts:1028-1044). Does not affect any lock. */
      onDrillsChecked?: () => void;
    }
  | {
      unit: 4;
      locked: boolean;
      articleDone: boolean;
      mdPath: string;
      onArticleDone(): void;
    };

export interface IdExerciseProps {
  locked: boolean;
  done: boolean;
  onComplete(): void;
}

export interface RiskAuditProps {
  locked: boolean;
  auditSubmitted: boolean;
  auditId: string | null;
  /**
   * `ff_risk_audits` (Appendix B) is a SEPARATE localStorage key from
   * CourseState — an append-only array of full audit entries
   * ({id, dateISO, merchant, action, date, channel, saw, patterns, evidence}).
   * It is not part of `useCourseState`'s contract. RiskAudit.tsx should own
   * reading/writing it directly (course-one.ts:1102-1119 is the exact
   * shape to port) — e.g. add getRiskAudits/appendRiskAudit to
   * src/lib/storage.ts, following the getCourseProgress/getArticlesRead
   * convention already there. Call `onSubmit(entry.id)` after appending, to
   * update the CourseState side (m4.auditSubmitted/auditId).
   */
  onSubmit(auditId: string): void;
}

export interface PostQuizProps {
  state: CourseState['postQuiz'];
  locked: boolean;
  onAnswerChange(idx: number, value: number): void;
  onSubmit(result: PostQuizSubmission): void;
  onRetake(): void;
}

export interface CertificateProps {
  /** state.postQuiz.score, for '#cert-score'. */
  postQuizScore: number;
  certificate: CourseState['certificate'];
  /**
   * Mints (or, if already issued, returns the existing) id/date and marks
   * `certificate.issued`. Call this from both '#download-cert' and
   * '#download-badge' click handlers, exactly like course-one.ts's
   * prepareCertificate() did before window.print()/the badge export.
   */
  onIssue(): { id: string; date: string };
  /**
   * NOT sourced from CourseOne/useCourseState — Certificate.tsx should read
   * this itself: `getUserName() ?? user.displayName ?? 'Learner'` (O5/O6).
   * `#learner-name`/`#save-name` never existed in courseone.astro's markup
   * (Appendix E) and are not being reintroduced; ff_user_name's sole writer
   * is ProfileSettings.tsx (already shipped, Phase 10c).
   */
}

export interface ProgressSidebarProps {
  steps: readonly StepStatus[];
  currentStepIndex: number;
}

// ---------------------------------------------------------------------------
// Generic lock chrome — course-one.ts:742-764's lockSection(), applied
// once here instead of once per section component. Faithful except for the
// 'peekable' class, which is dead code in the source (see useCourseState.ts's
// header comment for the trace) and is not reintroduced.
// ---------------------------------------------------------------------------

function LockableSection({
  id,
  locked,
  message,
  ariaLabelledBy,
  children,
}: {
  id: string;
  locked: boolean;
  message: string;
  ariaLabelledBy: string;
  children: ReactNode;
}) {
  return (
    <section
      className={locked ? 'section container locked' : 'section container'}
      id={id}
      aria-labelledby={ariaLabelledBy}
      inert={locked || undefined}
      aria-hidden={locked || undefined}
    >
      {children}
      {locked && (
        <div className="locked-scrim" style={{ pointerEvents: 'auto' }}>
          <div className="locked-card">
            <div className="locked-emoji" aria-hidden="true">
              🔒
            </div>
            <div className="locked-msg">{message}</div>
          </div>
        </div>
      )}
    </section>
  );
}

const SECTION: Record<SectionId, { headingId: string }> = {
  '#pre-quiz': { headingId: 'pre-title' },
  '#module-1': { headingId: 'm1-title' },
  '#module-2': { headingId: 'm2-title' },
  '#module-3': { headingId: 'm3-title' },
  '#module-4': { headingId: 'm4-title' },
  '#post-quiz': { headingId: 'post-title' },
  '#certificate': { headingId: 'cert-title' },
};

export function CourseOne() {
  const { state, steps, currentStepIndex, locks, actions } = useCourseState();

  // course-one.ts's markdown paths (courseone.astro's #md-01..#md-04
  // mounts) — passed through so Module.tsx doesn't need its own copy.
  const mdPaths = useMemo(
    () => ({ 1: '/content/01-foundations.md', 2: '/content/02-families.md', 3: '/content/03-counter-moves.md', 4: '/content/04-evidence.md' }),
    [],
  );

  return (
    <>
      <ProgressSidebar steps={steps} currentStepIndex={currentStepIndex} />

      <LockableSection id="pre-quiz" ariaLabelledBy={SECTION['#pre-quiz'].headingId} locked={locks['#pre-quiz'].locked} message={locks['#pre-quiz'].message}>
        <PreQuiz
          state={state.preQuiz}
          locked={locks['#pre-quiz'].locked}
          onAnswerChange={actions.setPreQuizAnswer}
          onSubmit={actions.submitPreQuiz}
        />
      </LockableSection>

      <LockableSection id="module-1" ariaLabelledBy={SECTION['#module-1'].headingId} locked={locks['#module-1'].locked} message={locks['#module-1'].message}>
        <Module
          unit={1}
          locked={locks['#module-1'].locked}
          videoDone={state.m1.video}
          articleDone={state.m1.article}
          mdPath={mdPaths[1]}
          onVideoDone={() => actions.setModuleVideoDone(1)}
          onArticleDone={() => actions.setModuleArticleDone(1)}
        />
      </LockableSection>

      <LockableSection id="module-2" ariaLabelledBy={SECTION['#module-2'].headingId} locked={locks['#module-2'].locked} message={locks['#module-2'].message}>
        <Module
          unit={2}
          locked={locks['#module-2'].locked}
          videoDone={state.m2.video}
          articleDone={state.m2.article}
          mdPath={mdPaths[2]}
          onVideoDone={() => actions.setModuleVideoDone(2)}
          onArticleDone={() => actions.setModuleArticleDone(2)}
        />
        {/* Sibling, not nested — sectionIsComplete('#module-2') requires
            video && article && idExercise, so IdExercise shares
            locks['#module-2'] with the Module above it (course-one.ts's
            original markup nests the id-exercise DOM inside #module-2 too;
            see courseone.astro:181-224). */}
        <IdExercise locked={locks['#module-2'].locked} done={state.m2.idExercise} onComplete={actions.completeIdExercise} />
      </LockableSection>

      <LockableSection id="module-3" ariaLabelledBy={SECTION['#module-3'].headingId} locked={locks['#module-3'].locked} message={locks['#module-3'].message}>
        <Module
          unit={3}
          locked={locks['#module-3'].locked}
          videoDone={state.m3.video}
          articleDone={state.m3.article}
          mdPath={mdPaths[3]}
          onVideoDone={() => actions.setModuleVideoDone(3)}
          onArticleDone={() => actions.setModuleArticleDone(3)}
          onDrillsChecked={actions.setDrillsChecked}
        />
      </LockableSection>

      <LockableSection id="module-4" ariaLabelledBy={SECTION['#module-4'].headingId} locked={locks['#module-4'].locked} message={locks['#module-4'].message}>
        <Module unit={4} locked={locks['#module-4'].locked} articleDone={state.m4.article} mdPath={mdPaths[4]} onArticleDone={() => actions.setModuleArticleDone(4)} />
        {/* Sibling, not nested — sectionIsComplete('#module-4') requires
            article && auditSubmitted, so RiskAudit shares locks['#module-4']
            with the Module above it (original markup nests the audit form
            inside #module-4 too; see courseone.astro:270-347). */}
        <RiskAudit locked={locks['#module-4'].locked} auditSubmitted={state.m4.auditSubmitted} auditId={state.m4.auditId} onSubmit={actions.completeAudit} />
      </LockableSection>

      <LockableSection id="post-quiz" ariaLabelledBy={SECTION['#post-quiz'].headingId} locked={locks['#post-quiz'].locked} message={locks['#post-quiz'].message}>
        <PostQuiz
          state={state.postQuiz}
          locked={locks['#post-quiz'].locked}
          onAnswerChange={actions.setPostQuizAnswer}
          onSubmit={actions.submitPostQuiz}
          onRetake={actions.retakePostQuiz}
        />
      </LockableSection>

      {/* O6: rendered conditionally on state.postQuiz.pass, not on the
          generic lock/section mechanism — course-one.ts's `.certificate`/
          `.certificate.ready` CSS classes stay in legacy.css for print
          styles, but nothing here ever toggles `.ready`; the conditional
          mount replaces that class dance entirely. No LockableSection
          wrapper: a failed post-quiz means this section doesn't exist in
          the tree at all, not "exists but locked". */}
      {/* The plain `certificate` class is deliberately NOT applied here —
          `.certificate { display: none }` / `.certificate.ready { display:
          block }` (kept in courseone.astro's <style> for the old class-
          toggle scheme) would otherwise re-hide this section via CSS even
          though it's already conditionally mounted; nothing here ever adds
          `.ready`, so `.certificate` alone would leave it display:none
          forever. Conditional mounting is the only visibility switch now. */}
      {state.postQuiz.pass && (
        <section className="section container" id="certificate" aria-labelledby={SECTION['#certificate'].headingId}>
          <Certificate postQuizScore={state.postQuiz.score} certificate={state.certificate} onIssue={actions.issueCertificate} />
        </section>
      )}
    </>
  );
}
