import { useSyncExternalStore } from 'react';
import { themeStore } from '../lib/theme';
import type { Theme } from '../lib/storage';

// Server snapshot matches the site's dark-first default (storage.getTheme()'s
// fallback and the pre-paint script in Base.astro) and never touches
// window/document/localStorage.
const SERVER_SNAPSHOT: Theme = 'dark';

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, () => SERVER_SNAPSHOT);
}
