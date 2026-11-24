import { act, renderHook } from "@testing-library/react-native";
import { createSignal } from "solid-js";

import { type Emitter, signalStore, useSdkEvent, useSolid } from "../bridge";

describe("signalStore", () => {
  it("reads the current value before anyone listens", async () => {
    const [count, setCount] = createSignal(1);
    const store = signalStore(count);
    expect(store.getSnapshot()).toBe(1);
    setCount(2);
    expect(store.getSnapshot()).toBe(2);
  });

  it("tells listeners when the signal changes", async () => {
    const [count, setCount] = createSignal(1);
    const store = signalStore(count);
    const listener = jest.fn();
    store.subscribe(listener);
    setCount(5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(5);
  });

  it("stays quiet when the value is set to the same thing", async () => {
    const [name, setName] = createSignal("a", { equals: false });
    const store = signalStore(name);
    const listener = jest.fn();
    store.subscribe(listener);
    setName("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("tells every listener, and stops tracking after the last one leaves", async () => {
    const [count, setCount] = createSignal(0);
    let reads = 0;
    const store = signalStore(() => {
      reads++;
      return count();
    });
    const a = jest.fn();
    const b = jest.fn();
    const offA = store.subscribe(a);
    const offB = store.subscribe(b);
    setCount(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
    const before = reads;
    setCount(2);
    // the Solid root is gone: no reads until someone asks
    expect(reads).toBe(before);
    expect(store.getSnapshot()).toBe(2);
  });

  it("follows derived values that read several signals", async () => {
    const [first, setFirst] = createSignal("Sara");
    const [last] = createSignal("Haddad");
    const store = signalStore(() => `${first()} ${last()}`);
    const listener = jest.fn();
    store.subscribe(listener);
    setFirst("Lina");
    expect(store.getSnapshot()).toBe("Lina Haddad");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("useSolid", () => {
  it("re-renders the component when the signal changes", async () => {
    const [ready, setReady] = createSignal(false);
    const { result } = await renderHook(() => useSolid(ready));
    expect(result.current).toBe(false);
    await act(async () => {
      setReady(true);
    });
    expect(result.current).toBe(true);
  });

  it("keeps the same object between renders until Solid reports a change", async () => {
    const [user, setUser] = createSignal({ username: "sara" });
    const { result, rerender } = await renderHook(() => useSolid(user));
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
    await act(async () => {
      setUser({ username: "lina" });
    });
    expect(result.current.username).toBe("lina");
  });

  it("lets go of the signal when the component unmounts", async () => {
    const [count, setCount] = createSignal(0);
    let reads = 0;
    const accessor = () => {
      reads++;
      return count();
    };
    const { unmount } = await renderHook(() => useSolid(accessor));
    await unmount();
    const before = reads;
    setCount(3);
    expect(reads).toBe(before);
  });
});

type TestEvents = { state: [value: number]; ready: [] };

function fakeEmitter() {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const emitter: Emitter<TestEvents> & {
    emit<K extends keyof TestEvents & string>(event: K, ...args: TestEvents[K]): void;
    count(event: string): number;
  } = {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener as never);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as never);
    },
    emit(event, ...args) {
      for (const l of listeners.get(event) ?? []) (l as (...a: unknown[]) => void)(...args);
    },
    count: (event) => listeners.get(event)?.size ?? 0,
  };
  return emitter;
}

describe("useSdkEvent", () => {
  it("listens while mounted and stops on unmount", async () => {
    const emitter = fakeEmitter();
    const handler = jest.fn();
    const { unmount } = await renderHook(() => useSdkEvent<TestEvents, "state">(emitter, "state", handler));
    expect(emitter.count("state")).toBe(1);
    emitter.emit("state", 2);
    expect(handler).toHaveBeenCalledWith(2);
    await unmount();
    expect(emitter.count("state")).toBe(0);
  });

  it("calls the latest handler without subscribing again", async () => {
    const emitter = fakeEmitter();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(
      ({ handler }: { handler: (v: number) => void }) => useSdkEvent<TestEvents, "state">(emitter, "state", handler),
      { initialProps: { handler: first } },
    );
    await rerender({ handler: second });
    expect(emitter.count("state")).toBe(1);
    emitter.emit("state", 7);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(7);
  });

  it("does nothing without an emitter", async () => {
    const handler = jest.fn();
    await expect(renderHook(() => useSdkEvent(undefined, "ready", handler))).resolves.toBeDefined();
  });
});
