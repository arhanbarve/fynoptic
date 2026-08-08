import { useSyncExternalStore } from 'react';
import { prefsStore, type A11yPrefs } from '../lib/a11y';

// Both prefs default off server-side; applyA11y() only ever flips them on
// from localStorage after hydration.
const SERVER_SNAPSHOT: A11yPrefs = { highContrast: false, dyslexia: false };

export function usePrefs(): A11yPrefs {
  return useSyncExternalStore(prefsStore.subscribe, prefsStore.get, () => SERVER_SNAPSHOT);
}
