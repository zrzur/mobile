import { useMemo, useSyncExternalStore } from "react";

/**
 * A tiny external store: one value, replaced as a whole, with listeners.
 * The call and the ringing keep their state here (outside React) so the
 * call goes on while screens come and go.
 */
export type Store<T> = {
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * Read a store in a component. `pick` should return a primitive or a part
 * of the state that keeps its identity, so unrelated changes do not
 * re-render (the speaking list changes often; a tile reads only its own
 * flag).
 */
export function useStore<T, R>(store: Store<T>, pick: (value: T) => R): R {
  const read = () => pick(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}

/**
 * Read several fields of an object store; re-renders only when one of them
 * changes (so the call bar does not follow the speaking list)
 */
export function useStoreFields<T extends object, K extends keyof T>(store: Store<T>, keys: readonly K[]): Pick<T, K> {
  const id = keys.join("|");
  const read = useMemo(() => fieldsReader(store, keys), [store, id]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(store.subscribe, read, read);
}

/** A reader that hands out the same object while the picked fields stay the same */
export function fieldsReader<T extends object, K extends keyof T>(store: Store<T>, keys: readonly K[]): () => Pick<T, K> {
  let last: Pick<T, K> | undefined;
  return () => {
    const current = store.get();
    if (last && keys.every((key) => Object.is(last![key], current[key]))) return last;
    last = pickFields(current, keys);
    return last;
  };
}

/** Pick fields of a value */
export function pickFields<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const next = {} as Pick<T, K>;
  for (const key of keys) next[key] = value[key];
  return next;
}
