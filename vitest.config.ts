import { defineConfig } from 'vitest/config';

// Most of what's under test here is pure logic (shuffle, article-summary,
// the copied practice/flashcard/course-state/md-to-html algorithms) and runs
// fine under plain Node. Only storage.test.ts and course-state.test.ts
// actually touch `localStorage` / `document.cookie`, so they're split into
// their own jsdom project instead of paying for jsdom on every test file.
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/islands/**'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['tests/unit/storage.test.ts', 'tests/unit/course-state.test.ts'],
        },
      },
      {
        test: {
          name: 'unit-dom',
          environment: 'jsdom',
          include: ['tests/unit/storage.test.ts', 'tests/unit/course-state.test.ts'],
        },
      },
    ],
  },
});
