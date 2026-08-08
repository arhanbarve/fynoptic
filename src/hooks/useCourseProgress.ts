import { useSyncExternalStore } from 'react';
import { progressStore, SERVER_PROGRESS_SNAPSHOT, type ProgressSnapshot } from '../lib/progress';

export function useCourseProgress(): ProgressSnapshot {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get, () => SERVER_PROGRESS_SNAPSHOT);
}
