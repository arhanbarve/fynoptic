import { test, expect, type Page } from '@playwright/test';

// Characterization of islands/flashcard.ts against the current vanilla
// wizard markup in flashcard.astro, before any React conversion.

const STORAGE_KEY = 'fynoptic.flashcards.v1';

async function goto(page: Page): Promise<void> {
  await page.goto('/flashcard');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

async function selectFirstUnitAndStart(page: Page, mode: 'mc' | 'fitb' = 'mc'): Promise<void> {
  await goto(page);
  await page.locator('#unit-list .unit-chip').first().click();
  await page.locator('#confirm-units').click();
  if (mode === 'fitb') {
    await page.locator('label.mode-chip', { hasText: 'Fill in the Blank' }).click();
  }
  await page.locator('#confirm-mode').click();
  await page.locator('#start-btn-big').click();
  await expect(page.locator('#fc-stage')).toBeVisible();
}

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

test('the answer-target toggle is independent per mode', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  const toggle = page.locator('#mc-toggle-answer');
  const mcLabelBefore = await toggle.textContent();
  await toggle.click();
  const mcLabelAfter = await toggle.textContent();
  expect(mcLabelAfter).not.toBe(mcLabelBefore);

  // Switching modes requires ending the session first (mode radios disable
  // while active) — restart fresh in fitb mode and confirm its toggle
  // starts at the default independent of the mc toggle flipped above.
  await page.locator('#end-btn').click();
  await page.locator('[data-modal-close]').first().dispatchEvent('click');
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

test('reset-progress clears the storage key after confirming the native dialog', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  await page.locator('.mc-option').first().click();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeTruthy();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#reset-progress').click();

  await expect(page.locator('.toast-container .toast')).toHaveText('Progress reset.');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('ending a session opens the summary modal with the selected units listed', async ({ page }) => {
  await selectFirstUnitAndStart(page, 'mc');
  const unitLabel = await page.locator('#unit-list .unit-chip.is-active').first().textContent();

  await page.locator('.mc-option').first().click(); // grade one card
  await page.locator('#end-btn').click();

  const modal = page.locator('#summary-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#summary-grid')).toContainText('Completed');
  await expect(page.locator('#summary-units')).toContainText(unitLabel ?? '');

  await page.locator('#summary-modal [data-modal-close]').dispatchEvent('click');
  await expect(modal).toBeHidden();
  await expect(page.locator('#block-units')).toBeVisible();
});
