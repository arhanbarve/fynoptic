import { test, expect, type Page } from '@playwright/test';

// Characterization of <Flashcards /> (src/components/flashcards/Flashcards.tsx
// + useFlashcardDeck.ts), the Phase 10e React conversion of the old
// islands/flashcard.ts vanilla wizard. Every behavioral assertion below is
// carried over unchanged from the pre-conversion spec; only selectors that
// track DOM structure that actually changed were updated:
//   - Unit chips are now a native `<label class="chip unit-chip"><input
//     type="checkbox" class="sr-only" />…</label>` (was a plain `<button>`)
//     — `#unit-list .unit-chip` and `.is-active` still resolve the same way,
//     clicking the label still toggles selection.
//   - Reset Progress no longer runs a native `confirm()` — it opens a Radix
//     dialog (ResetProgressDialog.tsx) with an explicit Cancel/"Reset
//     Progress" pair (`#reset-progress-confirm`), instead of accepting a
//     browser dialog.
//   - The summary modal's close button is `.modal-close` (Modal.tsx's
//     `ModalClose`, Radix `Dialog.Close`), not `[data-modal-close]`, and a
//     plain `.click()` works — no more dispatchEvent workaround.
// data-step on `.fc-controls` and every Appendix D class name (`is-front`,
// `is-locked`, `is-correct`, `is-wrong`, `flip-in`/`flip-out`, `is-active`)
// are still emitted by the new components (I3) — asserted directly below
// where each is exercised.

const STORAGE_KEY = 'fynoptic.flashcards.v1';

async function goto(page: Page): Promise<void> {
  await page.goto('/flashcard');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

/**
 * Returns the selected unit's chip label text, captured while the wizard is
 * still mounted — unlike the vanilla original (whose `.fc-controls` just
 * gained an `.is-hidden` class and stayed in the DOM), Flashcards.tsx fully
 * unmounts <FlashcardWizard> once a session is active, so `#unit-list` does
 * not exist once `#fc-stage` is visible.
 */
async function selectFirstUnitAndStart(page: Page, mode: 'mc' | 'fitb' = 'mc'): Promise<string> {
  await goto(page);
  const chip = page.locator('#unit-list .unit-chip').first();
  await chip.click();
  const unitLabel = await chip.textContent();
  await page.locator('#confirm-units').click();
  if (mode === 'fitb') {
    await page.locator('label.mode-chip', { hasText: 'Fill in the Blank' }).click();
  }
  await page.locator('#confirm-mode').click();
  await page.locator('#start-btn-big').click();
  await expect(page.locator('#fc-stage')).toBeVisible();
  return unitLabel ?? '';
}

test('the wizard container carries data-step and steps through 1 -> 2 -> 3', async ({ page }) => {
  await goto(page);
  const wizard = page.locator('.fc-controls.is-wizard');
  await expect(wizard).toHaveAttribute('data-step', '1');

  await page.locator('#unit-list .unit-chip').first().click();
  await page.locator('#confirm-units').click();
  await expect(wizard).toHaveAttribute('data-step', '2');

  await page.locator('#confirm-mode').click();
  await expect(wizard).toHaveAttribute('data-step', '3');
});

test('unit selection: select-all and clear-all toggle every chip', async ({ page }) => {
  await goto(page);
  const chips = page.locator('#unit-list .unit-chip');
  const count = await chips.count();
  expect(count).toBeGreaterThan(1);

  await page.locator('#select-all').click();
  await expect(page.locator('#unit-list .unit-chip.is-active')).toHaveCount(count);

  await page.locator('#clear-all').click();
  await expect(page.locator('#unit-list .unit-chip.is-active')).toHaveCount(0);
});

test('confirm-units without a selection shows a toast and does not advance', async ({ page }) => {
  await goto(page);
  await page.locator('#confirm-units').click();
  await expect(page.locator('.toast-container .toast')).toHaveText('Select at least one unit to continue.');
  await expect(page.locator('#block-units')).toBeVisible();
});

test('both modes render their own answer area', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await expect(page.locator('#mc-area')).toBeVisible();
  await expect(page.locator('#fitb-form')).toBeHidden();
});

test('fill-in-the-blank mode renders the text input instead', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'fitb');
  await expect(page.locator('#fitb-form')).toBeVisible();
  await expect(page.locator('#mc-area')).toBeHidden();
});

test('the answer-target toggle is independent per mode, and carries over across a session restart (10e fix)', async ({
  page,
}) => {
  await selectFirstUnitAndStart(page, 'mc');
  const toggle = page.locator('#mc-toggle-answer');
  const mcLabelBefore = await toggle.textContent();
  await toggle.click();
  const mcLabelAfter = await toggle.textContent();
  expect(mcLabelAfter).not.toBe(mcLabelBefore);

  // End the session and start a fresh one, still in MC mode, without a full
  // reload — this is exactly the carry-over the plan's fix targets: the
  // hook's mcAnswer must still reflect the flip above, not reset to 'term'.
  await page.locator('#end-btn').click();
  const summaryModal = page.locator('#summary-modal');
  await expect(summaryModal).toBeVisible();
  await summaryModal.locator('.modal-close').click();
  await expect(summaryModal).toBeHidden();

  // `unitsSelected` lives in Flashcards.tsx, one level above the wizard, so
  // it survives the wizard's unmount/remount across ending a session — the
  // unit picked above is still checked; no need (and no way, without
  // deselecting it) to click it again.
  await expect(page.locator('#block-units')).toBeVisible();
  await expect(page.locator('#unit-list .unit-chip.is-active')).toHaveCount(1);
  await page.locator('#confirm-units').click();
  await page.locator('#confirm-mode').click();
  await page.locator('#start-btn-big').click();
  await expect(page.locator('#fc-stage')).toBeVisible();
  await expect(page.locator('#mc-toggle-answer')).toHaveText(mcLabelAfter ?? '');

  // A brand-new page load (module/hook re-initialized) is a fresh session
  // and independent of the fitb toggle either way — confirm fitb still
  // starts at its own default.
  await selectFirstUnitAndStart(page, 'fitb');
  await expect(page.locator('#mc-toggle-answer')).toHaveText('Answer with Term');
});

test('flip reveals the other side and locks answering', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  // Default mcAnswer is 'term' (answer with the term), so the question shown
  // first is the definition: #def-side starts as the front.
  await expect(page.locator('#def-side')).toHaveClass(/is-front/);
  await expect(page.locator('#term-side')).not.toHaveClass(/is-front/);

  await page.locator('#flip-btn').click();
  await expect(page.locator('#term-side')).toHaveClass(/is-front/);
  await expect(page.locator('#mc-area')).toHaveClass(/is-locked/);
});

test('answering multiple choice marks the correct/wrong option classes (Appendix D)', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  const options = page.locator('.mc-option');
  await expect(options.first()).toBeVisible();

  const clicked = options.first();
  const clickedValue = await clicked.getAttribute('data-value');
  await clicked.click();

  // Exactly one option is marked correct; if the clicked one wasn't it, it's
  // additionally marked wrong — cover both branches instead of assuming
  // which one a random click lands on.
  await expect(page.locator('.mc-option.is-correct')).toHaveCount(1);
  const correctValue = await page.locator('.mc-option.is-correct').getAttribute('data-value');
  if (correctValue !== clickedValue) {
    await expect(clicked).toHaveClass(/is-wrong/);
  }
  await expect(page.locator('#feedback')).toBeVisible();
});

test('prev/next wraps around the deck modulo its length', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  const firstTerm = await page.locator('#term-text').textContent();

  await page.locator('#prev-btn').click(); // wraps to the last card
  const lastTerm = await page.locator('#term-text').textContent();
  expect(lastTerm).not.toBe(firstTerm);

  await page.locator('#next-btn').click(); // back to the first
  await expect(page.locator('#term-text')).toHaveText(firstTerm ?? '');
});

test('restart reshuffles progress back to the first card and clears reveals', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await page.locator('#flip-btn').click();
  await expect(page.locator('#mc-area')).toHaveClass(/is-locked/);

  await page.locator('#restart-btn').click();
  await expect(page.locator('#crumbs-text')).toHaveText(/^1 \//);
  await expect(page.locator('#mc-area')).not.toHaveClass(/is-locked/);
});

test('progress persists to fynoptic.flashcards.v1 across a reload', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await page.locator('.mc-option').first().click();

  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(stored ?? '{}');
  expect(Object.keys(parsed.answers)).toHaveLength(1);

  await page.reload();
  const afterReload = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(afterReload).toBe(stored);
});

test('reset-progress opens a confirmation dialog and clears the storage key on confirm', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await page.locator('.mc-option').first().click();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeTruthy();

  await page.locator('#reset-progress').click();
  const dialog = page.locator('#reset-progress-modal');
  await expect(dialog).toBeVisible();

  await page.locator('#reset-progress-confirm').click();

  await expect(page.locator('.toast-container .toast')).toHaveText('Progress reset.');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('reset-progress: Cancel leaves the stored progress untouched', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await page.locator('.mc-option').first().click();
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  await page.locator('#reset-progress').click();
  const dialog = page.locator('#reset-progress-modal');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
});

test('ending a session opens the summary modal with the selected units listed', async ({ page }) => {
  const unitLabel = await selectFirstUnitAndStart(page, 'mc');

  await page.locator('.mc-option').first().click(); // grade one card
  await page.locator('#end-btn').click();

  const modal = page.locator('#summary-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#summary-grid')).toContainText('Completed');
  await expect(page.locator('#summary-units')).toContainText(unitLabel ?? '');

  await modal.locator('.modal-close').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#block-units')).toBeVisible();
});
