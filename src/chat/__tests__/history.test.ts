import { addLive, addNewer, addOlder, catchUp, countNewer, fromLatest, fromNearby, landingId, removeId } from "../history";
import { buildRows } from "../rows";

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `M${String(from + i).padStart(3, "0")}`);

describe("history window", () => {
  it("the newest page is live; a short page reaches the start", () => {
    expect(fromLatest(ids(1, 10).reverse(), 50)).toEqual({ ids: ids(1, 10), atStart: true, atEnd: true });
    expect(fromLatest(ids(1, 50), 50).atStart).toBe(false);
  });

  it("a page around a message knows which sides reached an edge", () => {
    const w = fromNearby(ids(20, 45), "M030", 50);
    // 16 at or after the target, 10 before it: both shorter than 26
    expect(w.atStart).toBe(true);
    expect(w.atEnd).toBe(true);
    const full = fromNearby(ids(0, 52), "M026", 50);
    expect(full.atStart).toBe(false);
    expect(full.atEnd).toBe(false);
  });

  it("older and newer pages merge without duplicates and cap the size", () => {
    const w = { ids: ids(50, 60), atStart: false, atEnd: false };
    const older = addOlder(w, ids(45, 51), 50, 400);
    expect(older.ids[0]).toBe("M045");
    expect(older.ids.length).toBe(16);
    expect(older.atStart).toBe(true);
    const newer = addNewer(w, ids(58, 70), 50, 15);
    expect(newer.ids.length).toBe(15);
    expect(newer.ids[newer.ids.length - 1]).toBe("M070");
    expect(newer.atEnd).toBe(true);
    const capped = addOlder({ ...w, atEnd: true }, ids(1, 49), 50, 20);
    expect(capped.atEnd).toBe(false);
  });

  it("live messages join only a live window", () => {
    expect(addLive({ ids: ids(1, 3), atStart: true, atEnd: true }, "M004").ids).toEqual(ids(1, 4));
    const away = { ids: ids(1, 3), atStart: true, atEnd: false };
    expect(addLive(away, "M009")).toBe(away);
    expect(removeId({ ids: ids(1, 3), atStart: true, atEnd: true }, "M002").ids).toEqual(["M001", "M003"]);
  });

  it("a jump lands on the message or the next one", () => {
    const w = { ids: ["M001", "M003", "M005"], atStart: true, atEnd: true };
    expect(landingId(w, "M003")).toBe("M003");
    expect(landingId(w, "M004")).toBe("M005");
    expect(countNewer(w.ids, "M001")).toBe(2);
    expect(countNewer(w.ids, undefined)).toBe(0);
  });
});

describe("unread divider", () => {
  const at = (m: number) => new Date(2026, 10, 22, 10, m).getTime();
  const metas = ["M001", "M002", "M003"].map((id, i) => ({ id, authorId: "u1", createdAt: at(i) }));

  it("goes above the first message after the last read one and starts a group", () => {
    expect(buildRows(metas, false, "M001")).toEqual([
      { kind: "message", id: "M001", tail: false },
      { kind: "unread" },
      { kind: "message", id: "M002", tail: false },
      { kind: "message", id: "M003", tail: true },
    ]);
  });

  it("is left out when everything was read", () => {
    expect(buildRows(metas, false, "M003").some((r) => r.kind === "unread")).toBe(false);
    expect(buildRows(metas, false, undefined).some((r) => r.kind === "unread")).toBe(false);
  });
});

describe("catching up after a reconnect", () => {
  it("fills a short gap, reloads after a long one, leaves history views alone", () => {
    const live = fromLatest(ids(1, 10), 50);
    expect(catchUp(live, ids(11, 13), 50)).toEqual({ ids: ids(1, 13), atStart: true, atEnd: true });
    expect(catchUp(live, [], 50)).toBe(live);
    expect(catchUp(live, ids(11, 60), 50)).toBeNull();
    const past = { ids: ids(1, 10), atStart: true, atEnd: false };
    expect(catchUp(past, ids(11, 12), 50)).toBe(past);
  });
});
