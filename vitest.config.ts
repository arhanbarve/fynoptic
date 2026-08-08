import { defineConfig } from 'vitest/config';

// environment: 'node' by default — most of what's under test here is pure
// logic (shuffle, article-summary, the copied practice/flashcard/course-state
// algorithms). Only the specs that actually touch `localStorage` /
// `document.cookie` need a DOM, so they opt into jsdom individually via
// environmentMatchGlobs instead of paying for jsdom on every test file.
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/unit/storage.test.ts', 'jsdom'],
      ['tests/unit/course-state.test.ts', 'jsdom'],
    ],
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/islands/**'],
    },
  },
});
