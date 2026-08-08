import { useSyncExternalStore } from 'react';
import { authStore } from '../lib/auth';
import type { User } from 'firebase/auth';

export interface AuthState {
  user: User | null;
  status: 'loading' | 'in' | 'out';
}

// Server snapshot never touches window/document/Firebase and matches the
// store's initial value, so hydration has nothing to reconcile.
const SERVER_SNAPSHOT: AuthState = { user: null, status: 'loading' };

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.get, () => SERVER_SNAPSHOT);
}
