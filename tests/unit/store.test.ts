import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/lib/store';

describe('subscribe/unsubscribe', () => {
  it('notifies a subscribed listener on set', () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    unsubscribe();
    store.set(2);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not call an unrelated listener after a different one unsubscribes', () => {
    const store = createStore(0);
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = store.subscribe(a);
    store.subscribe(b);

    unsubscribeA();
    store.set(1);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('subscribing the same listener function twice only calls it once per set (Set-backed)', () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribe(listener);

    store.set(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('notify semantics on repeated identical sets', () => {
  // Design choice: createStore() is intentionally "the useSyncExternalStore
  // contract and nothing more" — it does not compare the incoming value
  // against the current one. set() always notifies, even when the new value
  // is === the old value. Consumers that want to skip redundant renders are
  // expected to avoid calling set() with an unchanged value themselves;
  // baking an equality check in here would be unrequested flexibility for a
  // ~30-line primitive. This test pins that choice down: N identical sets
  // produce exactly N notifications, never more (no accidental double-fire
  // per call) and never fewer (no silent de-duplication).
  it('calls the listener exactly once per set(), even for repeated identical values', () => {
    const store = createStore('dark');
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('dark');
    store.set('dark');
    store.set('dark');

    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('snapshot stability', () => {
  it('get() returns the same reference across repeated calls with no intervening set', () => {
    const store = createStore({ value: 1 });
    const first = store.get();
    const second = store.get();
    const third = store.get();

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('get() returns the new reference after set(), and it is stable until the next set()', () => {
    const initial = { value: 1 };
    const next = { value: 2 };
    const store = createStore(initial);

    store.set(next);

    expect(store.get()).toBe(next);
    expect(store.get()).toBe(store.get());
    expect(store.get()).not.toBe(initial);
  });
});
