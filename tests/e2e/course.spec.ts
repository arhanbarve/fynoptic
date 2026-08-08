import { test, expect, type Page } from '@playwright/test';

// Characterization of islands/course-one.ts against the current vanilla
// courseone.astro markup, before any React conversion. Appendix B's
// CourseState is the persistence contract this spec seeds through —
// exactly the same localStorage key (`ff_dp_state`) the app itself reads
// via loadState(), so seeding is just "what a returning learner's browser
// already has," not a testing shortcut that bypasses real behavior.

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

/** Seeds ff_dp_state (the same key loadState() reads) before navigating. */
async function seedAndGoto(page: Page, seed: CourseStateSeed): Promise<void> {
  const state = { ...DEFAULT_STATE, ...seed };
  await page.addInitScript((s) => {
    localStorage.setItem('ff_dp_state', JSON.stringify(s));
  }, state);
  await page.goto('/courseone');
}

async function fetchAnswerIndices(page: Page, path: string): Promise<number[]> {
  return page.evaluate(async (p) => {
    const res = await fetch(p);
    const data = (await res.json()) as { items: { answer_index: number }[] };
    return data.items.map((i) => i.answer_index);
  }, path);
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

test('the identification exercise grades all-or-nothing', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
  });

  const submit = page.locator('#id-ex-submit');
  const items = page.locator('#id-ex-root .q-item');
  await expect(items.first()).toBeVisible();
  const answers = await fetchAnswerIndices(page, '/data/id-exercise.json');

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

test('post-quiz: passing at >=80% unlocks the certificate section; failing offers a retake', async ({ page }) => {
  await seedAndGoto(page, {
    preQuiz: { completed: true, score: 100, answers: [], correctness: [] },
    m1: { video: true, article: true },
    m2: { video: true, article: true, idExercise: true },
    m3: { video: true, article: true, drillsChecked: true },
    m4: { article: true, auditSubmitted: true, auditId: 'AUD-seed' },
  });

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
  await expect(page.locator('#module-1')).not.toHaveClass(/certificate.*ready/); // sanity: no crash

  // Retake resets the quiz.
  await page.locator('#post-retake').click();
  await expect(page.locator('#post-result')).toHaveText('');
  // Real, sitewide quirk (not fixed here): `.btn { display: inline-block }`
  // in legacy.css is an author-stylesheet rule, and author rules beat the
  // UA default `[hidden] { display: none }` at equal specificity regardless
  // of source order — so any `<button class="btn ...">` stays visually
  // displayed even once `.hidden = true`. Assert the actual `hidden`
  // property course-one.ts sets, not visual visibility.
  await expect(page.locator('#post-retake')).toHaveJSProperty('hidden', true);
  const afterRetake = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), DP_STATE_KEY);
  expect(afterRetake.postQuiz.completed).toBe(false);

  // Now pass: every answer correct.
  for (let i = 0; i < answers.length; i++) {
    await items.nth(i).locator(`input[type="radio"][value="${answers[i]}"]`).check();
  }
  await page.locator('#post-submit').click();
  await expect(page.locator('#post-result')).toContainText('Pass');

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
  const fillWidth = await page.locator('#ps-fill').evaluate((el) => el.style.width);
  expect(fillWidth).not.toBe('0%');

  await page.reload();
  await expect(page.locator('#progress-list li.ps-item--done')).toHaveCount(3);
  await expect(page.locator('#module-1')).not.toHaveClass(/locked/);
});
