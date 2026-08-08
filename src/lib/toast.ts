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

// Phase 4: a store layered on top of the existing DOM-based toasts below, so
// a future React <Toaster> (Phase 5) can render from it. showToast() below
// is unchanged apart from also pushing/removing entries here; the DOM toast
// it builds today remains the thing that's actually visible.
export const toastStore = createStore<ToastItem[]>([]);

let nextToastId = 0;

function makeToastId(): string {
  nextToastId += 1;
  return `toast-${nextToastId}`;
}

function ensureContainer(): HTMLElement {
  let container = document.querySelector<HTMLElement>('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, variant: ToastVariant = 'info'): void {
  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  if (variant === 'success') el.style.borderLeftColor = 'var(--success-500)';
  if (variant === 'error') el.style.borderLeftColor = 'var(--danger-500)';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);

  const id = makeToastId();
  toastStore.set([...toastStore.get(), { id, message, variant }]);
  setTimeout(() => {
    toastStore.set(toastStore.get().filter((toast) => toast.id !== id));
  }, 3500);
}

export function initToasts(): void {
  ensureContainer();
}
