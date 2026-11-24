import { keyFor, sendSignature } from "../sendKey";

describe("send idempotency key", () => {
  let n = 0;
  const make = () => `K${++n}`;

  it("keeps the key when the same message is sent again", () => {
    const first = keyFor(null, sendSignature("C1", " hello ", ["file://a"], "R1"), make);
    const again = keyFor(first, sendSignature("C1", "hello", ["file://a"], "R1"), make);
    expect(again.key).toBe(first.key);
  });

  it("makes a new key when the message changed", () => {
    const first = keyFor(null, sendSignature("C1", "hello", []), make);
    expect(keyFor(first, sendSignature("C1", "hello!", []), make).key).not.toBe(first.key);
    expect(keyFor(first, sendSignature("C2", "hello", []), make).key).not.toBe(first.key);
    expect(keyFor(first, sendSignature("C1", "hello", ["file://b"]), make).key).not.toBe(first.key);
    expect(keyFor(first, sendSignature("C1", "hello", [], "R9"), make).key).not.toBe(first.key);
  });
});
