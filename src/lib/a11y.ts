// Site-wide a11y preferences (high contrast, dyslexia-friendly font).
//
// This promotes wiring that used to live in course-one.ts bound to
// #toggle-hc/#toggle-dys — elements that exist nowhere in the markup, so it
// never fired. There is still no UI control for these prefs; Phase 5's
// Nav/Footer rebuild adds real toggle buttons. This module only applies
// whatever is already in localStorage to `<body>`.

import { getA11yHighContrast, getA11yDyslexia } from './storage';

export function applyA11y(): void {
  document.body.classList.toggle('hc', getA11yHighContrast());
  document.body.classList.toggle('dyslexia', getA11yDyslexia());
}
