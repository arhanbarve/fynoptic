// Controls which of the three auth modals (if any) is showing. Nav.tsx's
// sign-in/sign-up triggers and AuthDialog.tsx's own switch links (login <->
// signup <-> reset, the old `data-modal-switch` behavior) both go through
// this single store, so there is exactly one "which auth modal is open"
// truth shared across the shell instead of each side tracking its own.

import { createStore, type Store } from './store';

export type AuthDialogMode = 'login' | 'signup' | 'reset';

export interface AuthDialogState {
  open: boolean;
  mode: AuthDialogMode;
}

export const authDialogStore: Store<AuthDialogState> = createStore<AuthDialogState>({
  open: false,
  mode: 'login',
});

export function openAuthDialog(mode: AuthDialogMode): void {
  authDialogStore.set({ open: true, mode });
}

export function closeAuthDialog(): void {
  authDialogStore.set({ ...authDialogStore.get(), open: false });
}
