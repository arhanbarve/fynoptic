// Single toast implementation, deduplicating the near-identical copies in
// js/app.js (showToast/initToasts), js/flashcard.js, js/practice.js,
// js/course-one.js and js/articles.js.

import { createStore } from './store';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

// Phase 5: <Toaster> (src/components/shell/Toaster.tsx) is the sole
// renderer, reading this store via useSyncExternalStore. showToast() below
// only pushes/removes entries here — it no longer builds any DOM itself.
export const toastStore = createStore<ToastItem[]>([]);

let nextToastId = 0;

function makeToastId(): string {
  nextToastId += 1;
  return `toast-${nextToastId}`;
}

export function showToast(message: string, variant: ToastVariant = 'info'): void {
  const id = makeToastId();
  toastStore.set([...toastStore.get(), { id, message, variant }]);
  setTimeout(() => {
    toastStore.set(toastStore.get().filter((toast) => toast.id !== id));
  }, 3500);
}
