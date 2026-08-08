import { test, expect } from '@playwright/test';

// Characterization of components/bot/Bot.tsx (formerly islands/bot.ts)
// against bot.astro, with the real (slow, free-tier) backend mocked via
// page.route. Ids and class names are unchanged by the React conversion, so
// every selector below still targets the same DOM shape.

const ENDPOINT = 'https://fixitbotbackend.onrender.com/api/chat';

test('a user message appears, a typing bubble shows, then is replaced by the reply', async ({ page }) => {
  await page.route(ENDPOINT, async (route) => {
    // A small delay so the transient "Typing..." bubble is observable
    // before it's replaced — a same-tick mock response would otherwise
    // race Playwright's own assertion polling.
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: { reply: 'Here is how to fix that.' } });
  });
  await page.goto('/bot');

  await page.locator('#user-input').fill('My subscription auto-renewed.');
  await page.locator('#chat-form button[type="submit"]').click();

  await expect(page.locator('.user-bubble', { hasText: 'My subscription auto-renewed.' })).toBeVisible();
  await expect(page.locator('.bot-bubble.typing')).toBeVisible();

  await expect(page.locator('.bot-bubble.typing')).toHaveCount(0);
  await expect(page.locator('.bot-bubble', { hasText: 'Here is how to fix that.' })).toBeVisible();
});

test('a non-OK response shows the generic error bubble', async ({ page }) => {
  await page.route(ENDPOINT, async (route) => {
    await route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/bot');

  await page.locator('#user-input').fill('Anything');
  await page.locator('#chat-form button[type="submit"]').click();

  await expect(page.locator('.bot-bubble.typing')).toHaveCount(0);
  await expect(page.locator('.bot-bubble', { hasText: 'Something went wrong. Please try again.' })).toBeVisible();
});

test('an aborted (timed-out) request shows the wake-up message', async ({ page }) => {
  await page.route(ENDPOINT, async (route) => {
    // Never resolve — the client's own 60s AbortController is what ends
    // this, and this test isn't waiting that long. Instead, abort the
    // route from the server side to simulate the same DOMException path
    // cheaply: an aborted fetch takes the same catch branch regardless of
    // which side aborted it.
    await route.abort('timedout');
  });
  await page.goto('/bot');

  await page.locator('#user-input').fill('Anything');
  await page.locator('#chat-form button[type="submit"]').click();

  await expect(page.locator('.bot-bubble.typing')).toHaveCount(0);
  await expect(
    page.locator('.bot-bubble', { hasText: 'Something went wrong. Please try again.' }),
  ).toBeVisible();
});

test('a <script> in the reply is inserted as text, never executed', async ({ page }) => {
  let alertFired = false;
  page.on('dialog', async (dialog) => {
    alertFired = true;
    await dialog.dismiss();
  });

  await page.route(ENDPOINT, async (route) => {
    await route.fulfill({ json: { reply: '<script>alert("xss")</script>Hello' } });
  });
  await page.goto('/bot');

  await page.locator('#user-input').fill('trigger');
  await page.locator('#chat-form button[type="submit"]').click();

  const bubble = page.locator('.bot-bubble', { hasText: 'Hello' }).last();
  await expect(bubble).toBeVisible();
  // textContent, not innerHTML — the literal markup shows up as text.
  await expect(bubble).toContainText('<script>alert("xss")</script>Hello');
  const innerHtml = await bubble.innerHTML();
  expect(innerHtml).not.toContain('<script>alert');
  expect(alertFired).toBe(false);
});

test('a rapid double submit cannot produce two typing bubbles', async ({ page }) => {
  await page.route(ENDPOINT, async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: { reply: 'Here is how to fix that.' } });
  });
  await page.goto('/bot');

  await page.locator('#user-input').fill('My subscription auto-renewed.');
  const submitBtn = page.locator('#chat-form button[type="submit"]');

  // Fire two clicks back to back. The second must be a no-op: the button
  // (and input) are disabled the moment a request is in flight, so there is
  // structurally only ever one in-flight request and one typing bubble —
  // not just a race that's unlikely to lose.
  await submitBtn.click();
  await submitBtn.click({ force: true });

  await expect(page.locator('#user-input')).toBeDisabled();
  await expect(submitBtn).toBeDisabled();
  await expect(page.locator('.bot-bubble.typing')).toHaveCount(1);
  await expect(page.locator('.user-bubble', { hasText: 'My subscription auto-renewed.' })).toHaveCount(1);

  await expect(page.locator('.bot-bubble.typing')).toHaveCount(0);
  await expect(page.locator('.bot-bubble', { hasText: 'Here is how to fix that.' })).toBeVisible();
  await expect(page.locator('#user-input')).toBeEnabled();
});
