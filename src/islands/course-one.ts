// Port of js/course-one.js (Course 1: "Dark Patterns—Spot Them, Stop Them").
//
// Ported faithfully, with these deliberate deviations:
//
//  - normalizeQuiz()'s flexible key-remapping (question/prompt, letter
//    answer keys, etc.) is dropped. data/quiz.json is known-format
//    (authored by us) and is validated with parseQuiz() from ../schemas
//    instead of trusted blindly. Same for data/id-exercise.json via
//    parseIdExercise().
//
//  - shrinkProgressPanel() is NOT ported. arhan/layout-alignment-fix
//    (d19d096, now merged) removed this exact function from
//    js/course-one.js, moving #progress-sidebar's geometry from an
//    inline-JS style write to CSS. src/styles/redesign.css now pins the
//    rail to the content rail's right edge at width 260px, so the inline
//    max-width the removed function wrote would only clamp it again.
//
//  - The a11y bar (#toggle-hc/#toggle-dys) and #learner-name/#save-name
//    have no markup anywhere in courseone.html (checked both this
//    worktree's and auth-overhaul's copies). The #toggle-hc/#toggle-dys
//    change-listeners were dead wiring (bound to elements that don't
//    exist) and have been removed; that behavior now lives site-wide in
//    ../lib/a11y.ts, applied from Base.astro. applyA11y() here still runs
//    unconditionally at boot since it only reads localStorage and toggles
//    body classes; it doesn't require the toggle inputs to exist.
//    #learner-name/#save-name remain `?.`-guarded no-ops, same as the source.
//
//  - The `sections` map from the source (an object of module-id ->
//    element, built but never read anywhere) is dropped — it's dead code
//    with zero consumers, kept out to avoid an unused-variable local.

import { showToast } from '../lib/toast';
import { track } from '../lib/track';
import { getCourseProgress, setCourseProgress } from '../lib/storage';
import { parseIdExercise, parseQuiz } from '../schemas';
import type { IdExerciseItem, QuizItem } from '../types';

const DP_STATE_KEY = 'ff_dp_state';
const COOKIE_NAME = 'ff_dp_state_v2';
const NAME_KEY = 'ff_user_name';
const AUDITS_KEY = 'ff_risk_audits';

function $<T extends HTMLElement = HTMLElement>(selector: string, ctx: ParentNode = document): T | null {
  return ctx.querySelector<T>(selector);
}
function $$<T extends HTMLElement = HTMLElement>(selector: string, ctx: ParentNode = document): T[] {
  return Array.from(ctx.querySelectorAll<T>(selector));
}

function disableAll(root: ParentNode, selector: string): void {
  root.querySelectorAll(selector).forEach((el) => {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLButtonElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      el.disabled = true;
    }
  });
}

function fdStr(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

/* ─────────────────────────
   Cookie + persisted state
─────────────────────────── */

interface QuizProgress {
  completed: boolean;
  score: number;
  answers: (number | null)[];
  correctness: (boolean | null)[];
}

interface PostQuizProgress extends QuizProgress {
  pass: boolean;
}

interface CourseState {
  preQuiz: QuizProgress;
  m1: { video: boolean; article: boolean };
  m2: { video: boolean; article: boolean; idExercise: boolean };
  m3: { video: boolean; article: boolean; drillsChecked: boolean };
  m4: { article: boolean; auditSubmitted: boolean; auditId: string | null };
  postQuiz: PostQuizProgress;
  certificate: { issued: boolean; id: string | null; date: string | null };
}

const defaultState: CourseState = {
  preQuiz: { completed: false, score: 0, answers: [], correctness: [] },
  m1: { video: false, article: false },
  m2: { video: false, article: false, idExercise: false },
  m3: { video: false, article: false, drillsChecked: false },
  m4: { article: false, auditSubmitted: false, auditId: null },
  postQuiz: { completed: false, score: 0, pass: false, answers: [], correctness: [] },
  certificate: { issued: false, id: null, date: null },
};

function setCookie(name: string, value: string, days = 180): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/; samesite=lax`;
  } catch {
    // cookies may be blocked; ignore
  }
}

function getCookie(name: string): string | null {
  try {
    const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function parseStoredState(raw: string): Partial<CourseState> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<CourseState>) : null;
  } catch {
    return null;
  }
}

function loadState(): CourseState {
  const cookie = getCookie(COOKIE_NAME);
  if (cookie) {
    const parsed = parseStoredState(cookie);
    if (parsed) return { ...defaultState, ...parsed };
  }
  try {
    const ls = localStorage.getItem(DP_STATE_KEY);
    if (ls) {
      const parsed = parseStoredState(ls);
      if (parsed) return { ...defaultState, ...parsed };
    }
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
  return { ...defaultState };
}

function saveState(s: CourseState): void {
  try {
    localStorage.setItem(DP_STATE_KEY, JSON.stringify(s));
  } catch {
    // localStorage may be unavailable; ignore.
  }
  setCookie(COOKIE_NAME, JSON.stringify(s));
}

let state: CourseState = defaultState;

function bumpCourseProgress(s: CourseState): void {
  const ids = new Set(getCourseProgress());
  if (s.m1.video && s.m1.article) ids.add('dp-m1');
  if (s.m2.video && s.m2.article && s.m2.idExercise) ids.add('dp-m2');
  if (s.m3.video && s.m3.article) ids.add('dp-m3');
  if (s.m4.article && s.m4.auditSubmitted) ids.add('dp-m4');
  setCourseProgress([...ids]);
}

/* ─────────────────────────
   A11y (defensive — no matching markup on this page, see file header)
─────────────────────────── */

function applyA11y(): void {
  document.body.classList.toggle('hc', localStorage.getItem('ff_a11y_hc') === '1');
  document.body.classList.toggle('dyslexia', localStorage.getItem('ff_a11y_dys') === '1');
  const hc = $<HTMLInputElement>('#toggle-hc');
  const dys = $<HTMLInputElement>('#toggle-dys');
  if (hc) hc.checked = localStorage.getItem('ff_a11y_hc') === '1';
  if (dys) dys.checked = localStorage.getItem('ff_a11y_dys') === '1';
}

/* ─────────────────────────
   Markdown + video gating
─────────────────────────── */

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function mdToHtml(md: string): string {
  if (!md) return '';

  md = md.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_m, lang: string | undefined, code: string) =>
      `<pre><code class="lang-${lang || 'text'}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`,
  );

  md = md.replace(
    /^\s*\[!(TIP|NOTE|WARNING)]\s*(?:\**([^\n*]+)\**)?\s*\n([\s\S]*?)(?=\n{2,}|\n\[!|$)/gim,
    (_m, kind: string, title: string | undefined, body: string) => {
      const classByKind: Record<string, string> = { TIP: 'co-tip', NOTE: 'co-note', WARNING: 'co-warn' };
      const iconByKind: Record<string, string> = { TIP: '💡', NOTE: '📝', WARNING: '⚠️' };
      const head = title ? `<strong>${title.trim()}</strong>` : '';
      return `<div class="callout ${classByKind[kind] ?? 'co-note'}"><div class="co-ico" aria-hidden="true">${iconByKind[kind] ?? 'ℹ️'}</div><div>${head}${body.trim()}</div></div>`;
    },
  );

  md = md.replace(/^(>\s?.+)(\n(>\s?.+))*$/gm, (m) => `<blockquote>${m.replace(/^>\s?/gm, '').trim()}</blockquote>`);

  md = md.replace(/^\s*---\s*$/gm, '<hr/>');

  md = md
    .replace(/^###\s+(.*)$/gim, (_m, t: string) => {
      const id = slugify(t);
      return `<h3 id="${id}">${t}<a class="anchor" href="#${id}" aria-label="Link to section">#</a></h3>`;
    })
    .replace(/^##\s+(.*)$/gim, (_m, t: string) => {
      const id = slugify(t);
      return `<h2 id="${id}">${t}<a class="anchor" href="#${id}" aria-label="Link to section">#</a></h2>`;
    })
    .replace(/^#\s+(.*)$/gim, (_m, t: string) => `<h1>${t}</h1>`);

  md = md
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    .replace(/(?:^<li>.*<\/li>\n?)+/gm, (run) => `<ul>${run.trim()}</ul>`);

  md = md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  md = md.replace(/\n{2,}/g, '</p><p>').replace(/^\s*<p><\/p>/, '');
  return `<p>${md}</p>`;
}

function enhanceArticle(mountEl: HTMLElement | null): void {
  if (!mountEl) return;

  const firstP = Array.from(mountEl.querySelectorAll<HTMLElement>('p')).find(
    (p) => (p.textContent ?? '').trim().length > 0 && !p.closest('.callout'),
  );
  if (firstP) firstP.classList.add('lead');

  const heads = Array.from(mountEl.querySelectorAll<HTMLElement>('h2, h3'));
  const items = heads.map((h) => {
    const id = h.id || slugify(h.textContent ?? '');
    h.id = id;
    return { id, text: (h.textContent ?? '').replace(/#\s*$/, '').trim(), level: h.tagName.toLowerCase() };
  });
  const showToc = items.filter((i) => i.level === 'h2').length >= 2;
  if (showToc) {
    const nav = document.createElement('nav');
    nav.className = 'article-toc';
    nav.setAttribute('aria-label', 'On this page');
    nav.innerHTML = `<ul>${items.map((i) => `<li class="toc-${i.level}"><a href="#${i.id}">${i.text}</a></li>`).join('')}</ul>`;
    mountEl.prepend(nav);
  }
}

async function fetchText(filename: string): Promise<string> {
  const res = await fetch(filename, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${filename} not reachable`);
  return res.text();
}

async function fetchJson(filename: string): Promise<unknown> {
  const res = await fetch(filename, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${filename} not reachable`);
  return res.json();
}

// Smart loader: fetch text; if blocked (file://), fall back to an iframe viewer.
async function loadMarkdownSmart(
  filename: string,
  mountElOrNull: HTMLElement | null,
  markBtnOrNull: HTMLButtonElement | null,
): Promise<void> {
  if (!mountElOrNull || !markBtnOrNull) return;
  // const aliases so the null-narrowing above survives inside the nested
  // closures below (TS doesn't propagate narrowing of `let`/parameter
  // bindings into closures, only of `const` bindings).
  const mountEl = mountElOrNull;
  const markBtn = markBtnOrNull;
  markBtn.disabled = true;
  markBtn.setAttribute('aria-disabled', 'true');
  try {
    const text = await fetchText(filename);
    mountEl.innerHTML = mdToHtml(text);
    enhanceArticle(mountEl);
    const target = mountEl.lastElementChild ?? mountEl;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          markBtn.disabled = false;
          markBtn.setAttribute('aria-disabled', 'false');
          io.disconnect();
        }
      },
      { threshold: 1.0 },
    );
    io.observe(target);
  } catch {
    // file:// fallback
    mountEl.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'subtle';
    note.style.marginBottom = '8px';
    note.innerHTML = `Using <code>file://</code> fallback viewer for <code>${filename}</code>. For best results run a local server.`;
    mountEl.appendChild(note);

    const frame = document.createElement('iframe');
    frame.src = filename;
    frame.sandbox.add('allow-same-origin');
    frame.style.width = '100%';
    frame.style.height = '60vh';
    frame.style.border = '0';
    frame.style.background = '#0b1325';
    mountEl.appendChild(frame);

    function tryAttach(): void {
      try {
        const doc = frame.contentDocument ?? frame.contentWindow?.document;
        const sc = doc?.scrollingElement ?? doc?.documentElement ?? doc?.body;
        if (!sc) throw new Error('no scrolling element');
        markBtn.disabled = true;
        markBtn.setAttribute('aria-disabled', 'true');
        sc.addEventListener('scroll', () => {
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 10) {
            markBtn.disabled = false;
            markBtn.setAttribute('aria-disabled', 'false');
          }
        });
      } catch {
        // if we can't access the iframe (some browsers), unlock after the user sees it for 30s
        const obs = new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting)) {
              setTimeout(() => {
                markBtn.disabled = false;
                markBtn.setAttribute('aria-disabled', 'false');
              }, 30000);
              obs.disconnect();
            }
          },
          { threshold: 0.5 },
        );
        obs.observe(frame);
      }
    }
    frame.addEventListener('load', tryAttach);
    setTimeout(tryAttach, 500);
  }
}

// Big-button, centered, anti-skip gated video.
function gateVideo(videoOrNull: HTMLVideoElement | null, onDone: () => void): void {
  if (!videoOrNull) return;
  // const alias so the null-narrowing above survives inside the nested
  // event listener closures below.
  const video = videoOrNull;

  try {
    video.style.display = 'block';
    video.style.margin = '0 auto';
    video.style.maxWidth = '960px';
    video.style.width = '100%';
    video.style.height = 'auto';
    video.style.objectFit = 'contain';
    video.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
    video.disablePictureInPicture = true;
  } catch {
    // cosmetic only
  }

  video.controls = false;

  const wrap = video.parentElement ?? video;
  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.setAttribute('aria-label', 'Play video');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'grid';
  overlay.style.placeItems = 'center';
  overlay.style.border = '0';
  overlay.style.background = 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.35))';
  overlay.style.cursor = 'pointer';
  overlay.style.borderRadius = '16px';
  overlay.style.zIndex = '5';

  const icon = document.createElement('div');
  icon.style.width = '96px';
  icon.style.height = '96px';
  icon.style.borderRadius = '50%';
  icon.style.background = 'rgba(255,255,255,.9)';
  icon.style.boxShadow = '0 8px 40px rgba(0,0,0,.35)';
  icon.style.display = 'grid';
  icon.style.placeItems = 'center';
  icon.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="#111"><path d="M8 5v14l11-7z"/></svg>`;
  overlay.appendChild(icon);

  const oldPos = getComputedStyle(wrap).position;
  if (oldPos === 'static') wrap.style.position = 'relative';
  wrap.appendChild(overlay);

  overlay.addEventListener('click', () => {
    video.play().catch(() => {});
  });

  // anti-skip
  let maxTime = 0;
  let completed = false;
  const COMPLETE_AT = 0.95;

  function seekingGuard(): void {
    if (video.currentTime > maxTime + 0.5) video.currentTime = maxTime;
  }
  function freezeRate(): void {
    if (video.playbackRate !== 1) video.playbackRate = 1;
  }

  video.addEventListener('timeupdate', () => {
    if (video.currentTime > maxTime) maxTime = video.currentTime;
    if (!completed && video.duration && video.currentTime / video.duration >= COMPLETE_AT) {
      completed = true;
      video.removeEventListener('seeking', seekingGuard);
      video.removeEventListener('ratechange', freezeRate);
      onDone();
      showToast('Video completed ✔', 'success');
    }
  });

  video.addEventListener('seeking', seekingGuard);
  video.addEventListener('ratechange', freezeRate);

  video.addEventListener('play', () => {
    overlay.style.display = 'none';
  });
  video.addEventListener('pause', () => {
    if (!completed) overlay.style.display = 'grid';
  });

  function enableControlsIfDone(): void {
    if (completed) {
      video.controls = true;
      overlay.remove();
    }
  }
  video.addEventListener('ended', () => {
    completed = true;
    enableControlsIfDone();
  });

  video.addEventListener('loadedmetadata', () => {
    freezeRate();
    seekingGuard();
  });
  video.addEventListener('error', () => showToast('Video failed to load (check file path).', 'error'), { once: true });
}

/* hide "✅" until reveal=true */
function sanitizeOptionText(opt: string, reveal: boolean): string {
  return reveal ? opt : opt.replace(/\s*✅/g, '');
}

/* ─────────────────────────
   Quiz render/grade
─────────────────────────── */

interface GradableItem {
  stem: string;
  options: string[];
  answerIndex: number;
  rationale: string;
  choice: number | null;
}

interface GradableIdItem {
  vignette: string;
  options: string[];
  answerIndex: number;
  countermove: string;
  rationale: string;
  choice: number | null;
}

function toGradable(item: QuizItem): GradableItem {
  return { stem: item.stem, options: item.options, answerIndex: item.answer_index, rationale: item.rationale, choice: null };
}

function toGradableId(item: IdExerciseItem): GradableIdItem {
  return {
    vignette: item.vignette,
    options: item.options,
    answerIndex: item.answer_index,
    countermove: item.countermove,
    rationale: item.rationale,
    choice: null,
  };
}

interface RenderQuizOpts {
  savedChoices?: (number | null)[];
  correctness?: (boolean | null)[];
  onChoice?: (idx: number, value: number) => void;
  revealMarks?: boolean;
}

function renderQuiz(root: HTMLElement, items: GradableItem[], onChange: (() => void) | undefined, opts: RenderQuizOpts = {}): void {
  const savedChoices = opts.savedChoices ?? [];
  const onChoice = opts.onChoice ?? (() => {});
  const revealMarks = !!opts.revealMarks;

  root.innerHTML = '';
  items.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'q-item';
    const t = document.createElement('div');
    t.className = 'q-title';
    t.textContent = `${idx + 1}. ${q.stem}`;
    const wrap = document.createElement('div');
    wrap.className = 'q-options';

    const saved = savedChoices[idx];
    q.choice = typeof saved === 'number' ? saved : null;

    q.options.forEach((opt, i) => {
      const lab = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = `q${idx}`;
      r.value = String(i);
      if (q.choice === i) r.checked = true;
      r.addEventListener('change', () => {
        q.choice = i;
        card.classList.remove('correct', 'incorrect');
        onChoice(idx, i);
        onChange?.();
      });
      const span = document.createElement('span');
      span.innerHTML = sanitizeOptionText(opt, revealMarks);
      lab.appendChild(r);
      lab.appendChild(span);
      wrap.appendChild(lab);
    });

    const res = document.createElement('div');
    res.className = 'result';
    card.appendChild(t);
    card.appendChild(wrap);
    card.appendChild(res);
    root.appendChild(card);
  });

  if (opts.correctness) {
    opts.correctness.forEach((ok, idx) => {
      if (ok === null || ok === undefined) return;
      const card = root.children[idx];
      if (!(card instanceof HTMLElement)) return;
      card.classList.add(ok ? 'correct' : 'incorrect');
      const res = card.querySelector<HTMLElement>('.result');
      if (res) res.textContent = ok ? 'Correct.' : 'Incorrect.';
    });
  }
}

function gradeQuiz(root: HTMLElement, items: GradableItem[]): { correct: number; total: number; pct: number } {
  let correct = 0;
  items.forEach((q, idx) => {
    const ok = q.choice !== null && q.choice === q.answerIndex;
    if (ok) correct++;
    const card = root.children[idx];
    if (!(card instanceof HTMLElement)) return;
    card.classList.add(ok ? 'correct' : 'incorrect');
    const res = card.querySelector<HTMLElement>('.result');
    if (res) {
      res.innerHTML = ok ? 'Correct.' : 'Incorrect.';
      if (q.rationale) {
        const d = document.createElement('div');
        d.className = 'drawer';
        d.textContent = `Rationale: ${q.rationale}`;
        res.appendChild(d);
      }
    }
  });
  const pct = Math.round((correct / items.length) * 100);
  return { correct, total: items.length, pct };
}

/* ─────────────────────────
   Content: Pre-quiz items (inline, diagnostic only)
─────────────────────────── */

const PRE_ITEMS: GradableItem[] = [
  {
    stem: 'A checkout shows a $19 warranty box pre-checked. What do you do first?',
    options: [
      'Uncheck the warranty, screenshot the cart, then continue checkout. ✅',
      'Uncheck the warranty and proceed without taking any screenshots.',
      'Leave the warranty checked, then contact support after receiving any charges.',
      'Close the tab and search for a cheaper seller before buying.',
    ],
    answerIndex: 0,
    rationale: 'Unchecking plus a screenshot is fastest and preserves proof if charged in error.',
    choice: null,
  },
  {
    stem: 'The cancel flow highlights “Pause” with a large button while “Cancel” is tiny and gray. Best next step?',
    options: [
      'Click the prominent Pause option and assume it cancels later.',
      'Search the page for explicit cancel wording, screenshot the UI, then choose cancel. ✅',
      'Call support immediately to ask what Pause actually does.',
      'Close the site and try again another day without screenshots.',
    ],
    answerIndex: 1,
    rationale: 'Find explicit cancel controls and document UI tricks before accepting a pause.',
    choice: null,
  },
  {
    stem: 'A service requires phone calls only, weekdays 9–5 to cancel. You can call once this week. What protects you most?',
    options: [
      'Call once, request cancellation, and keep a dated note of the agent’s name. ✅',
      'Call multiple times until you reach a supervisor and take no notes.',
      'Skip calling; instead file a complaint with your card issuer immediately.',
      'Visit the company in person and rely on verbal confirmation.',
    ],
    answerIndex: 0,
    rationale: 'Use required channel once and record agent/time to create an evidentiary trail.',
    choice: null,
  },
  {
    stem: 'A banner says “62 people viewing now” with no source. What’s the reasonable consumer action?',
    options: [
      'Rush to buy because the number likely means low stock.',
      'Ignore the banner and open another tab to compare price and stock. ✅',
      'Ask chat support to confirm the banner’s accuracy before deciding.',
      'Add to cart, then wait 24 hours to see if price drops.',
    ],
    answerIndex: 1,
    rationale: 'Verify independently; manufactured urgency should not drive an immediate decision.',
    choice: null,
  },
  {
    stem: 'After clicking “No thanks,” a modal re-labels buttons with vague text. What should you do before clicking?',
    options: [
      'Use keyboard/tab keys to select the intended action, then screenshot before and after. ✅',
      'Click the large button quickly to avoid extra popups.',
      'Reload the page and attempt the flow without any screenshots.',
      'Contact support to ask which button is correct before proceeding.',
    ],
    answerIndex: 0,
    rationale: 'Keyboard navigation bypasses visual tricks; screenshots prove the UI state.',
    choice: null,
  },
  {
    stem: 'A free trial requires a credit card and hides renewal terms in Billing Details. What’s the safest pre-signup step?',
    options: [
      'Sign up and rely on your calendar memory to cancel in time.',
      'Record the billing page, note trial length, and set a calendar reminder before signing. ✅',
      'Never use free trials; ignore the product entirely.',
      'Use your main email and enable autofill to speed registration.',
    ],
    answerIndex: 1,
    rationale: 'Capturing terms and a reminder prevents surprise renewals.',
    choice: null,
  },
  {
    stem: 'You notice an unexpected line item in your cart total you didn’t add. Which evidence is most useful?',
    options: [
      'Screenshot of the cart showing the unexpected line item and the full total. ✅',
      'Photo of the product page after checkout.',
      'The merchant’s merchant ID number on their homepage.',
      'A comment from another buyer complaining about extra charges.',
    ],
    answerIndex: 0,
    rationale: 'A cart screenshot ties the unexpected item directly to checkout state and price.',
    choice: null,
  },
  {
    stem: 'The signup form bundles marketing emails with required consent. What’s the safest approach?',
    options: [
      'Check the box and assume you can opt out later from settings.',
      'Look for separate marketing or communications settings, or use an alternate email address. ✅',
      'Abandon the signup entirely because bundled consent is always enforceable.',
      'Call support to request the checkbox be removed before signing up.',
    ],
    answerIndex: 1,
    rationale: 'Use settings or an alternate email to avoid bundled consent while still testing the product.',
    choice: null,
  },
  {
    stem: 'You see a pop-up claiming “Only loyal customers keep this.” What does this aim to do and what should you do?',
    options: [
      'It is a loyalty program notice; enroll now for benefits.',
      'It uses guilt to discourage leaving; proceed with your plan and save confirmation. ✅',
      'It is a legal requirement to disclose fees; read the TOS immediately.',
      'It’s a sign of a broken site; try again later.',
    ],
    answerIndex: 1,
    rationale: 'Guilt language is persuasive copy; ignore persuasion and document your chosen action.',
    choice: null,
  },
  {
    stem: 'You were unsuccessful with several pre-quiz items. Which short remediation would help you most?',
    options: [
      'Read a two-minute example showing one cancellation and one refund scenario with screenshots. ✅',
      'Re-take the pre-quiz immediately without additional materials.',
      'Jump ahead to Module 3 and assume practice will fill gaps.',
      'Read the full platform T&Cs for each merchant in the course examples.',
    ],
    answerIndex: 0,
    rationale: 'Short, focused examples directly improve practical skills without overwhelming the learner.',
    choice: null,
  },
];

/* ─────────────────────────
   Linear-path step model
─────────────────────────── */

interface Step {
  key: string;
  label: string;
  section: string;
  loader: () => void;
  done: () => boolean;
}

function setStepStatus(stepEls: HTMLElement[], step: string, unlocked: boolean, done = false): void {
  const el = stepEls.find((s) => s.dataset.step === step);
  if (!el) return;
  el.classList.toggle('is-unlocked', unlocked);
  el.classList.toggle('is-locked', !unlocked);
  const dot = el.querySelector<HTMLElement>('.dot');
  if (dot) dot.style.background = done ? 'var(--success-500)' : unlocked ? 'var(--primary-600)' : '#2a3550';
}

function lockSection(el: HTMLElement | null, locked: boolean, message = ''): void {
  if (!el) return;
  el.classList.toggle('locked', locked);
  if (locked) {
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
    const existing = el.querySelector<HTMLElement>('.locked-scrim');
    if (!existing) {
      const scrim = document.createElement('div');
      scrim.className = 'locked-scrim';
      scrim.style.pointerEvents = 'auto';
      scrim.innerHTML = `<div class="locked-card"><div class="locked-emoji" aria-hidden="true">🔒</div><div class="locked-msg">${message}</div></div>`;
      el.appendChild(scrim);
    } else {
      const msgEl = existing.querySelector<HTMLElement>('.locked-msg');
      if (msgEl) msgEl.textContent = message;
    }
  } else {
    el.removeAttribute('inert');
    el.removeAttribute('aria-hidden');
    el.querySelector('.locked-scrim')?.remove();
  }
}

function setBtnState(btn: HTMLButtonElement | null, enabled: boolean): void {
  if (!btn) return;
  btn.disabled = !enabled;
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

export function initCourseOne(): void {
  state = loadState();

  /* A11y + name (defensive — see file header) */
  applyA11y();

  const learnerNameInput = $<HTMLInputElement>('#learner-name');
  if (learnerNameInput) learnerNameInput.value = localStorage.getItem(NAME_KEY) || '';
  $<HTMLButtonElement>('#save-name')?.addEventListener('click', () => {
    const v = learnerNameInput?.value.trim() ?? '';
    if (!v) {
      showToast('Enter your full name for the certificate.', 'error');
      return;
    }
    localStorage.setItem(NAME_KEY, v);
    showToast('Name saved for your certificate.', 'success');
  });

  const stepEls = $$<HTMLElement>('.stepper-wrap .step');

  /* ---- Pre-quiz ---- */
  function initPreQuiz(): void {
    const preRoot = $('#pre-quiz-root');
    const preBtn = $<HTMLButtonElement>('#pre-submit');
    const preResult = $('#pre-result');
    if (!preRoot || !preBtn || !preResult) return;

    const onAnyChange = (): void => setBtnState(preBtn, PRE_ITEMS.every((q) => q.choice !== null));
    const onChoice = (idx: number, val: number): void => {
      state.preQuiz.answers[idx] = val;
      saveState(state);
    };

    renderQuiz(preRoot, PRE_ITEMS, onAnyChange, {
      savedChoices: state.preQuiz.answers,
      correctness: state.preQuiz.correctness,
      onChoice,
      revealMarks: state.preQuiz.completed,
    });
    onAnyChange();

    if (state.preQuiz.completed) {
      const correctCount = state.preQuiz.correctness.filter(Boolean).length;
      const total = PRE_ITEMS.length;
      const pct = state.preQuiz.score || Math.round((correctCount / total) * 100);
      preResult.textContent = `Score: ${correctCount}/${total} (${pct}%). Diagnostic only.`;
      disableAll(preRoot, 'input[type="radio"], button, select, textarea');
      preBtn.disabled = true;
      preBtn.setAttribute('aria-disabled', 'true');
    }

    preBtn.addEventListener('click', () => {
      if (preBtn.disabled) return;
      const { correct, total, pct } = gradeQuiz(preRoot, PRE_ITEMS);
      state.preQuiz = {
        completed: true,
        score: pct,
        answers: PRE_ITEMS.map((q) => q.choice),
        correctness: PRE_ITEMS.map((q) => q.choice !== null && q.choice === q.answerIndex),
      };
      saveState(state);
      track('pre_quiz_submit', { score: pct });
      preResult.textContent = `Score: ${correct}/${total} (${pct}%). Diagnostic only.`;
      renderQuiz(preRoot, PRE_ITEMS, undefined, {
        savedChoices: state.preQuiz.answers,
        correctness: state.preQuiz.correctness,
        revealMarks: true,
      });
      disableAll(preRoot, 'input[type="radio"], button, select, textarea');
      preBtn.disabled = true;
      preBtn.setAttribute('aria-disabled', 'true');
      showToast('Pre-quiz completed. Module 1 video unlocked.', 'success');
      updateLocks();
      $('#module-1')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ---- Module loaders (lazy) ---- */
  let m1Loaded = false;
  let m2Loaded = false;
  let m3Loaded = false;
  let m4Loaded = false;
  let postLoaded = false;

  async function loadIdExercise(): Promise<void> {
    const root = $('#id-ex-root');
    const submit = $<HTMLButtonElement>('#id-ex-submit');
    const out = $('#id-ex-result');
    if (!root) return;
    try {
      const raw = await fetchJson('data/id-exercise.json');
      const items = parseIdExercise(raw).map(toGradableId);
      if (!items.length) throw new Error('No items in id-exercise.json');
      root.innerHTML = '';

      items.forEach((it, idx) => {
        const card = document.createElement('div');
        card.className = 'q-item';
        const t = document.createElement('div');
        t.className = 'q-title';
        t.textContent = it.vignette;
        const opts = document.createElement('div');
        opts.className = 'q-options';

        it.options.forEach((opt, i) => {
          const lab = document.createElement('label');
          const r = document.createElement('input');
          r.type = 'radio';
          r.name = `id${idx}`;
          r.value = String(i);
          r.addEventListener('change', () => {
            it.choice = i;
            card.classList.remove('correct', 'incorrect');
            const res = card.querySelector<HTMLElement>('.result');
            if (res) res.textContent = '';
            setBtnState(submit, items.every((x) => x.choice !== null));
          });
          lab.appendChild(r);
          lab.appendChild(document.createTextNode(opt));
          opts.appendChild(lab);
        });

        const res = document.createElement('div');
        res.className = 'result';
        card.appendChild(t);
        card.appendChild(opts);
        card.appendChild(res);
        root.appendChild(card);
      });

      setBtnState(submit, false);

      submit?.addEventListener('click', () => {
        if (submit.disabled) return;
        let correct = 0;
        items.forEach((it, idx) => {
          const ok = it.choice !== null && it.choice === it.answerIndex;
          if (ok) correct++;
          const card = root.children[idx];
          if (!(card instanceof HTMLElement)) return;
          card.classList.toggle('correct', ok);
          card.classList.toggle('incorrect', !ok);
          const res = card.querySelector<HTMLElement>('.result');
          if (res) {
            if (ok) {
              res.innerHTML = `Correct. Recommended counter-move: ${it.countermove}<div class="drawer">Rationale: ${it.rationale}</div>`;
            } else {
              res.textContent = 'Incorrect — try again.';
            }
          }
        });

        const total = items.length;
        const allCorrect = correct === total;
        if (out) {
          out.textContent = allCorrect ? `All ${total}/${total} correct.` : `${total - correct} incorrect. Fix and check again.`;
        }

        if (allCorrect) {
          state.m2.idExercise = true;
          saveState(state);
          updateLocks();
          track('id_exercise_complete', { items: total, correct });
          showToast('Identification exercise completed.', 'success');
          setBtnState(submit, false);
        } else {
          setBtnState(submit, true);
          const firstBad = Array.from(root.children).find((_el, i) => {
            const item = items[i];
            return item ? item.choice !== item.answerIndex : false;
          });
          if (firstBad instanceof HTMLElement) firstBad.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
        }
      });
    } catch {
      root.innerHTML = `<div class="subtle">Couldn't load <code>id-exercise.json</code>. If this page is opened via <code>file://</code>, some browsers block local fetch. Run a local server or keep using the fallback.</div>`;
      setBtnState(submit, false);
    }
  }

  function loadM1(): void {
    if (m1Loaded) return;
    m1Loaded = true;
    gateVideo($<HTMLVideoElement>('#m1-video'), () => {
      state.m1.video = true;
      saveState(state);
      updateLocks();
      track('video_complete', { module: 'm1' });
    });
    const btn = $<HTMLButtonElement>('#m1-mark-read');
    const mount = $('#md-01');
    void loadMarkdownSmart('content/01-foundations.md', mount, btn);
    btn?.addEventListener('click', () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        showToast('Scroll to the end first.', 'error');
        return;
      }
      state.m1.article = true;
      saveState(state);
      updateLocks();
      showToast('Module 1 article marked as read.', 'success');
      track('article_read', { module: 'm1' });
    });
  }

  function loadM2(): void {
    if (m2Loaded) return;
    m2Loaded = true;
    gateVideo($<HTMLVideoElement>('#m2-video'), () => {
      state.m2.video = true;
      saveState(state);
      updateLocks();
      track('video_complete', { module: 'm2' });
    });
    const btn = $<HTMLButtonElement>('#m2-mark-read');
    const mount = $('#md-02');
    void loadMarkdownSmart('content/02-families.md', mount, btn);
    btn?.addEventListener('click', () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        showToast('Scroll to the end first.', 'error');
        return;
      }
      state.m2.article = true;
      saveState(state);
      updateLocks();
      showToast('Module 2 article marked as read.', 'success');
      track('article_read', { module: 'm2' });
    });

    void loadIdExercise();
  }

  function loadM3(): void {
    if (m3Loaded) return;
    m3Loaded = true;
    gateVideo($<HTMLVideoElement>('#m3-video'), () => {
      state.m3.video = true;
      saveState(state);
      updateLocks();
      track('video_complete', { module: 'm3' });
    });
    const btn = $<HTMLButtonElement>('#m3-mark-read');
    const mount = $('#md-03');
    void loadMarkdownSmart('content/03-counter-moves.md', mount, btn);
    btn?.addEventListener('click', () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        showToast('Scroll to the end first.', 'error');
        return;
      }
      state.m3.article = true;
      saveState(state);
      updateLocks();
      showToast('Module 3 article marked as read.', 'success');
      track('article_read', { module: 'm3' });
    });

    $<HTMLButtonElement>('#drills-check')?.addEventListener('click', () => {
      const t = ($<HTMLTextAreaElement>('#drills')?.value ?? '').toLowerCase();
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
      const checklist = $('#drill-checklist');
      if (checklist) checklist.textContent = list.join(' · ');
      state.m3.drillsChecked = true;
      saveState(state);
    });
  }

  function loadM4(): void {
    if (m4Loaded) return;
    m4Loaded = true;
    const btn = $<HTMLButtonElement>('#m4-mark-read');
    const mount = $('#md-04');
    void loadMarkdownSmart('content/04-evidence.md', mount, btn);
    btn?.addEventListener('click', () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
        showToast('Scroll to the end first.', 'error');
        return;
      }
      state.m4.article = true;
      saveState(state);
      updateLocks();
      showToast('Module 4 article marked as read.', 'success');
      track('article_read', { module: 'm4' });
    });

    const form = $<HTMLFormElement>('#audit-form');
    const out = $('#audit-output');
    const actions = $('#audit-actions');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const merchant = fdStr(fd, 'merchant');
      const action = fdStr(fd, 'action');
      const date = fdStr(fd, 'date');
      const channel = fdStr(fd, 'channel');
      const saw = fdStr(fd, 'saw');
      const patterns = fd.getAll('patterns').map(String).join(', ');
      const evidence = fd.getAll('evidence').map(String).join(', ') || '—';
      const nextStep = (() => {
        if (action === 'cancel') return 'Send a concise, dated cancellation via required channel; request written confirmation.';
        if (action === 'refund') return 'Quote policy, attach proof, and request refund by a clear deadline.';
        if (action === 'opt-out') return 'Change settings, capture before/after, and verify by email.';
        if (action === 'delete account') return 'Submit deletion request and archive confirmation.';
        return 'Document and set a follow-up date.';
      })();
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
      if (out) {
        out.textContent = lines.join('\n');
        out.hidden = false;
      }
      if (actions) actions.hidden = false;

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
      try {
        const arr = JSON.parse(localStorage.getItem(AUDITS_KEY) || '[]') as unknown[];
        arr.push(entry);
        localStorage.setItem(AUDITS_KEY, JSON.stringify(arr));
      } catch {
        // localStorage may be unavailable; ignore.
      }
      state.m4.auditSubmitted = true;
      state.m4.auditId = entry.id;
      saveState(state);
      updateLocks();
      track('audit_submitted', { id: entry.id, merchant, action });
      showToast('Risk Audit generated.', 'success');
    });
    $('#copy-audit')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(out?.textContent ?? '');
        showToast('Copied to clipboard.', 'success');
      } catch {
        showToast('Copy failed.', 'error');
      }
    });
    $('#print-audit')?.addEventListener('click', () => window.print());
  }

  async function loadPOST(): Promise<void> {
    if (postLoaded) return;
    postLoaded = true;
    const root = $('#post-quiz-root');
    const btn = $<HTMLButtonElement>('#post-submit');
    const result = $('#post-result');
    const retake = $<HTMLButtonElement>('#post-retake');
    if (!root || !btn || !result) return;

    // Function expression (not a hoisted `function` declaration) so TS's
    // null-narrowing of `root`/`result` above carries into this closure.
    const resetPostQuiz = (items: GradableItem[]): void => {
      state.postQuiz = { completed: false, score: 0, pass: false, answers: [], correctness: [] };
      saveState(state);
      result.textContent = '';
      if (retake) retake.hidden = true;
      renderQuiz(root, items, onAny, { savedChoices: [], correctness: [] });
      setBtnState(btn, false);
      showToast('You can retake the assessment now.', 'info');
    };

    let onAny: () => void = () => {};

    try {
      const raw = await fetchJson('data/quiz.json');
      const items = parseQuiz(raw).map(toGradable);

      const onChoice = (idx: number, value: number): void => {
        state.postQuiz.answers[idx] = value;
        saveState(state);
      };
      onAny = () => setBtnState(btn, items.every((q) => q.choice !== null));

      renderQuiz(root, items, onAny, {
        savedChoices: state.postQuiz.answers,
        correctness: state.postQuiz.correctness,
        onChoice,
      });
      onAny();

      if (state.postQuiz.completed && !state.postQuiz.pass && retake) {
        retake.hidden = false;
        retake.onclick = () => resetPostQuiz(items);
      }

      btn.addEventListener('click', () => {
        if (btn.disabled) return;

        const { correct, total, pct } = gradeQuiz(root, items);
        const pass = pct >= 80;

        state.postQuiz = {
          completed: true,
          score: pct,
          pass,
          answers: items.map((q) => q.choice),
          correctness: items.map((q) => q.choice !== null && q.choice === q.answerIndex),
        };
        saveState(state);
        track('post_quiz_submit', { score: pct, pass });

        result.textContent = `Score: ${correct}/${total} (${pct}%). ${pass ? 'Pass ✅' : 'Below 80% — review and try again.'}`;

        if (pass) {
          showToast('Assessment passed. Certificate unlocked.', 'success');
          updateLocks();
          $('#certificate')?.scrollIntoView({ behavior: 'smooth' });
          if (retake) retake.hidden = true;
        } else {
          showToast('Score below 80%. You can retake the assessment.', 'error');
          if (retake) {
            retake.hidden = false;
            retake.onclick = () => resetPostQuiz(items);
          }
        }
      });
    } catch {
      root.innerHTML = `<div class="subtle">Couldn't load <code>quiz.json</code>. If this page is opened via <code>file://</code>, some browsers block local fetch. Run a small local server (e.g., <code>python -m http.server</code>), or host the files.</div>`;
      setBtnState(btn, false);
    }
  }

  /* ---- Linear path (one unlocked at a time) ---- */
  const LINEAR_STEPS: Step[] = [
    { key: 'pre', label: 'Pre-quiz', section: '#pre-quiz', loader: () => {}, done: () => state.preQuiz.completed },
    { key: 'm1_video', label: 'Module 1 — Video', section: '#module-1', loader: () => loadM1(), done: () => state.m1.video },
    { key: 'm1_article', label: 'Module 1 — Article', section: '#module-1', loader: () => loadM1(), done: () => state.m1.article },
    { key: 'm2_video', label: 'Module 2 — Video', section: '#module-2', loader: () => loadM2(), done: () => state.m2.video },
    { key: 'm2_article', label: 'Module 2 — Article', section: '#module-2', loader: () => loadM2(), done: () => state.m2.article },
    { key: 'm2_id', label: 'Module 2 — ID exercise', section: '#module-2', loader: () => loadM2(), done: () => state.m2.idExercise },
    { key: 'm3_video', label: 'Module 3 — Video', section: '#module-3', loader: () => loadM3(), done: () => state.m3.video },
    { key: 'm3_article', label: 'Module 3 — Article', section: '#module-3', loader: () => loadM3(), done: () => state.m3.article },
    { key: 'm4_article', label: 'Module 4 — Article', section: '#module-4', loader: () => loadM4(), done: () => state.m4.article },
    { key: 'audit', label: 'Module 4 — Risk Audit', section: '#module-4', loader: () => loadM4(), done: () => state.m4.auditSubmitted },
    { key: 'post', label: 'Post-quiz', section: '#post-quiz', loader: () => void loadPOST(), done: () => state.postQuiz.pass },
    { key: 'cert', label: 'Certificate', section: '#certificate', loader: () => {}, done: () => state.certificate.issued },
  ];

  function sectionIsComplete(selector: string): boolean {
    switch (selector) {
      case '#pre-quiz':
        return state.preQuiz.completed;
      case '#module-1':
        return state.m1.video && state.m1.article;
      case '#module-2':
        return state.m2.video && state.m2.article && state.m2.idExercise;
      case '#module-3':
        return state.m3.video && state.m3.article;
      case '#module-4':
        return state.m4.article && state.m4.auditSubmitted;
      case '#post-quiz':
        return state.postQuiz.pass;
      case '#certificate':
        return state.certificate.issued || state.postQuiz.pass;
      default:
        return false;
    }
  }

  function firstIncompleteIndex(): number {
    const idx = LINEAR_STEPS.findIndex((s) => !s.done());
    return idx === -1 ? LINEAR_STEPS.length - 1 : idx;
  }

  function renderSidebar(currentIdx: number): void {
    const list = $('#progress-list');
    const fill = $('#ps-fill');
    if (!list || !fill) return;
    const total = LINEAR_STEPS.length;
    const doneCount = LINEAR_STEPS.filter((s) => s.done()).length;
    fill.style.width = `${Math.round((doneCount / total) * 100)}%`;
    list.innerHTML = '';
    LINEAR_STEPS.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = [i < currentIdx ? 'ps-item--done' : '', i === currentIdx ? 'ps-item--current' : '', i > currentIdx ? 'ps-item--locked' : '']
        .join(' ')
        .trim();
      li.innerHTML = `<span class="ps-dot" aria-hidden="true"></span><a href="${s.section}">${s.label}</a>`;
      list.appendChild(li);
    });
  }

  function updateLocks(): void {
    const idx = firstIncompleteIndex();
    const current = LINEAR_STEPS[idx]!;

    current.loader();

    // Also load assets for any sections already completed, so their
    // articles/videos are present after a refresh.
    LINEAR_STEPS.forEach((s) => {
      if (sectionIsComplete(s.section)) s.loader();
    });

    const msg = `Finish “${current.label}” first`;

    const currentEl = document.querySelector<HTMLElement>(current.section);
    if (currentEl) {
      lockSection(currentEl, false);
      currentEl.classList.remove('peekable');
    }

    LINEAR_STEPS.forEach((s) => {
      const el = document.querySelector<HTMLElement>(s.section);
      if (!el) return;
      if (el === currentEl) return;

      if (sectionIsComplete(s.section)) {
        lockSection(el, false);
        el.classList.remove('peekable');
        return;
      }

      if (s.key === 'pre' && state.preQuiz.completed) {
        lockSection(el, false);
        el.classList.add('peekable');
        disableAll(el, 'input, button, select, textarea');
        return;
      }

      lockSection(el, true, msg);
      el.classList.remove('peekable');
    });

    setStepStatus(stepEls, 'pre', true, state.preQuiz.completed);
    setStepStatus(stepEls, 'm1', state.preQuiz.completed, state.m1.video && state.m1.article);
    setStepStatus(stepEls, 'm2', state.m1.video && state.m1.article, state.m2.video && state.m2.article && state.m2.idExercise);
    setStepStatus(stepEls, 'm3', state.m2.video && state.m2.article && state.m2.idExercise, state.m3.video && state.m3.article);
    setStepStatus(stepEls, 'm4', state.m3.video && state.m3.article, state.m4.article && state.m4.auditSubmitted);
    setStepStatus(stepEls, 'post', state.m4.article && state.m4.auditSubmitted, state.postQuiz.pass);
    setStepStatus(stepEls, 'cert', state.postQuiz.pass, state.certificate.issued);

    bumpCourseProgress(state);
    renderSidebar(idx);
  }

  /* ---- Certificate ---- */
  const certSheet = $('#certificate-sheet');

  function prepareCertificate(): void {
    if (!certSheet) return;
    const nm = localStorage.getItem(NAME_KEY) || 'Learner';
    const score = `${state.postQuiz.score}%`;
    const id = state.certificate.id || `FF-DP-${Date.now()}`;
    const date = state.certificate.date || new Date().toISOString().slice(0, 10);
    const setCertText = (sel: string, value: string): void => {
      const el = certSheet.querySelector<HTMLElement>(sel);
      if (el) el.textContent = value;
    };
    setCertText('#cert-name', nm);
    setCertText('#cert-score', score);
    setCertText('#cert-date', `Date: ${date}`);
    setCertText('#cert-id', id);
    state.certificate = { issued: true, id, date };
    saveState(state);
  }

  $<HTMLButtonElement>('#download-cert')?.addEventListener('click', () => {
    prepareCertificate();
    window.print();
    track('certificate_print');
  });

  $<HTMLButtonElement>('#download-badge')?.addEventListener('click', () => {
    const badge = document.querySelector('#certificate .badge-svg');
    if (!badge) {
      showToast('Badge artwork not found.', 'error');
      return;
    }
    const svg = badge.outerHTML;
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
  });

  /* ---- Boot ---- */
  initPreQuiz();
  updateLocks();
}
