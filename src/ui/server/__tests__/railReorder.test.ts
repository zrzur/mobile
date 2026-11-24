import { railEntries, type ServerFolder } from "../syncedLogic";
import { applyFold, applyMove, edgeScrollStep, indicatorAt, intentAt, isNoop, orderingValue, placeInFolder, type RailBox, railItems, shiftTarget, sidebarOrder } from "../railReorder";

// rail: a, F(open: b, c), d — tiles 48 tall, 8 apart
const folders: ServerFolder[] = [{ id: "F", name: "Games", servers: ["b", "c"] }];
const entries = railEntries(["a", "b", "c", "d"], ["a", "F", "b", "c", "d"], folders);
const items = railItems(entries);
const box = (id: string, top: number, kind: "server" | "folder" = "server", parent?: string): RailBox => ({ id, kind, parent, top, bottom: top + 48 });
const boxes: RailBox[] = [box("a", 0), box("F", 56, "folder"), box("b", 112, "server", "F"), box("c", 168, "server", "F"), box("d", 224)];

describe("railItems", () => {
  it("lists folders and the members of open folders", () => {
    expect(items).toEqual([{ id: "a", kind: "server" }, { id: "F", kind: "folder" }, { id: "b", kind: "server", parent: "F" }, { id: "c", kind: "server", parent: "F" }, { id: "d", kind: "server" }]);
  });
  it("hides the members of a closed folder", () => {
    const closed = railEntries(["a", "b"], ["F"], [{ id: "F", name: "", collapsed: true, servers: ["a", "b"] }]);
    expect(railItems(closed)).toEqual([{ id: "F", kind: "folder" }]);
  });
});

describe("edgeScrollStep", () => {
  it("scrolls up near the top, down near the bottom, not in the middle", () => {
    expect(edgeScrollStep(0, 0, 600)).toBe(-14);
    expect(edgeScrollStep(24, 0, 600)).toBe(-7);
    expect(edgeScrollStep(300, 0, 600)).toBe(0);
    expect(edgeScrollStep(600, 0, 600)).toBe(14);
  });
  it("narrows the band on a short rail and stops on an empty one", () => {
    expect(edgeScrollStep(10, 0, 80)).toBeLessThan(0);
    expect(edgeScrollStep(40, 0, 80)).toBe(0);
    expect(edgeScrollStep(0, 0, 0)).toBe(0);
  });
});

describe("intentAt", () => {
  it("folds a server onto the middle of a top-level server", () => {
    expect(intentAt(24, "d", boxes)).toEqual({ type: "fold", target: "a" });
    expect(intentAt(80, "a", boxes)).toEqual({ type: "fold", target: "F" });
  });
  it("inserts above or below at the edges", () => {
    expect(intentAt(2, "d", boxes)).toEqual({ type: "move", before: "a", parent: undefined });
    expect(intentAt(46, "d", boxes)).toEqual({ type: "move", before: "F", parent: undefined });
  });
  it("only reorders inside a folder and nests a server there", () => {
    expect(intentAt(136, "a", boxes)).toEqual({ type: "move", before: "c", parent: "F" });
    expect(intentAt(100, "a", boxes)).toEqual({ type: "move", before: "b", parent: "F" });
  });
  it("never folds or nests a folder", () => {
    const folderBoxes = [box("a", 0), box("F", 56, "folder"), box("b", 112, "server", "F"), box("d", 168)];
    expect(intentAt(24, "F", folderBoxes)).toEqual({ type: "move", before: "F", parent: undefined });
    // a folder dropped on its own open members lands after them
    expect(intentAt(100, "F", folderBoxes)).toEqual({ type: "move", before: "d", parent: undefined });
    // a server dropped there joins the folder
    expect(intentAt(100, "a", folderBoxes)).toEqual({ type: "move", before: "b", parent: "F" });
    const other = [box("G", 0, "folder"), box("x", 56, "server", "G"), box("F", 112, "folder")];
    expect(intentAt(40, "F", other)).toEqual({ type: "move", before: "F", parent: undefined });
  });
  it("treats the gap between tiles as its neighbour, and the ends", () => {
    expect(intentAt(51, "d", boxes)).toEqual({ type: "move", before: "F", parent: undefined });
    expect(intentAt(-30, "d", boxes)).toEqual({ type: "move", before: "a", parent: undefined });
    expect(intentAt(900, "a", boxes)).toEqual({ type: "move", before: undefined, parent: undefined });
  });
  it("aims at the nearest tile across a wide gap", () => {
    const wide = [box("a", 0), box("d", 100)];
    expect(intentAt(60, "d", wide)).toEqual({ type: "move", before: "d", parent: undefined });
  });
  it("gives up beside the rail and moves to the end of an empty rail", () => {
    expect(intentAt(24, "d", boxes, true)).toBeUndefined();
    expect(intentAt(24, "d", [])).toEqual({ type: "move", before: undefined, parent: undefined });
  });
});

describe("isNoop", () => {
  it("knows a drop that leaves the entry in place", () => {
    expect(isNoop("a", { type: "move", before: "a", parent: undefined }, items)).toBe(true);
    expect(isNoop("a", { type: "move", before: "F", parent: undefined }, items)).toBe(true);
    expect(isNoop("d", { type: "move", before: undefined, parent: undefined }, items)).toBe(true);
    expect(isNoop("F", { type: "move", before: "d", parent: undefined }, items)).toBe(true);
    expect(isNoop("a", { type: "fold", target: "a" }, items)).toBe(true);
    expect(isNoop("a", undefined, items)).toBe(true);
  });
  it("knows a real move", () => {
    expect(isNoop("a", { type: "move", before: "d", parent: undefined }, items)).toBe(false);
    expect(isNoop("b", { type: "move", before: "d", parent: undefined }, items)).toBe(false);
    expect(isNoop("c", { type: "move", before: "b", parent: "F" }, items)).toBe(false);
    expect(isNoop("x", { type: "move", before: "a", parent: undefined }, items)).toBe(false);
  });
});

describe("indicatorAt", () => {
  it("draws a line in the gap above the target or under the last tile", () => {
    expect(indicatorAt({ type: "move", before: "F", parent: undefined }, boxes)).toEqual({ type: "line", y: 50, height: 4 });
    expect(indicatorAt({ type: "move", before: undefined, parent: undefined }, boxes)).toEqual({ type: "line", y: 274, height: 4 });
  });
  it("draws a ring around a fold target", () => {
    expect(indicatorAt({ type: "fold", target: "a" }, boxes)).toEqual({ type: "ring", y: 0, height: 48 });
  });
  it("draws nothing without an intent or a target", () => {
    expect(indicatorAt(undefined, boxes)).toBeUndefined();
    expect(indicatorAt({ type: "fold", target: "zz" }, boxes)).toBeUndefined();
    expect(indicatorAt({ type: "move", before: "zz", parent: undefined }, boxes)).toBeUndefined();
    expect(indicatorAt({ type: "move", before: undefined, parent: undefined }, [])).toBeUndefined();
  });
});

describe("writing", () => {
  it("places a server in a folder and forgets empty folders", () => {
    const two: ServerFolder[] = [{ id: "F", name: "", servers: ["b", "c"] }, { id: "G", name: "", servers: ["x"] }];
    expect(placeInFolder(two, "F", "x", "c")).toEqual([{ id: "F", name: "", servers: ["b", "x", "c"] }]);
    expect(placeInFolder(two, "F", "b")).toEqual([{ id: "F", name: "", servers: ["c", "b"] }, { id: "G", name: "", servers: ["x"] }]);
  });
  it("writes folder members after their folder", () => {
    expect(sidebarOrder(["a", "F", "d"], folders)).toEqual(["a", "F", "b", "c", "d"]);
  });
  it("folds two servers into a new folder in the target's place", () => {
    const change = applyFold(entries, folders, "d", "a", "N", "New folder");
    expect(change?.folders).toEqual([...folders, { id: "N", name: "New folder", servers: ["d", "a"] }]);
    expect(change?.order).toEqual(["F", "b", "c", "N", "d", "a"]);
  });
  it("folds a server into an existing folder, out of its old one", () => {
    const change = applyFold(entries, folders, "F", "a", "N", "New folder");
    expect(change?.folders).toEqual([{ id: "F", name: "Games", servers: ["b", "c", "a"] }]);
    expect(change?.order).toEqual(["F", "b", "c", "a", "d"]);
    expect(applyFold(entries, folders, "a", "a", "N", "x")).toBeUndefined();
    expect(applyFold(entries, folders, "zz", "a", "N", "x")).toBeUndefined();
  });
  it("folding the last member out of a folder removes that folder", () => {
    const one: ServerFolder[] = [{ id: "F", name: "", servers: ["b"] }];
    const list = railEntries(["a", "b"], ["a", "F", "b"], one);
    const change = applyFold(list, one, "a", "b", "N", "New folder");
    expect(change?.folders).toEqual([{ id: "N", name: "New folder", servers: ["a", "b"] }]);
  });
  it("moves at the top level and skips a move that changes nothing", () => {
    expect(applyMove(entries, folders, "a", undefined, undefined)?.order).toEqual(["F", "b", "c", "d", "a"]);
    expect(applyMove(entries, folders, "d", "a", undefined)?.order).toEqual(["d", "a", "F", "b", "c"]);
    expect(applyMove(entries, folders, "a", "F", undefined)).toBeUndefined();
  });
  it("moves a server out of a folder and into one", () => {
    const out = applyMove(entries, folders, "b", "a", undefined);
    expect(out?.folders).toEqual([{ id: "F", name: "Games", servers: ["c"] }]);
    expect(out?.order).toEqual(["b", "a", "F", "c", "d"]);
    const into = applyMove(entries, folders, "d", "c", "F");
    expect(into?.folders).toEqual([{ id: "F", name: "Games", servers: ["b", "d", "c"] }]);
    expect(into?.order).toEqual(["a", "F", "b", "d", "c"]);
  });
});

describe("shiftTarget", () => {
  it("steps among siblings", () => {
    expect(shiftTarget(items, "d", -1)).toEqual({ before: "F", parent: undefined, position: 2, total: 3 });
    expect(shiftTarget(items, "a", 1)).toEqual({ before: "d", parent: undefined, position: 2, total: 3 });
    expect(shiftTarget(items, "b", 1)).toEqual({ before: undefined, parent: "F", position: 2, total: 2 });
  });
  it("says when the entry is already at an edge", () => {
    expect(shiftTarget(items, "a", -1)).toEqual({ edge: "top" });
    expect(shiftTarget(items, "c", 1)).toEqual({ edge: "bottom" });
    expect(shiftTarget(items, "zz", 1)).toEqual({ edge: "bottom" });
  });
});

describe("orderingValue", () => {
  it("keeps the legacy servers list", () => {
    expect(orderingValue({ servers: ["a"], serverSidebar: ["x"] }, ["b"])).toEqual({ servers: ["a"], serverSidebar: ["b"] });
    expect(orderingValue(undefined, ["b"])).toEqual({ servers: [], serverSidebar: ["b"] });
  });
});
