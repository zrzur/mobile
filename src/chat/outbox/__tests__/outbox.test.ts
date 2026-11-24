import { extraRows } from "../rows";
import {
  cleanOutbox,
  dropEntry,
  type OutboxEntry,
  outboxRetryDelay,
  outcomeOfError,
  patchEntry,
  putEntry,
  storedOutbox,
  uploadName,
  visibleEntries,
  waitsToBeSent,
} from "../rules";

const C = "01HZZZZZZZZZZZZZZZZZZZZZZC";
const K1 = "01J00000000000000000000001";
const K2 = "01J00000000000000000000002";
const K3 = "01J00000000000000000000003";

const entry = (key: string, patch: Partial<OutboxEntry> = {}): OutboxEntry => ({ key, channelId: C, content: "hi", status: "sending", createdAt: 1000, ...patch });

describe("outbox outcome of a failed send", () => {
  it("waits on a network failure, retries server hiccups, keeps refusals", () => {
    expect(outcomeOfError(new Error("offline"))).toEqual({ kind: "wait" });
    expect(outcomeOfError(null)).toEqual({ kind: "wait" });
    expect(outcomeOfError({ type: "InternalError" })).toEqual({ kind: "wait" });
    expect(outcomeOfError({ type: "DuplicateNonce" })).toEqual({ kind: "sent" });
    expect(outcomeOfError({ type: "MissingPermission" })).toEqual({ kind: "failed", error: "MissingPermission" });
  });

  it("backs off from 2 s to at most a minute", () => {
    expect(outboxRetryDelay(1)).toBe(2000);
    expect(outboxRetryDelay(2)).toBe(4000);
    expect(outboxRetryDelay(0)).toBe(2000);
    expect(outboxRetryDelay(20)).toBe(60_000);
  });

  it("sends by itself only what waits", () => {
    expect(waitsToBeSent({ status: "unsent" })).toBe(true);
    expect(waitsToBeSent({ status: "failed" })).toBe(false);
    expect(waitsToBeSent({ status: "sending" })).toBe(false);
  });
});

describe("outbox lists", () => {
  it("keeps entries in the order written and replaces by key", () => {
    let box = putEntry({}, entry(K2));
    box = putEntry(box, entry(K1));
    box = putEntry(box, entry(K2, { content: "edited" }));
    expect(box[C].map((e) => e.key)).toEqual([K1, K2]);
    expect(box[C][1].content).toBe("edited");
  });

  it("changes and removes one entry; the channel goes when empty", () => {
    let box = putEntry({}, entry(K1));
    box = patchEntry(box, C, K1, { status: "failed", error: "X" });
    expect(box[C][0]).toMatchObject({ status: "failed", error: "X" });
    expect(patchEntry(box, C, K2, { status: "sent" })).toBe(box);
    box = dropEntry(box, C, K1);
    expect(box[C]).toBeUndefined();
  });

  it("shows sending rows first, then waiting and failed; hides sent rows once their message is shown", () => {
    const list = [entry(K1, { status: "failed" }), entry(K2, { status: "sent", messageId: "M2" }), entry(K3, { status: "sending" })];
    expect(visibleEntries(list, []).map((e) => e.key)).toEqual([K2, K3, K1]);
    expect(visibleEntries(list, new Set(["M2"])).map((e) => e.key)).toEqual([K3, K1]);
    expect(visibleEntries(undefined, [])).toEqual([]);
  });
});

describe("outbox on disk", () => {
  it("restores sending as waiting, keeps refusals, drops sent and broken entries", () => {
    const raw = {
      [C]: [
        entry(K1, { status: "sending" }),
        entry(K2, { status: "failed", error: "MissingPermission" }),
        entry(K3, { status: "sent", messageId: "M" }),
        { key: "bad", content: "x", status: "unsent" },
        entry("01J00000000000000000000004", { content: "", files: [] }),
        entry("01J00000000000000000000005", { content: "", files: [{ uri: "file:///a.png", name: "a.png", type: "image/png", spoiler: true }], replies: [{ id: "R", mention: true }] }),
      ],
      "not-a-channel": [entry(K1)],
    };
    const box = cleanOutbox(JSON.parse(JSON.stringify(raw)));
    expect(Object.keys(box)).toEqual([C]);
    expect(box[C].map((e) => [e.key, e.status])).toEqual([
      [K1, "unsent"],
      [K2, "failed"],
      ["01J00000000000000000000005", "unsent"],
    ]);
    expect(box[C][1].error).toBe("MissingPermission");
    expect(box[C][2].files?.[0].spoiler).toBe(true);
    expect(box[C][2].replies).toEqual([{ id: "R", mention: true }]);
    expect(cleanOutbox(null)).toEqual({});
    expect(cleanOutbox([])).toEqual({});
  });

  it("does not store what was sent", () => {
    const box = putEntry(putEntry({}, entry(K1, { status: "sent" })), entry(K2, { status: "unsent" }));
    expect(storedOutbox(box)[C].map((e) => e.key)).toEqual([K2]);
    expect(storedOutbox(putEntry({}, entry(K1, { status: "sent" })))).toEqual({});
  });

  it("names a spoiler file the way the server reads it", () => {
    expect(uploadName({ uri: "u", name: "cat.png", type: "image/png", spoiler: true })).toBe("SPOILER_cat.png");
    expect(uploadName({ uri: "u", name: "SPOILER_cat.png", type: "image/png", spoiler: true })).toBe("SPOILER_cat.png");
    expect(uploadName({ uri: "u", name: "cat.png", type: "image/png" })).toBe("cat.png");
  });
});

describe("rows after the newest message", () => {
  const me = "ME";
  it("groups my sending rows under my last message within 7 minutes", () => {
    const rows = extraRows([entry(K1, { createdAt: 2000 }), entry(K2, { createdAt: 3000 })], [], { authorId: me, at: 1000 }, me);
    expect(rows.map((r) => r.kind === "outbox" && r.tail)).toEqual([true, true]);
  });

  it("starts a new group after someone else, a long pause, or with a reply", () => {
    expect(extraRows([entry(K1)], [], { authorId: "OTHER", at: 900 }, me)[0]).toMatchObject({ tail: false });
    expect(extraRows([entry(K1, { createdAt: 10 * 60 * 1000 })], [], { authorId: me, at: 0 }, me)[0]).toMatchObject({ tail: false });
    expect(extraRows([entry(K1, { replies: [{ id: "R", mention: false }] })], [], { authorId: me, at: 900 }, me)[0]).toMatchObject({ tail: false });
    expect(extraRows([entry(K1)], [], undefined, me)[0]).toMatchObject({ tail: false });
  });

  it("orders bots' answers and my messages by time; a bot answer breaks my group", () => {
    const rows = extraRows([entry(K1, { createdAt: 1000 }), entry(K2, { createdAt: 3000 })], [{ key: "e1", at: 2000 }], { authorId: me, at: 500 }, me);
    expect(rows.map((r) => r.key)).toEqual([`outbox-${K1}`, "e1", `outbox-${K2}`]);
    expect(rows[2]).toMatchObject({ tail: false });
  });
});
