// O6, the real fix. Replaces courseone.astro:364-421's markup +
// src/islands/course-one.ts's prepareCertificate()/#download-cert/
// #download-badge handlers (course-one.ts:1337-1393).
//
// Visibility: CourseOne.tsx mounts this component's wrapping <section>
// conditionally on `state.postQuiz.pass` (see its own comment there) — NOT
// via `.certificate.ready`. Confirmed before writing this file: `grep -n
// "ready" src/islands/course-one.ts` matches nothing that ever adds the
// class (the one hit is the substring in an unrelated comment, "already
// completed"). `.certificate { display:none }` / `.certificate.ready {
// display:block }` in courseone.astro's <style> block are left alone —
// they still exist for whatever print-path or future non-React caller might
// reference them — but no code here ever toggles `.ready`; the React
// conditional in CourseOne.tsx *is* the visibility switch now.
//
// Learner name: self-sourced, not a prop (O5/O6 — see CertificateProps'
// comment in CourseOne.tsx). `#learner-name`/`#save-name` never existed in
// this page's markup and are not being reintroduced; ff_user_name's sole
// writer is ProfileSettings.tsx (Phase 10c).
//
// Badge export: two <svg class="badge-svg"> instances exist — one in the
// visible .content-card (gradient id="g"), one inside the printable
// #certificate-sheet (gradient id="g2", scoped separately so the two sheets
// never fight over the same gradient id when both are in the DOM at once).
// The export takes `.outerHTML` of the FIRST one via a ref, exactly
// replicating `document.querySelector('#certificate .badge-svg')`'s
// document-order behavior — the gradient <defs> stays inside that same
// <svg> so the serialized markup is self-contained and renders filled when
// re-parsed as a standalone image. Do not hoist/dedupe the <defs> out of
// either <svg> — that would break both exports.
//
// One deliberate departure from a byte-for-byte port: both <svg> tags here
// carry an explicit `xmlns="http://www.w3.org/2000/svg"` that
// courseone.astro's markup never had. Verified directly (see the final
// report): `outerHTML` of a live, namespace-less <svg> never includes an
// `xmlns` attribute — the HTML fragment serializer doesn't add one — and
// Chromium's `<img>` SVG decoder refuses to decode that markup from a blob
// URL (`onerror` fires, `onload` never does), so the ORIGINAL export is
// already silently broken in the same way regardless of the defs-placement
// risk this comment block otherwise warns about. Adding `xmlns` here is the
// minimal fix that makes the pipeline this component owns actually work;
// it changes nothing about how the <svg> renders inline.
import { useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getUserName } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { track } from '../../lib/track';
import type { CertificateProps } from './CourseOne';

export function Certificate({ postQuizScore, certificate: _certificate, onIssue }: CertificateProps) {
  const { user } = useAuth();
  const learnerName = getUserName() ?? user?.displayName ?? 'Learner';

  const badgeSvgRef = useRef<SVGSVGElement>(null);
  const certNameRef = useRef<HTMLElement>(null);
  const certScoreRef = useRef<HTMLElement>(null);
  const certDateRef = useRef<HTMLDivElement>(null);
  const certIdRef = useRef<HTMLSpanElement>(null);

  function handleDownloadCert(): void {
    const { id, date } = onIssue();
    if (certNameRef.current) certNameRef.current.textContent = learnerName;
    if (certScoreRef.current) certScoreRef.current.textContent = `${postQuizScore}%`;
    if (certDateRef.current) certDateRef.current.textContent = `Date: ${date}`;
    if (certIdRef.current) certIdRef.current.textContent = id;
    window.print();
    track('certificate_print');
  }

  function handleDownloadBadge(): void {
    onIssue();
    const svgEl = badgeSvgRef.current;
    if (!svgEl) {
      showToast('Badge artwork not found.', 'error');
      return;
    }
    const svg = svgEl.outerHTML;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 64, 64, 384, 384);
        c.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'FinanceFirst_Badge_Dark-Pattern-Spotter.png';
          a.click();
          URL.revokeObjectURL(a.href);
          track('badge_download');
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <>
      <h2 id="cert-title">Badge &amp; Certificate</h2>
      <p className="subtle">You've met all completion criteria. Download your PDF certificate and badge image.</p>

      <div className="content-card">
        <div className="inline-list badge-row">
          <svg
            ref={badgeSvgRef}
            className="badge-svg"
            viewBox="0 0 128 128"
            role="img"
            aria-label="Dark Pattern Spotter badge"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#3F6AFF" />
                <stop offset="0.5" stopColor="#22D1B2" />
                <stop offset="1" stopColor="#FFD166" />
              </linearGradient>
            </defs>
            <path d="M64 6l42 18v34c0 28-18 52-42 64C40 110 22 86 22 58V24z" fill="url(#g)" />
            <path d="M44 66l14 14 26-34" fill="none" stroke="#0B1220" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="md">
              <strong>Dark Pattern Spotter</strong>
            </div>
            <div className="subtle">Issued by Fynoptic</div>
          </div>
        </div>

        <div className="gate mt-1">
          <button className="btn btn-primary" id="download-cert" onClick={handleDownloadCert}>
            Download Certificate (PDF)
          </button>
          <button className="btn btn-ghost" id="download-badge" onClick={handleDownloadBadge}>
            Download Badge (PNG)
          </button>
        </div>
      </div>

      {/* Printable sheet */}
      <div id="certificate-sheet" className="certificate-sheet" aria-hidden="true">
        <div className="cert-header">
          <img src="/assets/img/fynopticlogo.png" alt="" className="cert-logo" />
          <div className="cert-title-block">
            <h1>Certificate of Completion</h1>
            <div className="cert-org">Fynoptic · Educational content. Not legal advice.</div>
          </div>
        </div>
        <hr className="cert-hr" />
        <p className="cert-body-text">
          This certifies that <strong ref={certNameRef} id="cert-name"></strong> has successfully completed{' '}
          <em>Dark Patterns—Spot Them, Stop Them</em>, including the required Risk Audit and a post-assessment score of{' '}
          <strong ref={certScoreRef} id="cert-score"></strong>.
        </p>
        <div className="cert-badge-row">
          <svg className="badge-svg" viewBox="0 0 128 128" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#3F6AFF" />
                <stop offset="0.5" stopColor="#22D1B2" />
                <stop offset="1" stopColor="#FFD166" />
              </linearGradient>
            </defs>
            <path d="M64 6l42 18v34c0 28-18 52-42 64C40 110 22 86 22 58V24z" fill="url(#g2)" />
            <path d="M44 66l14 14 26-34" fill="none" stroke="#0B1220" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="cert-badge-meta">
            <div>
              <strong>Badge:</strong> Dark Pattern Spotter
            </div>
            <div ref={certDateRef} id="cert-date"></div>
            <div>
              ID: <span ref={certIdRef} id="cert-id"></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
