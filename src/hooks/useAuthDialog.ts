import { useSyncExternalStore } from 'react';
import { authDialogStore, type AuthDialogState } from '../lib/auth-dialog';

// Server snapshot matches the store's initial value and never touches
// window/document, so hydration has nothing to reconcile.
const SERVER_SNAPSHOT: AuthDialogState = { open: false, mode: 'login' };

export function useAuthDialog(): AuthDialogState {
  return useSyncExternalStore(authDialogStore.subscribe, authDialogStore.get, () => SERVER_SNAPSHOT);
}
