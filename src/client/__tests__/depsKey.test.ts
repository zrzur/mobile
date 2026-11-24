import { depsKey, snapshotOf } from "../depsKey";

class Node {
  self: Node;
  constructor() {
    this.self = this;
  }
}

describe("depsKey", () => {
  it("keys circular objects by identity instead of JSON", () => {
    const a = new Node();
    const b = new Node();
    expect(() => depsKey([a])).not.toThrow();
    expect(depsKey([a])).toBe(depsKey([a]));
    expect(depsKey([a])).not.toBe(depsKey([b]));
  });

  it("keeps primitives by value and tells types apart", () => {
    expect(depsKey(["1", 2, true, undefined, null])).toBe(depsKey(["1", 2, true, undefined, null]));
    expect(depsKey(["1"])).not.toBe(depsKey([1]));
    expect(depsKey(["a|b"])).not.toBe(depsKey(["a", "b"]));
  });

  it("keys arrays of primitives by value", () => {
    expect(depsKey([["x", "y"]])).toBe(depsKey([["x", "y"]]));
    expect(depsKey([["x"]])).not.toBe(depsKey([["y"]]));
  });
});

describe("snapshotOf", () => {
  it("matches JSON for plain values", () => {
    expect(snapshotOf({ a: 1, b: ["x"] })).toBe(JSON.stringify({ a: 1, b: ["x"] }));
  });

  it("does not throw on circular objects and is stable", () => {
    const n = new Node();
    const value = { n, name: "x" };
    expect(() => snapshotOf(value)).not.toThrow();
    expect(snapshotOf(value)).toBe(snapshotOf({ n, name: "x" }));
    expect(snapshotOf(value)).not.toBe(snapshotOf({ n: new Node(), name: "x" }));
  });
});
