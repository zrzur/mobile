/**
 * Bridge from the SDK's SolidJS signals and event emitters to React.
 *
 * `@zrzur/sdk/solid` keeps its state in Solid signals (`client.ready()`,
 * collections, ...). React cannot watch those directly, so a small store
 * tracks the accessor inside a Solid root and tells React through
 * `useSyncExternalStore` when the value changes. The Solid root lives only
 * while at least one component listens.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createComputed, createRoot, untrack } from "solid-js";

export type SignalStore<T> = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
};

/**
 * Wrap a Solid accessor as an external store. The snapshot only changes when
 * Solid reports a change, so objects read from it keep their identity
 * between renders.
 */
export function signalStore<T>(accessor: () => T): SignalStore<T> {
  const listeners = new Set<() => void>();
  let value: T = untrack(accessor);
  let dispose: (() => void) | undefined;

  function start() {
    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      createComputed(() => {
        const next = accessor();
        if (Object.is(next, value)) return;
        value = next;
        for (const listener of [...listeners]) listener();
      });
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!dispose) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && dispose) {
          dispose();
          dispose = undefined;
        }
      };
    },
    getSnapshot() {
      // nobody listening: nothing keeps the value fresh, so read it now
      if (!dispose) value = untrack(accessor);
      return value;
    },
  };
}

/**
 * Read a Solid accessor in a React component and re-render when it changes.
 * Pass a stable accessor (a signal getter, or one wrapped in `useCallback`).
 */
export function useSolid<T>(accessor: () => T): T {
  const store = useMemo(() => signalStore(accessor), [accessor]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The emitter shape the SDK's `Client` and `Gateway` share */
export type Emitter<Events extends Record<string, unknown[]>> = {
  on<K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void,
  ): unknown;
  off<K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void,
  ): unknown;
};

/**
 * Listen to an SDK event for as long as the component is mounted. The latest
 * handler is always called, without re-subscribing on every render.
 */
export function useSdkEvent<
  Events extends Record<string, unknown[]>,
  K extends keyof Events & string,
>(
  emitter: Emitter<Events> | undefined,
  event: K,
  handler: (...args: Events[K]) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const listener = useCallback(
    (...args: Events[K]) => handlerRef.current(...args),
    [],
  );
  useEffect(() => {
    if (!emitter) return;
    emitter.on(event, listener);
    return () => {
      emitter.off(event, listener);
    };
  }, [emitter, event, listener]);
}
