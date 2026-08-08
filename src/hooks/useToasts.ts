import { useSyncExternalStore } from 'react';
import { toastStore, type ToastItem } from '../lib/toast';

// Stable empty-array reference: an SSR render never has toasts, and reusing
// one module-level constant keeps repeated calls reference-equal.
const SERVER_SNAPSHOT: ToastItem[] = [];

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(toastStore.subscribe, toastStore.get, () => SERVER_SNAPSHOT);
}
