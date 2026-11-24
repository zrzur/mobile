import { buildRows, type MessageMeta } from "../rows";

const at = (h: number, m: number, day = 22) => new Date(2026, 10, day, h, m).getTime();
const msg = (id: string, author: string, time: number, extra: Partial<MessageMeta> = {}): MessageMeta => ({
  id,
  authorId: author,
  createdAt: time,
  ...extra,
});

describe("message grouping", () => {
  it("groups one author's messages within seven minutes", () => {
    const rows = buildRows([msg("a", "u1", at(10, 0)), msg("b", "u1", at(10, 6)), msg("c", "u1", at(10, 14))], false);
    expect(rows).toEqual([
      { kind: "message", id: "a", tail: false },
      { kind: "message", id: "b", tail: true },
      { kind: "message", id: "c", tail: false },
    ]);
  });

  it("starts a new group for another author, a reply or a system message", () => {
    const rows = buildRows(
      [
        msg("a", "u1", at(10, 0)),
        msg("b", "u2", at(10, 1)),
        msg("c", "u2", at(10, 2), { reply: true }),
        msg("d", "u2", at(10, 3), { system: true }),
        msg("e", "u2", at(10, 4)),
      ],
      false,
    );
    expect(rows.map((r) => (r.kind === "message" ? r.tail : null))).toEqual([false, false, false, false, false]);
  });

  it("keeps different masquerades apart", () => {
    const rows = buildRows([msg("a", "bot", at(10, 0), { masquerade: "Ali" }), msg("b", "bot", at(10, 1), { masquerade: "Mona" })], false);
    expect(rows[1]).toEqual({ kind: "message", id: "b", tail: false });
  });

  it("puts a date divider between days, and the start header when the history is complete", () => {
    const rows = buildRows([msg("a", "u1", at(23, 58, 21)), msg("b", "u1", at(0, 1, 22))], true);
    expect(rows.map((r) => r.kind)).toEqual(["start", "date", "message", "date", "message"]);
    expect(rows[4]).toEqual({ kind: "message", id: "b", tail: false });
  });

  it("has no leading divider while older messages are still to load", () => {
    const rows = buildRows([msg("a", "u1", at(9, 0))], false);
    expect(rows).toEqual([{ kind: "message", id: "a", tail: false }]);
  });
});
