// Minimal store matching the `useSyncExternalStore` contract exactly, and
// nothing more: `get` returns the current snapshot by reference (unchanged
// between `set` calls, so `Object.is` comparisons in React are stable),
// `set` replaces the value and notifies subscribers, `subscribe` registers a
// listener and returns an unsubscribe function. Dependency-free — no React
// import here; hooks in src/hooks/ adapt these to `useSyncExternalStore`.

export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get(): T {
      return value;
    },
    set(next: T): void {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
