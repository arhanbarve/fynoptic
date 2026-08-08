import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Reduced-motion characterization lives in its own project (below) so
      // it gets a real browser-level `prefers-reduced-motion: reduce`
      // context instead of each spec emulating it per-test.
      testIgnore: ['**/a11y-reduced-motion.spec.ts'],
    },
    {
      name: 'chromium-reduced-motion',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
      testMatch: ['**/a11y-reduced-motion.spec.ts'],
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
