// Site-wide a11y preferences (high contrast, dyslexia-friendly font).
//
// This promotes wiring that used to live in course-one.ts bound to
// #toggle-hc/#toggle-dys — elements that exist nowhere in the markup, so it
// never fired. There is still no UI control for these prefs; Phase 5's
// Nav/Footer rebuild adds real toggle buttons. This module only applies
// whatever is already in localStorage to `<body>`.

import { createStore } from './store';
import { getA11yHighContrast, getA11yDyslexia } from './storage';

export interface A11yPrefs {
  highContrast: boolean;
  dyslexia: boolean;
}

// Phase 4: a store layered on top of applyA11y() below, so a future React
// consumer (Phase 5) can read these prefs via useSyncExternalStore.
// applyA11y() is unchanged apart from also writing through this store.
export const prefsStore = createStore<A11yPrefs>({
  highContrast: getA11yHighContrast(),
  dyslexia: getA11yDyslexia(),
});

export function applyA11y(): void {
  const highContrast = getA11yHighContrast();
  const dyslexia = getA11yDyslexia();
  document.body.classList.toggle('hc', highContrast);
  document.body.classList.toggle('dyslexia', dyslexia);
  prefsStore.set({ highContrast, dyslexia });
}
