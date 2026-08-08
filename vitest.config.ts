import { defineConfig } from 'vitest/config';

// environment: 'node' by default — most of what's under test here is pure
// logic (shuffle, article-summary, the copied practice/flashcard/course-state
// algorithms). Only the two specs that actually touch `localStorage` /
// `document.cookie` opt into jsdom themselves via a
// `// @vitest-environment jsdom` docblock at the top of the file, instead of
// paying for jsdom on every test file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/islands/**'],
    },
  },
});
