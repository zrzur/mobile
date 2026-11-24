import { AsyncEventEmitter } from "../async-event-emitter";

type Events = { ping: [n: number]; error: [err: unknown] };

describe("event emitter used by the SDK on phones", () => {
  it("calls listeners in order and says whether anyone listened", () => {
    const e = new AsyncEventEmitter<Events>();
    const seen: string[] = [];
    e.on("ping", (n) => void seen.push(`a${n}`));
    e.on("ping", (n) => void seen.push(`b${n}`));
    expect(e.emit("ping", 1)).toBe(true);
    expect(seen).toEqual(["a1", "b1"]);
    expect(new AsyncEventEmitter<Events>().emit("ping", 1)).toBe(false);
  });

  it("runs once-listeners one time and removes listeners", () => {
    const e = new AsyncEventEmitter<Events>();
    const once = jest.fn();
    const always = jest.fn();
    e.once("ping", once);
    e.on("ping", always);
    e.emit("ping", 1);
    e.emit("ping", 2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(always).toHaveBeenCalledTimes(2);
    e.off("ping", always);
    expect(e.listenerCount("ping")).toBe(0);
    e.on("ping", always);
    e.removeAllListeners();
    expect(e.listenerCount("ping")).toBe(0);
  });

  it("throws an error event nobody handles, and routes listener failures to error", async () => {
    const e = new AsyncEventEmitter<Events>();
    expect(() => e.emit("error", new Error("boom"))).toThrow("boom");
    const onError = jest.fn();
    e.on("error", onError);
    e.on("ping", () => {
      throw new Error("sync");
    });
    e.on("ping", async () => {
      throw new Error("async");
    });
    e.emit("ping", 1);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("works as a base class, as the SDK uses it", () => {
    class Gateway extends AsyncEventEmitter<Events> {}
    const g = new Gateway();
    const got = jest.fn();
    g.on("ping", got);
    g.emit("ping", 7);
    expect(got).toHaveBeenCalledWith(7);
  });
});
