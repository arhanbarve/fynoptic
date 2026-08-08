import { test, expect, type Page } from '@playwright/test';

// Characterization of islands/practice.ts against the current vanilla
// wizard markup in practice.astro, before any React conversion.

async function goToStep2(page: Page, questionCount?: string): Promise<void> {
  await page.goto('/practice');
  await page.waitForFunction(() => document.querySelectorAll('#topics-list .topic-btn').length > 0);
  if (questionCount) await page.selectOption('#question-count', questionCount);
  await page.locator('#wiz-next-1').click();
}

async function selectAllUnitsAndStart(page: Page, questionCount = '10'): Promise<void> {
  await goToStep2(page, questionCount);
  await page.locator('#topics-select-all').click();
  await page.locator('#wiz-next-2').click();
  await page.locator('#start-btn').click();
  await expect(page.locator('#stage-qwrap')).toBeVisible();
}

test('wizard steps forward and back through 1 -> 2 -> 3', async ({ page }) => {
  await page.goto('/practice');
  const wizard = page.locator('#practice-wizard');
  await expect(wizard).toHaveAttribute('data-step', '1');

  await page.waitForFunction(() => document.querySelectorAll('#topics-list .topic-btn').length > 0);
  await page.locator('#wiz-next-1').click();
  await expect(wizard).toHaveAttribute('data-step', '2');
  await expect(page.locator('#step-2')).toBeVisible();

  await page.locator('#wiz-back-2').click();
  await expect(wizard).toHaveAttribute('data-step', '1');
  await expect(page.locator('#step-1')).toBeVisible();

  await page.locator('#wiz-next-1').click();
  await page.locator('#topics-select-all').click();
  await page.locator('#wiz-next-2').click();
  await expect(wizard).toHaveAttribute('data-step', '3');
  await expect(page.locator('#wiz-summary')).not.toBeEmpty();

  await page.locator('#wiz-back-3').click();
  await expect(wizard).toHaveAttribute('data-step', '2');
});

test('advancing from step 2 with no units selected shows a toast and does not advance', async ({ page }) => {
  await goToStep2(page);
  await page.locator('#wiz-next-2').click();
  await expect(page.locator('.toast-container .toast')).toHaveText('Please select at least one unit.');
  await expect(page.locator('#practice-wizard')).toHaveAttribute('data-step', '2');
});

test('changing category clears the topic selection', async ({ page }) => {
  await goToStep2(page);
  const firstChip = page.locator('#topics-list .topic-btn').first();
  await firstChip.click();
  await expect(firstChip).toHaveClass(/is-selected/);

  await page.locator('#wiz-back-2').click();
  await page.selectOption('#category', { label: 'Personal Finance' });
  await page.locator('#wiz-next-1').click();

  const chips = page.locator('#topics-list .topic-btn.is-selected');
  await expect(chips).toHaveCount(0);
});

test('a session runs: right-click and Alt-click eliminate a choice, Enter submits', async ({ page }) => {
  await selectAllUnitsAndStart(page);

  const options = page.locator('.mc-option');
  await expect(options.first()).toBeVisible();

  // Right-click (contextmenu) toggles elimination without selecting.
  await options.nth(1).click({ button: 'right' });
  await expect(options.nth(1)).toHaveClass(/is-eliminated/);
  await expect(page.locator('#submit-btn')).toBeDisabled();

  // Alt-click also eliminates (does not select).
  await options.nth(2).click({ modifiers: ['Alt'] });
  await expect(options.nth(2)).toHaveClass(/is-eliminated/);
  await expect(page.locator('#submit-btn')).toBeDisabled();

  // A normal click selects and overrides any elimination on that option.
  await options.first().click();
  await expect(options.first()).toHaveClass(/is-selected/);
  await expect(page.locator('#submit-btn')).toBeEnabled();

  // Enter submits while a question is on screen and a choice is selected.
  await page.keyboard.press('Enter');
  await expect(page.locator('#feedback')).toBeVisible();
  await expect(page.locator('#next-btn')).toBeEnabled();
  await expect(page.locator('#submit-btn')).toBeDisabled();
});

test('prev/next navigation restores prior answers and eliminations', async ({ page }) => {
  await selectAllUnitsAndStart(page);

  const q1Prompt = await page.locator('#prompt').textContent();
  await page.locator('.mc-option').nth(3).click({ button: 'right' }); // eliminate one
  await page.locator('.mc-option').first().click(); // select first
  await page.locator('#submit-btn').click();
  await expect(page.locator('#feedback')).toBeVisible();

  await page.locator('#next-btn').click();
  const q2Prompt = await page.locator('#prompt').textContent();
  expect(q2Prompt).not.toBe(q1Prompt);

  await page.locator('#prev-btn').click();
  await expect(page.locator('#prompt')).toHaveText(q1Prompt ?? '');
  await expect(page.locator('.mc-option').first()).toHaveClass(/is-selected/);
  await expect(page.locator('.mc-option').nth(3)).toHaveClass(/is-eliminated/);
  await expect(page.locator('#feedback')).toBeVisible();
});

test('completing the session shows the finish summary', async ({ page }) => {
  await selectAllUnitsAndStart(page, '10');

  for (let i = 0; i < 10; i++) {
    await page.locator('.mc-option').first().click();
    await page.locator('#submit-btn').click();
    if (i < 9) {
      await page.locator('#next-btn').click();
    }
  }
  await page.locator('#next-btn').click();

  await expect(page.locator('#stage-finish')).toBeVisible();
  await expect(page.locator('#finish-summary')).toContainText('out of 10');
});

test('end-session modal: the close (X) button resets the session, Escape only hides the modal', async ({ page }) => {
  await selectAllUnitsAndStart(page);

  await page.locator('#end-session-btn').click();
  const modal = page.locator('#end-session-modal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#end-session-stats')).not.toBeEmpty();

  // Escape (modal.ts's global handler) hides the modal but does NOT run
  // practice.ts's own reset — a documented asymmetry, not a bug being fixed.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('#stage-qwrap')).toBeVisible(); // session still running

  await page.locator('#end-session-btn').click();
  await expect(modal).toBeVisible();
  // Pre-existing, sitewide bug (not fixed here — characterizing current
  // behavior): legacy.css defines `.modal` twice (line 487 z-index:2000,
  // then again at ~1867 for the article-reader lightbox at z-index:50,
  // unscoped). The later rule wins the cascade everywhere, so any modal
  // whose dialog is tall enough to reach the header's screen region (as
  // this one is, with its multi-row stat grid) renders BEHIND the sticky
  // header — genuinely unclickable there for a real pointer, not just a
  // Playwright actionability complaint. Dispatching the click via the DOM
  // directly exercises practice.ts's own handler despite that.
  await page.locator('#end-session-close').dispatchEvent('click');
  await expect(modal).toBeHidden();

  // The X's own handler calls resetPractice(): back to the wizard, session cleared.
  await expect(page.locator('#practice-wizard')).not.toHaveClass(/is-hidden/);
  await expect(page.locator('#practice-wizard')).toHaveAttribute('data-step', '1');
  await expect(page.locator('#reset-btn')).toBeDisabled();
});
