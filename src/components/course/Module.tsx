// One component for all 4 course modules, per CourseOne.tsx's `ModuleProps`
// discriminated union. Replaces src/islands/course-one.ts's loadM1..loadM4
// (952-1136) minus the identification exercise (IdExercise.tsx, module 2)
// and the audit form (RiskAudit.tsx, module 4) — both siblings mounted
// separately by CourseOne.tsx, per its own comments.
//
// Unit 4 has no video field in CourseState (m4: { article, auditSubmitted,
// auditId } — no `video`), because courseone.astro's module-4 section never
// had a <video> element in the first place (courseone.astro:270-279). The
// `unit === 4` branch below never renders a video-wrap, never calls
// useVideoGate, and never destructures `videoDone`/`onVideoDone` off props
// (TS's discriminated union on `unit` makes reading those a compile error in
// that branch, not just a runtime omission).
//
// Article loading (fetch -> renderArticleHtml -> dangerouslySetInnerHTML
// once) and "mark as read" unlock-on-scroll-to-bottom
// (loadMarkdownSmart, course-one.ts:277-357) apply identically to all 4
// units, so they're one small hook (`useArticleGate`) below instead of
// repeated per-unit.
//
// Idempotent by construction (per the foundation agent's guidance in
// CourseOne.tsx): the fetch effect is gated on `html !== null` — the real
// target state — not a separate `loaded` boolean latch, and cancels itself
// via a `cancelled` flag; the IntersectionObserver effect is a symmetric
// attach-in-effect/observe-once/disconnect-in-cleanup, safe to run twice
// under StrictMode's dev-only double-invoke.
//
// NOT ported: loadMarkdownSmart's file:// <iframe> fallback
// (course-one.ts:307-356). It exists only for opening the static HTML
// directly off disk with fetch() blocked by the browser; this page is
// always served by Astro (dev server or built output), never file://, so
// that branch is unreachable here. On a fetch failure we show a plain
// error message instead and leave "mark as read" disabled.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ModuleProps } from './CourseOne';
import { renderArticleHtml } from '../../lib/md-to-html';
import { useVideoGate } from '../../hooks/useVideoGate';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} not reachable`);
  return res.text();
}

/* ─────────────────────────
   Article fetch + scroll-to-end gate (course-one.ts:277-357, minus the
   file:// iframe fallback — see file header).
─────────────────────────── */
function useArticleGate(mdPath: string, locked: boolean): {
  html: string | null;
  mountRef: RefObject<HTMLDivElement | null>;
  scrolledToEnd: boolean;
} {
  const [html, setHtml] = useState<string | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);

  // Fetch: gated on the real target state (`html !== null`), not a boolean
  // latch — a second StrictMode invoke sees html is still null and starts a
  // second fetch, but `cancelled` ensures only one of them ever calls
  // setHtml.
  useEffect(() => {
    if (locked || html !== null) return;
    let cancelled = false;
    fetchText(mdPath)
      .then((text) => {
        if (!cancelled) setHtml(renderArticleHtml(text));
      })
      .catch(() => {
        if (!cancelled) setHtml(`<div class="subtle">Couldn't load <code>${mdPath}</code>.</div>`);
      });
    return () => {
      cancelled = true;
    };
  }, [locked, html, mdPath]);

  // Unlock "mark as read" once the last rendered element scrolls fully into
  // view — symmetric observe/disconnect, safe to run twice under StrictMode.
  useEffect(() => {
    if (html === null) return;
    const mountEl = mountRef.current;
    if (!mountEl) return;
    const target = mountEl.lastElementChild ?? mountEl;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setScrolledToEnd(true);
          io.disconnect();
        }
      },
      { threshold: 1.0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [html]);

  return { html, mountRef, scrolledToEnd };
}

/* ─────────────────────────
   Static per-unit content — ported verbatim from courseone.astro's
   module-1..4 markup (lines 144-279).
─────────────────────────── */
interface VideoContent {
  id: string;
  ariaLabel: string;
  src: string;
  showFallbackText: boolean;
  transcriptHeading: string;
  transcriptParagraphs: string[];
}

interface ModuleContent {
  headingId: string;
  heading: string;
  subtitle: string;
  video?: VideoContent;
  articleHeading?: string;
  articleWrapperClass: string;
  mdMountId: string;
  markReadId: string;
  showArticleLocknote: boolean;
}

const MODULE_CONTENT: Record<1 | 2 | 3 | 4, ModuleContent> = {
  1: {
    headingId: 'm1-title',
    heading: 'Module 1 — Foundations (10–12 minutes)',
    subtitle: 'Components: 1 short video (2:00), 1 article (~700 words)',
    video: {
      id: 'm1-video',
      ariaLabel: 'Video 1 — Why dark patterns exist (2:00)',
      src: '/assets/video/video1.mp4',
      showFallbackText: true,
      transcriptHeading: 'Video 1 — “Why dark patterns exist” (2:00)',
      transcriptParagraphs: [
        '0:00–0:20: Companies test every click. Small lifts in conversion or retention compound into real money.',
        '0:20–0:40: Dark patterns are design choices that push you toward outcomes you didn’t intend. They cluster in sign-ups, checkouts, and cancellations.',
        '0:40–1:10: Common incentives: reduce churn, sell add-ons, harvest data, block refunds. The patterns you’ll see are predictable because the incentives are predictable.',
        '1:10–1:40: Your defense: name the tactic, choose an action (opt-out, cancel, escalate), and save proof.',
        '1:40–2:00: In this course you’ll learn a fast scan method, standard counter-moves, and a lightweight documentation routine.',
      ],
    },
    articleHeading: 'Article A — “A fast scan method that works”',
    articleWrapperClass: 'content-card mt-1',
    mdMountId: 'md-01',
    markReadId: 'm1-mark-read',
    showArticleLocknote: true,
  },
  2: {
    headingId: 'm2-title',
    heading: 'Module 2 — Pattern families (25–30 minutes)',
    subtitle: 'Components: 1 explainer article (~1,100–1,300 words), 1 micro-video (1:30), 1 lightweight identification exercise',
    video: {
      id: 'm2-video',
      ariaLabel: 'Micro-video 2 — The eight families in 90 seconds (1:30)',
      src: '/assets/video/video2.mp4',
      showFallbackText: false,
      transcriptHeading: 'Micro-video 2 — “The eight families in 90 seconds” (1:30)',
      transcriptParagraphs: [
        'Obstruction (extra steps or narrow windows).',
        'Forced action (bundle unrelated consent).',
        'Sneaking (pre-checked or auto-added items).',
        'Interface interference (visual weight, button labelling).',
        'Confirmshaming (guilt language).',
        'Nagging (repeated prompts).',
        'Social proofing (manufactured urgency/consensus).',
        'Misdirection (visual focus away from the real choice).',
      ],
    },
    articleWrapperClass: 'content-card mt-1',
    mdMountId: 'md-02',
    markReadId: 'm2-mark-read',
    showArticleLocknote: false,
  },
  3: {
    headingId: 'm3-title',
    heading: 'Module 3 — Counter-moves (20–25 minutes)',
    subtitle: 'Components: 1 article (~1,200–1,400 words), 1 short “scripts” micro-video (1:40), optional text chat practice (3 prompts)',
    video: {
      id: 'm3-video',
      ariaLabel: 'Micro-video 3 — The three actions that fix most situations (1:40)',
      src: '/assets/video/video3.mp4',
      showFallbackText: false,
      transcriptHeading: 'Micro-video 3 — “The three actions that fix most situations” (1:40)',
      transcriptParagraphs: [
        'Opt-out cleanly (find and uncheck; use site settings; confirm by email).',
        'Cancel decisively (use the required channel once; include the essentials; log proof).',
        'Escalate with evidence (policy excerpt + your timestamped action + specific remedy requested).',
      ],
    },
    articleWrapperClass: 'content-card mt-1',
    mdMountId: 'md-03',
    markReadId: 'm3-mark-read',
    showArticleLocknote: false,
  },
  4: {
    headingId: 'm4-title',
    heading: 'Module 4 — Documentation & evidence (10–12 minutes)',
    subtitle: 'Components: 1 article (~800–1,000 words), guided form that generates the “Risk Audit” (required for certificate)',
    articleWrapperClass: 'content-card',
    mdMountId: 'md-04',
    markReadId: 'm4-mark-read',
    showArticleLocknote: false,
  },
};

/* ─────────────────────────
   Article card — shared by all 4 units.
─────────────────────────── */
function ArticleCard({
  unit,
  content,
  mdPath,
  locked,
  onArticleDone,
}: {
  unit: 1 | 2 | 3 | 4;
  content: ModuleContent;
  mdPath: string;
  locked: boolean;
  onArticleDone: () => void;
}) {
  const { html, mountRef, scrolledToEnd } = useArticleGate(mdPath, locked);

  function handleMarkRead(): void {
    if (!scrolledToEnd) {
      showToast('Scroll to the end first.', 'error');
      return;
    }
    onArticleDone();
    showToast(`Module ${unit} article marked as read.`, 'success');
    track('article_read', { module: `m${unit}` });
  }

  return (
    <article className={content.articleWrapperClass}>
      {content.articleHeading && <h3>{content.articleHeading}</h3>}
      <div id={content.mdMountId} className="md" aria-live="polite" ref={mountRef} dangerouslySetInnerHTML={{ __html: html ?? '' }} />
      <div className="gate">
        <button
          id={content.markReadId}
          className="btn btn-ghost"
          type="button"
          disabled={!scrolledToEnd}
          aria-disabled={!scrolledToEnd}
          onClick={handleMarkRead}
        >
          Mark article as read
        </button>
        {content.showArticleLocknote && <span className="locknote">Article must be loaded and scrolled.</span>}
      </div>
    </article>
  );
}

/* ─────────────────────────
   Video card (units 1-3 only) — course-one.ts:360-463's gateVideo(),
   encapsulated in useVideoGate; the overlay is now plain conditional JSX.
─────────────────────────── */
function VideoCard({ video, locked, onVideoDone }: { video: VideoContent; locked: boolean; onVideoDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { showOverlay, controls, onPlayClick } = useVideoGate(videoRef, onVideoDone, locked);

  return (
    <div className="video-wrap" style={{ position: 'relative' }}>
      <video
        id={video.id}
        ref={videoRef}
        controls={controls}
        preload="metadata"
        aria-label={video.ariaLabel}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        style={{ display: 'block', margin: '0 auto', maxWidth: '960px', width: '100%', height: 'auto', objectFit: 'contain' }}
      >
        <source src={video.src} type="video/mp4" />
        {video.showFallbackText && 'Your browser does not support the video tag.'}
      </video>
      {showOverlay && (
        <button
          type="button"
          aria-label="Play video"
          onClick={onPlayClick}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.35))',
            cursor: 'pointer',
            borderRadius: '16px',
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,.9)',
              boxShadow: '0 8px 40px rgba(0,0,0,.35)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#111">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────
   Script Drills (unit 3 only) — course-one.ts:1028-1044.
─────────────────────────── */
function ScriptDrills({ onDrillsChecked }: { onDrillsChecked?: () => void }) {
  const drillsRef = useRef<HTMLTextAreaElement>(null);
  const [checklist, setChecklist] = useState('');

  function handleCheck(): void {
    const t = (drillsRef.current?.value ?? '').toLowerCase();
    const hasIdOrEmail = /\b(id|account|email)\b/.test(t);
    const hasDate = /\b\d{4}-\d{2}-\d{2}\b/.test(t);
    const askConfirm = /(confirm|confirmation)/.test(t);
    const channel = /(phone|chat|email)/.test(t);
    const list = [
      `${hasIdOrEmail ? '✔' : '•'} contains ID/email`,
      `${hasDate ? '✔' : '•'} contains a date`,
      `${askConfirm ? '✔' : '•'} asks for written confirmation`,
      `${channel ? '✔' : '•'} states the channel used`,
    ];
    setChecklist(list.join(' · '));
    onDrillsChecked?.();
  }

  return (
    <div className="content-card mt-1">
      <h3>“Script Drills” (optional)</h3>
      <ol className="md">
        <li>You see a “pause” trap. Draft two sentences rejecting it and asking for a hard cancel.</li>
        <li>You returned an item; merchant says “refund pending.” Draft the exact one-paragraph follow-up quoting policy.</li>
        <li>Agent refuses to email confirmation. Draft the post-call email that documents the call.</li>
      </ol>
      <textarea id="drills" ref={drillsRef} rows={6} placeholder="Paste your drafts here…" className="drills-textarea" />
      <div id="drill-checklist" className="drawer subtle">
        {checklist}
      </div>
      <button id="drills-check" className="btn btn-ghost mt-05" type="button" onClick={handleCheck}>
        Check for essentials
      </button>
    </div>
  );
}

/* ─────────────────────────
   Transcript card — units 1-3 only, identical shape per unit.
─────────────────────────── */
function TranscriptCard({ video }: { video: VideoContent }) {
  return (
    <div className="transcript content-card mt-1">
      <h3>{video.transcriptHeading}</h3>
      <details>
        <summary>View transcript</summary>
        <div className="md mt-05">
          {video.transcriptParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

export function Module(props: ModuleProps) {
  const content = MODULE_CONTENT[props.unit];

  return (
    <>
      <h2 id={content.headingId}>{content.heading}</h2>
      <p className="subtle">{content.subtitle}</p>

      {props.unit !== 4 && content.video && (
        <>
          <VideoCard video={content.video} locked={props.locked} onVideoDone={props.onVideoDone} />
          <TranscriptCard video={content.video} />
        </>
      )}

      <ArticleCard unit={props.unit} content={content} mdPath={props.mdPath} locked={props.locked} onArticleDone={props.onArticleDone} />

      {props.unit === 3 && <ScriptDrills onDrillsChecked={props.onDrillsChecked} />}
    </>
  );
}
