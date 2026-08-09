import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

// Characterization of <CourseOne /> (src/components/course/CourseOne.tsx +
// PreQuiz/Module/IdExercise/RiskAudit/PostQuiz/Certificate/ProgressSidebar),
// the Phase 10f React conversion of the old islands/course-one.ts vanilla
// island (1,407 lines, retired in this same phase). Every behavioral
// assertion from the pre-conversion characterization spec is carried over
// unchanged; only selectors/expectations that track a deliberate structural
// change were updated:
//
//   - Section lock chrome (`.locked` class, `inert`, `aria-hidden`,
//     `.locked-scrim`) is still applied to the exact same section elements
//     by <LockableSection> in CourseOne.tsx — same selectors as before.
//   - The certificate section is no longer always-present-but-CSS-hidden
//     (`.certificate.ready` never actually got toggled by the old code, so
//     it never rendered — O6). It now mounts/unmounts entirely based on
//     `state.postQuiz.pass`: assertions below check for its *presence*,
//     not a class.
//   - `#post-retake` is conditionally rendered (unmounted when not
//     applicable), not merely toggled via the `hidden` DOM property — the
//     old `.btn { display: inline-block }`-beats-`[hidden]` workaround this
//     spec used to need no longer applies because the element isn't in the
//     DOM at all once retake succeeds. `toBeHidden()` covers both "not in
//     DOM" and "hidden".
//   - `#id-ex-root`/`#id-ex-submit`/`#id-ex-result` and
//     `#audit-form`/`#audit-generate`/`#audit-output`/`#audit-actions`/
//     `#copy-audit` are real ids again (IdExercise.tsx/RiskAudit.tsx) —
//     same ids the vanilla markup used.
//
// New in this phase (O6, the "Gate additions" in the Phase 10f plan item):
// the certificate reveal is gated on a real ≥80% pass, prints the
// profile-set learner name (`ff_user_name`, written by the profile settings
// panel — Phase 10c), and the badge PNG export now includes `xmlns` on both
// `<svg>`s so the exported image actually decodes to filled gradient
// pixels instead of a blank/broken image (verified below by decoding the
// downloaded PNG's real pixel data, not just checking the file is
// non-empty).

const DP_STATE_KEY = 'ff_dp_state';

interface CourseStateSeed {
  preQuiz?: { completed: boolean; score: number; answers: unknown[]; correctness: unknown[] };
  m1?: { video: boolean; article: boolean };
  m2?: { video: boolean; article: boolean; idExercise: boolean };
  m3?: { video: boolean; article: boolean; drillsChecked: boolean };
  m4?: { article: boolean; auditSubmitted: boolean; auditId: string | null };
  postQuiz?: { completed: boolean; score: number; pass: boolean; answers: unknown[]; correctness: unknown[] };
  certificate?: { issued: boolean; id: string | null; date: string | null };
}

const DEFAULT_STATE: Required<CourseStateSeed> = {
  preQuiz: { completed: false, score: 0, answers: [], correctness: [] },
  m1: { video: false, article: false },
  m2: { video: false, article: false, idExercise: false },
  m3: { video: false, article: false, drillsChecked: false },
  m4: { article: false, auditSubmitted: false, auditId: null },
  postQuiz: { completed: false, score: 0, pass: false, answers: [], correctness: [] },
  certificate: { issued: false, id: null, date: null },
};

/** Seeds ff_dp_state (the same key useCourseState's loadCourseState() reads) and, optionally, ff_user_name, before navigating. */
async function seedAndGoto(page: Page, seed: CourseStateSeed, userName?: string): Promise<void> {
  const state = { ...DEFAULT_STATE, ...seed };
  await page.addInitScript(
    ({ s, name }) => {
      localStorage.setItem('ff_dp_state', JSON.stringify(s));
      if (name) localStorage.setItem('ff_user_name', name);
    },
    { s: state, name: userName },
  );
  await page.goto('/courseone');
}

async function fetchAnswerIndices(page: Page, path: string): Promise<number[]> {
  return page.evaluate(async (p) => {
    const res = await fetch(p);
    const data = (await res.json()) as { items: { answer_index: number }[] };
    return data.items.map((i) => i.answer_index);
  }, path);
}

/** Seeds every module as complete, fetches the real post-quiz answer key, and submits a passing run. Leaves the page on a revealed certificate. */
async function reachPassedCertificate(page: Page, userName?: string): Promise<number[]> {
  await seedAndGoto(
    page,
    {
      preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
      m1: { video: true, article: true },
      m2: { video: true, article: true, idExercise: true },
      m3: { video: true, article: true, drillsChecked: true },
      m4: { article: true, auditSubmitted: true, auditId: 'AUD-seed' },
    },
    userName,
  );

  const answers = await fetchAnswerIndices(page, '/data/quiz.json');
  const items = page.locator('#post-quiz-root .q-item');
  await expect(items).toHaveCount(answers.length);
  for (let i = 0; i < answers.length; i++) {
    await items.nth(i).locator(`input[type="radio"][value="${answers[i]}"]`).check();
  }
  await page.locator('#post-submit').click();
  await expect(page.locator('#certificate')).toBeVisible();
  return answers;
}

test('pre-quiz gates module 1 until completed', async ({ page }) => {
  await seedAndGoto(page, {});
  await expect(page.locator('#module-1')).toHaveAttribute('inert', '');
  await expect(page.locator('#module-1')).toHaveClass(/locked/);

  const items = page.locator('#pre-quiz-root .q-item');
  await expect(items).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    await items.nth(i).locator('input[type="radio"]').first().check();
  }
  await expect(page.locator('#pre-submit')).toBeEnabled();
  await page.locator('#pre-submit').click();

  await expect(page.locator('#module-1')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#module-1')).not.toHaveClass(/locked/);
});

test('mark-read unlocks after scrolling the article to its end', async ({ page }) => {
  await seedAndGoto(page, { preQuiz: { completed: true, score: 100, answers: [], correctness: [] } });

  const btn = page.locator('#m1-mark-read');
  await expect(page.locator('#md-01')).not.toBeEmpty();
  await expect(btn).toBeDisabled();

  await page.locator('#md-01 > :last-child').scrollIntoViewIfNeeded();
  await expect(btn).toBeEnabled({ timeout: 5000 });

  await btn.click();
  await expect(page.locator('.toast-container .toast')).toHaveText('Module 1 article marked as read.');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(stored.m1.article).toBe(true);
});

test('video anti-skip: seeking forward snaps back, and playbackRate is forced to 1', async ({ page }) => {
  await seedAndGoto(page, { preQuiz: { completed: true, score: 100, answers: [], correctness: [] } });

  const video = page.locator('#m1-video');
  await page.evaluate(() => {
    const v = document.querySelector('video#m1-video') as HTMLVideoElement;
    v.play().catch(() => {});
  });
  // Let a little real playback accumulate so maxTime advances past 0.
  await page.waitForTimeout(600);

  const beforeJump = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(beforeJump).toBeGreaterThan(0);

  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.currentTime + 30; // seek far ahead of maxTime
  });
  await page.waitForTimeout(200);
  const afterJump = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  // Snapped back close to where it was, not allowed to jump 30s ahead.
  expect(afterJump).toBeLessThan(beforeJump + 2);

  await video.evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 2;
  });
  await page.waitForTimeout(100);
  expect(await video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1);
});

test('the identification exercise loads 10 items and grades all-or-nothing', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
  });

  const submit = page.locator('#id-ex-submit');
  const items = page.locator('#id-ex-root .q-item');
  await expect(items).toHaveCount(10);
  const answers = await fetchAnswerIndices(page, '/data/id-exercise.json');
  expect(answers).toHaveLength(10);

  // Answer every item wrong first (pick an index that is never the answer).
  for (let i = 0; i < answers.length; i++) {
    const wrongIndex = answers[i] === 0 ? 1 : 0;
    await items.nth(i).locator(`input[type="radio"][value="${wrongIndex}"]`).check();
  }
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#id-ex-result')).toHaveText(/incorrect/);
  await expect(items.first()).toHaveClass(/incorrect/);

  // Correct every item -> all-or-nothing success.
  for (let i = 0; i < answers.length; i++) {
    await items.nth(i).locator(`input[type="radio"][value="${answers[i]}"]`).check();
  }
  await submit.click();
  await expect(page.locator('#id-ex-result')).toHaveText(`All ${answers.length}/${answers.length} correct.`);

  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(stored.m2.idExercise).toBe(true);
});

test('the risk audit form generates a summary and stores it locally', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
    m2: { video: true, article: true, idExercise: true },
    m3: { video: true, article: true, drillsChecked: true },
  });

  await page.locator('input[name="merchant"]').fill('Example Corp');
  await page.selectOption('select[name="action"]', 'cancel');
  await page.locator('input[name="date"]').fill('2026-01-01T12:00');
  await page.selectOption('select[name="channel"]', 'email');
  await page.locator('textarea[name="saw"]').fill('A pre-checked add-on at checkout.');
  await page.locator('select[name="patterns"]').selectOption(['Sneaking']);
  await page.locator('input[name="evidence"][value="totals"]').check();

  await page.locator('#audit-generate').click();

  await expect(page.locator('#audit-output')).toBeVisible();
  await expect(page.locator('#audit-output')).toContainText('Merchant/platform: Example Corp');
  await expect(page.locator('#audit-output')).toContainText('Action attempted: cancel');
  await expect(page.locator('#audit-actions')).toBeVisible();

  const audits = await page.evaluate(() => JSON.parse(localStorage.getItem('ff_risk_audits') ?? '[]'));
  expect(audits).toHaveLength(1);
  expect(audits[0].merchant).toBe('Example Corp');

  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(stored.m4.auditSubmitted).toBe(true);
});

test('post-quiz: failing keeps the certificate hidden and offers a retake; passing at >=80% reveals it', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
    m2: { video: true, article: true, idExercise: true },
    m3: { video: true, article: true, drillsChecked: true },
    m4: { article: true, auditSubmitted: true, auditId: 'AUD-seed' },
  });

  await expect(page.locator('#certificate')).toHaveCount(0);

  const answers = await fetchAnswerIndices(page, '/data/quiz.json');
  const items = page.locator('#post-quiz-root .q-item');
  await expect(items).toHaveCount(answers.length);

  // Fail first: get every answer wrong.
  for (let i = 0; i < answers.length; i++) {
    const wrongIndex = answers[i] === 0 ? 1 : 0;
    await items.nth(i).locator(`input[type="radio"][value="${wrongIndex}"]`).check();
  }
  await page.locator('#post-submit').click();
  await expect(page.locator('#post-result')).toContainText('Below 80%');
  await expect(page.locator('#post-retake')).toBeVisible();
  await expect(page.locator('#certificate')).toHaveCount(0);

  // Retake resets the quiz.
  await page.locator('#post-retake').click();
  await expect(page.locator('#post-result')).toHaveText('');
  // #post-retake unmounts entirely once showRetake (completed && !pass) is
  // false again — not merely `hidden`, since PostQuiz.tsx conditionally
  // renders it rather than toggling a `hidden` DOM property.
  await expect(page.locator('#post-retake')).toBeHidden();
  const afterRetake = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(afterRetake.postQuiz.completed).toBe(false);

  // Now pass: every answer correct.
  for (let i = 0; i < answers.length; i++) {
    await items.nth(i).locator(`input[type="radio"][value="${answers[i]}"]`).check();
  }
  await page.locator('#post-submit').click();
  await expect(page.locator('#post-result')).toContainText('Pass');
  await expect(page.locator('#certificate')).toBeVisible();

  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(stored.postQuiz.pass).toBe(true);
});

test('the progress sidebar reflects completed steps, and state survives a reload', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
  });

  await expect(page.locator('#progress-list li')).toHaveCount(12);
  // pre, m1_video, m1_article are all done() -> the first incomplete step
  // (and therefore ps-item--done boundary) is m2_video, index 3.
  await expect(page.locator('#progress-list li.ps-item--done')).toHaveCount(3);
  const fillWidth = await page.locator('#ps-fill').evaluate((el) => (el as HTMLElement).style.width);
  expect(fillWidth).not.toBe('0%');

  await page.reload();
  await expect(page.locator('#progress-list li.ps-item--done')).toHaveCount(3);
  await expect(page.locator('#module-1')).not.toHaveClass(/locked/);
});

test('certificate prints the profile-set learner name', async ({ page }) => {
  await reachPassedCertificate(page, 'Jordan Rivera');

  await page.locator('#download-cert').click();
  await expect(page.locator('#cert-name')).toHaveText('Jordan Rivera');
  await expect(page.locator('#cert-score')).toHaveText('100%');
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(stored.certificate.issued).toBe(true);
});

test('certificate falls back to "Learner" when no profile name is set', async ({ page }) => {
  await reachPassedCertificate(page); // no userName seeded, and not signed in

  await page.locator('#download-cert').click();
  await expect(page.locator('#cert-name')).toHaveText('Learner');
});

test('the badge PNG download is non-empty and decodes to real, non-blank gradient pixels', async ({ page }) => {
  await reachPassedCertificate(page, 'Jordan Rivera');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-badge').click()]);

  expect(download.suggestedFilename()).toBe('FinanceFirst_Badge_Dark-Pattern-Spotter.png');
  const path = await download.path();
  expect(path).not.toBeNull();

  const fs = await import('node:fs/promises');
  const bytes = await fs.readFile(path!);
  expect(bytes.length).toBeGreaterThan(0);

  // Decode the real pixel data (verifies the `xmlns`-on-<svg> fix actually
  // renders the gradient — a broken/unfilled export would decode to either
  // a fully transparent PNG or throw during decode).
  const png = PNG.sync.read(bytes);
  expect(png.width).toBeGreaterThan(0);
  expect(png.height).toBeGreaterThan(0);

  let nonWhiteOpaquePixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
    if (a > 0 && (r < 250 || g < 250 || b < 250)) nonWhiteOpaquePixels++;
  }
  // The badge's gradient (#3F6AFF -> #22D1B2 -> #FFD166) plus the dark
  // checkmark stroke should fill a substantial share of the 512x512 canvas
  // beyond the white background rect — a blank/broken export would leave
  // this at (or near) zero.
  expect(nonWhiteOpaquePixels).toBeGreaterThan(1000);
});
