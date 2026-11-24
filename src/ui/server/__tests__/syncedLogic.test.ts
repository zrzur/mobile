import { ulidTime } from "@/ui/lobby/lobbyLogic";

import {
  addToFolder,
  cleanFolders,
  cleanNotifications,
  cleanOrdering,
  createFolder,
  deleteFolder,
  editFolder,
  folderOf,
  muteActive,
  railEntries,
  removeFromFolder,
  toggleFolder,
  withoutServerMute,
  withServerLevel,
  withServerMute,
} from "../syncedLogic";
import { newUlid } from "../ulid";

describe("notification options", () => {
  const now = 1_000_000;
  it("keeps valid levels, migrates 'muted' and drops expired mutes", () => {
    const clean = cleanNotifications(
      {
        server: { a: "all", b: "muted", c: "loud" },
        channel: { x: "none" },
        server_mutes: { d: { until: now - 1 }, e: { until: now + 1 }, f: {} },
        suppress_everyone: { a: true, b: "yes" },
      },
      now,
    );
    expect(clean.server).toEqual({ a: "all" });
    expect(clean.channel).toEqual({ x: "none" });
    expect(Object.keys(clean.server_mutes).sort()).toEqual(["b", "e", "f"]);
    expect(clean.suppress_everyone).toEqual({ a: true });
  });
  it("survives a broken value", () => {
    expect(cleanNotifications("nope", now).server).toEqual({});
    expect(cleanNotifications(undefined, now).server_mutes).toEqual({});
  });
  it("mutes for a while or until turned back on, and unmutes", () => {
    const base = cleanNotifications({}, now);
    const timed = withServerMute(base, "s", 15, now);
    expect(timed.server_mutes.s).toEqual({ until: now + 15 * 60_000 });
    expect(muteActive(timed.server_mutes.s, now)).toBe(true);
    expect(muteActive(timed.server_mutes.s, now + 16 * 60_000)).toBe(false);
    const forever = withServerMute(base, "s", undefined, now);
    expect(muteActive(forever.server_mutes.s, now * 10)).toBe(true);
    expect(withoutServerMute(forever, "s").server_mutes.s).toBeUndefined();
  });
  it("sets and clears the server level", () => {
    const base = cleanNotifications({}, now);
    expect(withServerLevel(base, "s", "mention").server.s).toBe("mention");
    expect(withServerLevel(withServerLevel(base, "s", "all"), "s", undefined).server).toEqual({});
  });
});

describe("folders", () => {
  it("keeps one folder per server and drops broken entries", () => {
    const folders = cleanFolders({ folders: [{ id: "f1", name: "A", servers: ["s1", "s2"], colour: "#fff", collapsed: true }, { id: "f2", servers: ["s2", "s3", 4] }, { id: "f1", servers: ["s9"] }, { name: "no id" }] });
    expect(folders).toEqual([
      { id: "f1", name: "A", servers: ["s1", "s2"], colour: "#fff", collapsed: true },
      { id: "f2", name: "", servers: ["s3"] },
    ]);
    expect(cleanFolders(null)).toEqual([]);
  });
  it("reads the sidebar order, else the plain order", () => {
    expect(cleanOrdering({ servers: ["a", "b"], serverSidebar: ["f1", "a", "a"] })).toEqual(["f1", "a"]);
    expect(cleanOrdering({ servers: ["b", "a"] })).toEqual(["b", "a"]);
    expect(cleanOrdering(undefined)).toEqual([]);
  });
  it("orders the rail with folders in place and new servers last", () => {
    const folders = [{ id: "f1", name: "F", servers: ["b", "c", "gone"] }];
    expect(railEntries(["a", "b", "c", "d"], ["f1", "a"], folders)).toEqual([
      { type: "folder", id: "f1", folder: folders[0], servers: ["b", "c"] },
      { type: "server", id: "a" },
      { type: "server", id: "d" },
    ]);
    // a folder reached through one of its servers is drawn once
    expect(railEntries(["b", "c"], ["c", "b"], folders).map((e) => e.id)).toEqual(["f1"]);
    // a folder whose servers have all gone is not drawn
    expect(railEntries(["a"], [], folders)).toEqual([{ type: "server", id: "a" }]);
  });
  it("creates, adds, removes, edits, toggles and deletes", () => {
    let folders = createFolder([{ id: "f1", name: "A", servers: ["s1", "s2"] }], "f2", "New folder", ["s2"]);
    expect(folders.map((f) => f.servers)).toEqual([["s1"], ["s2"]]);
    folders = addToFolder(folders, "f1", "s2");
    expect(folders.map((f) => f.servers)).toEqual([["s1", "s2"], []]);
    expect(folderOf(folders, "s2")?.id).toBe("f1");
    folders = removeFromFolder(folders, "s1");
    expect(folders).toEqual([{ id: "f1", name: "A", servers: ["s2"] }]);
    folders = editFolder(folders, "f1", { name: "B", colour: "#ef4444" });
    expect(folders[0]).toMatchObject({ name: "B", colour: "#ef4444" });
    expect(editFolder(folders, "f1", { colour: undefined })[0].colour).toBeUndefined();
    expect(toggleFolder(folders, "f1")[0].collapsed).toBe(true);
    expect(deleteFolder(folders, "f1")).toEqual([]);
  });
});


describe("ulid", () => {
  it("makes 26 characters whose time decodes back", () => {
    const id = newUlid(1469922850259, () => 0.5);
    expect(id).toHaveLength(26);
    expect(ulidTime(id)).toBe(1469922850259);
  });
});
