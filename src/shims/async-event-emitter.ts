/**
 * Small stand-in for `@vladfrangu/async_event_emitter`, used by the SDK's
 * Client and Gateway. The original bundles Node's `util.inspect`, which
 * runs code at load time that Hermes (the phone's JavaScript engine)
 * refuses ("target is not an object"), so the app crashed on start.
 * Metro points the package here (metro.config.js); behaviour the SDK
 * relies on is kept: listeners run in order, async listeners are not
 * awaited, an "error" event without listeners throws.
 */
type Listener = (...args: never[]) => unknown;

export class AsyncEventEmitter<Events extends Record<string, unknown[]> = Record<string, unknown[]>> {
  #listeners = new Map<keyof Events, { fn: Listener; once: boolean }[]>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => unknown): this {
    const list = this.#listeners.get(event) ?? [];
    list.push({ fn: listener as Listener, once: false });
    this.#listeners.set(event, list);
    return this;
  }

  addListener<K extends keyof Events>(event: K, listener: (...args: Events[K]) => unknown): this {
    return this.on(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: (...args: Events[K]) => unknown): this {
    const list = this.#listeners.get(event) ?? [];
    list.push({ fn: listener as Listener, once: true });
    this.#listeners.set(event, list);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => unknown): this {
    const list = this.#listeners.get(event);
    if (!list) return this;
    const index = list.findIndex((entry) => entry.fn === (listener as Listener));
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) this.#listeners.delete(event);
    return this;
  }

  removeListener<K extends keyof Events>(event: K, listener: (...args: Events[K]) => unknown): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: keyof Events): this {
    if (event === undefined) this.#listeners.clear();
    else this.#listeners.delete(event);
    return this;
  }

  listenerCount(event: keyof Events): number {
    return this.#listeners.get(event)?.length ?? 0;
  }

  listeners<K extends keyof Events>(event: K): ((...args: Events[K]) => unknown)[] {
    return (this.#listeners.get(event) ?? []).map((entry) => entry.fn as (...args: Events[K]) => unknown);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    const list = this.#listeners.get(event);
    if (!list || list.length === 0) {
      if (event === "error") throw args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      return false;
    }
    for (const entry of [...list]) {
      if (entry.once) this.off(event, entry.fn as (...args: Events[K]) => unknown);
      try {
        const result = (entry.fn as (...a: Events[K]) => unknown)(...args);
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          (result as Promise<unknown>).catch((err) => this.#fail(event, err));
        }
      } catch (err) {
        this.#fail(event, err);
      }
    }
    return true;
  }

  #fail(event: keyof Events, err: unknown) {
    // an error inside an "error" listener must not loop
    if (event !== "error" && this.listenerCount("error" as keyof Events) > 0) {
      this.emit("error" as keyof Events, ...([err] as unknown as Events[keyof Events]));
    } else {
      console.warn("Zrzur: event listener failed", err);
    }
  }
}
