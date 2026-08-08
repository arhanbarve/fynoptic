// Port of the theme toggle IIFE from js/app.js. Dark-first default,
// persisted via storage.ts, and sets data-theme on both <html> and <body>.

import { createStore } from './store';
import { getTheme, setTheme, type Theme } from './storage';

export type { Theme };

// Phase 4: a store layered on top of the existing imperative init below, so
// a future React consumer (Phase 5) can read the live theme via
// useSyncExternalStore. initTheme() below is unchanged apart from also
// writing through this store; it remains the sole thing that runs today.
export const themeStore = createStore<Theme>(getTheme());

export function initTheme(): void {
  const btn = document.getElementById('theme-btn');
  const roots = [document.documentElement, document.body];

  const applyTheme = (mode: Theme): void => {
    roots.forEach((r) => r.setAttribute('data-theme', mode));
    if (btn) {
      btn.textContent = mode === 'light' ? 'Dark' : 'Light';
      btn.setAttribute('aria-pressed', String(mode === 'light'));
      btn.title = `Toggle to ${mode === 'light' ? 'dark' : 'light'} mode`;
    }
    themeStore.set(mode);
  };

  applyTheme(getTheme());

  btn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next: Theme = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  });
}
