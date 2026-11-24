import { i18n } from "@lingui/core";
import { Permission } from "@zrzur/sdk";

import {
  accessErrorKind,
  categoryChanges,
  channelChanges,
  clampUserLimit,
  countBits,
  everyoneOverride,
  formatDuration,
  hasOwnAccess,
  holds,
  isAdministrator,
  isEmptyOverride,
  isHiddenFrom,
  isPrivate,
  isPrivateCategory,
  leaksOutside,
  listedPeople,
  memberAdd,
  memberRemove,
  overrideCounts,
  pair,
  pairText,
  roleOverride,
  roomMakerOf,
  sees,
  seenByRoleOutside,
  setOne,
  splitRoles,
  toOverride,
  variantGroups,
  withoutCategory,
} from "../overrides";
import { permissionGroups } from "../permissions";

beforeAll(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

const VIEW = Permission.ViewChannel;
const SEND = Permission.SendMessage;
const NONE = { a: 0n, d: 0n };
/** a server where everyone may view and send */
const BASE = VIEW | SEND | Permission.ReadMessageHistory;

describe("private detection", () => {
  it("an open channel is seen by people with no role", () => {
    expect(sees(BASE, NONE)).toBe(true);
    expect(isPrivate(BASE, NONE)).toBe(false);
  });

  it("denying View to everyone makes it private, and undoing it opens it again", () => {
    const priv = everyoneOverride(NONE, true);
    expect(priv.d & VIEW).toBe(VIEW);
    expect(isPrivate(BASE, priv)).toBe(true);
    const open = everyoneOverride(priv, false);
    expect(isPrivate(BASE, open)).toBe(false);
  });

  it("making private removes View from allow and keeps the other bits", () => {
    const next = everyoneOverride({ a: VIEW | SEND, d: 0n }, true);
    expect(next.a).toBe(SEND);
    expect(next.d).toBe(VIEW);
  });

  it("a server without View in its default is private with no override", () => {
    expect(isPrivate(SEND, NONE)).toBe(true);
  });
});

describe("role let-in / hide", () => {
  const priv = everyoneOverride(NONE, true);
  const role = { permissions: NONE };

  it("lets a role in on a private channel", () => {
    const next = roleOverride(BASE, priv, role, true);
    expect(next.a & VIEW).toBe(VIEW);
    expect(next.d & VIEW).toBe(0n);
    expect(sees(BASE, priv, { permissions: NONE, override: next })).toBe(true);
  });

  it("hiding on a private channel only clears the allow (no deny needed)", () => {
    const next = roleOverride(BASE, priv, { permissions: NONE, override: { a: VIEW | SEND, d: 0n } }, false);
    expect(next).toEqual({ a: SEND, d: 0n });
    expect(sees(BASE, priv, { permissions: NONE, override: next })).toBe(false);
  });

  it("hiding on an open channel denies View", () => {
    const next = roleOverride(BASE, NONE, role, false);
    expect(next.d & VIEW).toBe(VIEW);
    expect(sees(BASE, NONE, { permissions: NONE, override: next })).toBe(false);
  });

  it("hiding a role that has View server-wide on a private channel denies it", () => {
    const strong = { permissions: { a: VIEW, d: 0n } };
    expect(sees(BASE, priv, strong)).toBe(true);
    const next = roleOverride(BASE, priv, strong, false);
    expect(next.d & VIEW).toBe(VIEW);
  });

  it("knows administrators", () => {
    expect(isAdministrator(Permission.Administrator | SEND)).toBe(true);
    expect(isAdministrator(SEND)).toBe(false);
  });
});

describe("people list", () => {
  it("add allows View and keeps other bits; remove clears only View", () => {
    const start = { a: SEND, d: VIEW };
    const added = memberAdd(start);
    expect(added).toEqual({ a: SEND | VIEW, d: 0n });
    expect(hasOwnAccess(added)).toBe(true);
    expect(memberRemove(added)).toEqual({ a: SEND, d: 0n });
    expect(isEmptyOverride(memberRemove({ a: VIEW, d: 0n }))).toBe(true);
  });

  it("lists let-in people on a private channel and kept-out people on an open one", () => {
    const overrides = { u1: { a: VIEW, d: 0n }, u2: { a: 0n, d: VIEW }, u3: { a: SEND, d: 0n } };
    expect(listedPeople(overrides, true)).toEqual(["u1"]);
    expect(listedPeople(overrides, false)).toEqual(["u2"]);
    expect(isHiddenFrom(overrides.u2)).toBe(true);
  });
});

describe("counts", () => {
  it("counts bits for Grants n / denies n", () => {
    expect(countBits(0n)).toBe(0);
    expect(countBits(VIEW | SEND)).toBe(2);
    expect(overrideCounts({ a: VIEW | SEND | Permission.React, d: Permission.Speak })).toEqual({ granted: 3, denied: 1 });
    expect(overrideCounts(undefined)).toEqual({ granted: 0, denied: 0 });
  });

  it("splits roles into with and without overrides, order kept", () => {
    const roles = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { withOverrides, without } = splitRoles(roles, { b: { a: SEND, d: 0n }, c: NONE });
    expect(withOverrides.map((r) => r.id)).toEqual(["b"]);
    expect(without.map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("editor state", () => {
  it("setting one key clears both bits first", () => {
    const start = { a: SEND, d: Permission.React };
    expect(setOne(start, "SendMessage", "deny")).toEqual({ a: 0n, d: Permission.React | SEND });
    expect(setOne(start, "React", "inherit")).toEqual({ a: SEND, d: 0n });
    expect(setOne(start, "Speak", "allow")).toEqual({ a: SEND | Permission.Speak, d: Permission.React });
  });

  it("locks rows you do not hold", () => {
    expect(holds(SEND | VIEW, "SendMessage")).toBe(true);
    expect(holds(SEND, "ManageMessages")).toBe(false);
  });

  it("converts pairs from numbers, bigints and strings and back", () => {
    expect(pair({ a: 3, d: "4" })).toEqual({ a: 3n, d: 4n });
    expect(pair(undefined)).toEqual(NONE);
    expect(pairText({ a: 5n, d: 0 })).toEqual({ a: "5", d: "0" });
    expect(toOverride({ a: VIEW, d: SEND })).toEqual({ allow: Number(VIEW), deny: Number(SEND) });
  });
});

describe("channel wording variants", () => {
  const groups = () => permissionGroups(i18n);
  const keys = (g: ReturnType<typeof variantGroups>) => g.flatMap((x) => x.items.map((i) => i.key));
  const text = (g: ReturnType<typeof variantGroups>, key: string) => g.flatMap((x) => x.items).find((i) => i.key === key)?.text;

  it("server keeps every group and wording", () => {
    expect(variantGroups(i18n, groups(), "server")).toEqual(groups());
  });

  it("a text channel hides server-only rights and the Members group", () => {
    const g = variantGroups(i18n, groups(), "channel");
    const k = keys(g);
    for (const hidden of ["Administrator", "ManageServer", "ManageRole", "ManageCustomisation", "KickMembers", "BanMembers", "ManageSoundboard", "CreateForumPosts"]) expect(k).not.toContain(hidden);
    expect(k).toEqual(expect.arrayContaining(["ManageChannel", "ManagePermissions", "ViewChannel", "CreateThreads", "SendMessageInThreads", "UseSoundboard", "MentionRoles"]));
    expect(g.map((x) => x.title)).not.toContain("Members");
    expect(g[0].title).toBe("");
    expect(text(g, "ViewChannel")).toBe("Able to access this channel");
    expect(text(g, "ManagePermissions")).toBe("Edit channel-specific role and default permissions");
    expect(text(g, "CreateThreads")).toBe("Start threads in this channel");
    expect(text(g, "SendMessageInThreads")).toBe("Write in the threads and posts of this channel");
  });

  it("a forum shows Create forum posts instead of Create threads", () => {
    const g = variantGroups(i18n, groups(), "channel", { forum: true });
    expect(keys(g)).toContain("CreateForumPosts");
    expect(keys(g)).not.toContain("CreateThreads");
    expect(text(g, "CreateForumPosts")).toBe("Start posts in this forum");
  });

  it("a voice channel hides the threads group", () => {
    const g = variantGroups(i18n, groups(), "channel", { voice: true });
    for (const k of ["CreateThreads", "SendMessageInThreads", "CreateForumPosts"]) expect(keys(g)).not.toContain(k);
    expect(g.map((x) => x.title)).not.toContain("Threads and forums");
  });

  it("a category uses the category wording for threads and forums", () => {
    const g = variantGroups(i18n, groups(), "category");
    expect(text(g, "CreateThreads")).toBe("Start threads in the text channels of this category");
    expect(text(g, "SendMessageInThreads")).toBe("Write in the threads and forum posts of this category");
    expect(text(g, "CreateForumPosts")).toBe("Start posts in the forums of this category");
  });

  it("only the dangerous rights warn in a channel", () => {
    const g = variantGroups(i18n, groups(), "channel");
    const powerful = g.flatMap((x) => x.items).filter((i) => i.powerful).map((i) => i.key);
    expect(powerful).toEqual(["ManagePermissions"]);
  });
});

describe("categories", () => {
  it("detects a private category", () => {
    expect(isPrivateCategory(BASE, { default_permissions: { a: 0, d: Number(VIEW) } })).toBe(true);
    expect(isPrivateCategory(BASE, { default_permissions: null })).toBe(false);
  });

  it("finds channels with their own permissions seen from outside", () => {
    const category = { everyone: { a: 0n, d: VIEW }, roles: {} };
    const openChannel = { everyone: NONE, roles: {} };
    const closedChannel = { everyone: { a: 0n, d: VIEW }, roles: { r1: { a: VIEW, d: 0n } } };
    const role = { id: "r1", permissions: NONE };
    expect(leaksOutside(BASE, category, openChannel, [role])).toBe(true);
    expect(seenByRoleOutside(BASE, category, closedChannel, role)).toBe(true);
    expect(leaksOutside(BASE, { ...category, roles: { r1: { a: VIEW, d: 0n } } }, closedChannel, [role])).toBe(false);
  });

  it("drops one category for delete", () => {
    expect(withoutCategory([{ id: "a" }, { id: "b" }], "a")).toEqual([{ id: "b" }]);
    expect(withoutCategory(undefined, "a")).toEqual([]);
  });

  it("sends only changed category fields; an empty note clears it", () => {
    expect(categoryChanges({ title: "News", description: "x" }, { title: " News ", description: "x" })).toEqual({});
    expect(categoryChanges({ title: "News", description: "x" }, { title: "Talk ", description: "  " })).toEqual({ title: "Talk", description: "" });
  });
});

describe("channel form", () => {
  const initial = { name: "general", description: "hi", slowmode: 0, announcement: false, maxUsers: 0, roomName: "" };

  it("sends only dirty text fields and removes an emptied description", () => {
    expect(channelChanges(initial, { ...initial }, { voice: false, roomMaker: false })).toEqual({ remove: [] });
    expect(channelChanges(initial, { ...initial, name: " chat ", description: " " }, { voice: false, roomMaker: false })).toEqual({ name: "chat", remove: ["Description"] });
    expect(channelChanges(initial, { ...initial, slowmode: 30, announcement: true }, { voice: false, roomMaker: false })).toEqual({ slowmode: 30, announcement: true, remove: [] });
  });

  it("voice: user limit 0 means no limit, room name only for a room maker", () => {
    expect(channelChanges(initial, { ...initial, maxUsers: 5 }, { voice: true, roomMaker: false })).toEqual({ voice: { max_users: 5 }, remove: [] });
    expect(channelChanges({ ...initial, maxUsers: 5 }, { ...initial, maxUsers: 0 }, { voice: true, roomMaker: false })).toEqual({ voice: { max_users: 0 }, remove: [] });
    expect(channelChanges(initial, { ...initial, roomName: " {name}'s room " }, { voice: true, roomMaker: true })).toEqual({ voice: { room_name: "{name}'s room" }, remove: [] });
    expect(channelChanges(initial, { ...initial, roomName: "x" }, { voice: true, roomMaker: false })).toEqual({ remove: [] });
    // slowmode does not apply to voice
    expect(channelChanges(initial, { ...initial, slowmode: 5 }, { voice: true, roomMaker: false })).toEqual({ remove: [] });
  });

  it("clamps the user limit to 0–50", () => {
    expect(clampUserLimit(-3)).toBe(0);
    expect(clampUserLimit(99)).toBe(50);
    expect(clampUserLimit(7.4)).toBe(7);
    expect(clampUserLimit(NaN)).toBe(0);
  });

  it("reads room maker fields from the raw channel", () => {
    expect(roomMakerOf({ voice: { maker: true, room_name: "{name}" } })).toEqual({ maker: true, roomName: "{name}", temporary: false });
    expect(roomMakerOf({ voice: { temporary_for: "u1" } })).toEqual({ maker: false, roomName: "", temporary: true });
    expect(roomMakerOf(undefined)).toEqual({ maker: false, roomName: "", temporary: false });
  });

  it("formats slowmode durations", () => {
    expect(formatDuration(5, "en")).toBe("5 seconds");
    expect(formatDuration(300, "en")).toBe("5 minutes");
    expect(formatDuration(3600, "en")).toBe("1 hour");
  });
});

describe("access errors", () => {
  it("maps API error types to plain sentences", () => {
    expect(accessErrorKind("MissingPermission")).toBe("missing");
    expect(accessErrorKind("NotElevated")).toBe("elevated");
    expect(accessErrorKind("CannotGiveMissingPermissions")).toBe("give");
    expect(accessErrorKind("NotFound")).toBe("gone");
    expect(accessErrorKind("Unknown")).toBeUndefined();
  });
});
