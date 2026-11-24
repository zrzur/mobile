import {
  afterReason,
  canToggleRole,
  clearMutualCache,
  detailsOk,
  errorType,
  friendGroups,
  groupMembers,
  interestsAt,
  isUserId,
  linkDomain,
  linkName,
  moderationActions,
  mutualFor,
  nameRowBadges,
  offeredSubs,
  parseHttps,
  profileBadgeIds,
  safeProfileLinks,
  serviceUrl,
  statusLine,
  stepBack,
  toggledRoles,
  visibleSections,
} from "../logic";
import { closeProfile, leaveLayer, openProfile, openUserMenu, profileStore, showLayer } from "../store";

describe("sections", () => {
  it("keeps the owner's order and drops unknown ids", () => {
    expect(visibleSections(["links", "bogus", "about"])).toEqual(["links", "about"]);
    expect(visibleSections(undefined)).toHaveLength(7);
    expect(visibleSections([])).toEqual([]);
  });
  it("draws interests where the first of games/connections sits", () => {
    expect(interestsAt(["about", "connections", "games"])).toBe("connections");
    expect(interestsAt(["about"])).toBeUndefined();
  });
});

describe("links", () => {
  it("accepts only plain https addresses", () => {
    expect(parseHttps("https://github.com/zrzur")).toEqual({ href: "https://github.com/zrzur", host: "github.com" });
    expect(parseHttps("http://github.com")).toBeUndefined();
    expect(parseHttps("https://user:pw@github.com")).toBeUndefined();
    expect(parseHttps("https://127.0.0.1/x")).toBeUndefined();
    expect(parseHttps("https://localhost")).toBeUndefined();
    expect(parseHttps("javascript:alert(1)")).toBeUndefined();
    expect(parseHttps(42)).toBeUndefined();
    expect(safeProfileLinks(["https://x.com/a", "ftp://a.b", null])).toHaveLength(1);
  });
  it("names known sites and never a lookalike", () => {
    expect(linkName("www.youtube.com")).toBe("YouTube");
    expect(linkName("instagram.xyz")).toBe("instagram.xyz");
    expect(linkName("blog.example.co.uk")).toBe("Example");
    expect(linkDomain("mail.google.com")).toBe("google.com");
  });
  it("opens a service's own pages only", () => {
    expect(serviceUrl("github", "https://github.com/a")).toBe("https://github.com/a");
    expect(serviceUrl("github", "https://evil.com/a")).toBeUndefined();
    expect(serviceUrl("github", "https://github.com:8443/a")).toBeUndefined();
    expect(serviceUrl("battlenet", "https://battle.net")).toBeUndefined();
  });
});

describe("badges and status", () => {
  it("orders badges by priority, none for bots", () => {
    expect(profileBadgeIds(16 | 1, false)).toEqual(["founder", "developer"]);
    expect(profileBadgeIds(16, true)).toEqual([]);
    expect(nameRowBadges(["a", "b", "c", "d"], "card")).toEqual(["a", "b", "c"]);
    expect(nameRowBadges(["a", "b", "c", "d"], "full")).toHaveLength(4);
  });
  it("joins the emoji and the text, leaving out custom emoji ids", () => {
    expect(statusLine("🎮", " playing ")).toBe("🎮 playing");
    expect(statusLine("01HZZZZZZZZZZZZZZZZZZZZZZZ", "x")).toBe("x");
    expect(statusLine(undefined, null)).toBe("");
  });
});

describe("member list", () => {
  const roles = [
    { id: "admin", name: "Admin", hoist: true },
    { id: "quiet", name: "Quiet", hoist: false },
    { id: "mod", name: "Mod", hoist: true },
  ];
  it("groups by the highest hoisted role, then online, then offline", () => {
    const rows = groupMembers(
      [
        { id: "1", name: "Zed", online: true, roles: ["mod", "admin"] },
        { id: "2", name: "amy", online: true, roles: ["mod"] },
        { id: "3", name: "Bob", online: true, roles: ["quiet"] },
        { id: "4", name: "Cat", online: false, roles: ["admin"] },
      ],
      roles,
      { online: "Online", offline: "Offline" },
    );
    expect(rows.map((r) => (r.kind === "title" ? `#${r.name}:${r.count}` : r.id))).toEqual(["#Admin:1", "1", "#Mod:1", "2", "#Online:1", "3", "#Offline:1", "4"]);
    expect(rows.at(-1)).toMatchObject({ kind: "member", online: false });
  });
  it("draws no empty groups", () => {
    expect(groupMembers([], roles, { online: "Online", offline: "Offline" })).toEqual([]);
  });
});

describe("friends", () => {
  const people = [
    { id: "a", name: "Ali", username: "ali", relationship: "Friend", online: true },
    { id: "b", name: "Bea", username: "bea", relationship: "Friend", online: false },
    { id: "c", name: "Cy", username: "cy", relationship: "Incoming", online: true },
    { id: "d", name: "Di", username: "di", relationship: "Outgoing", online: false },
    { id: "e", name: "Ed", username: "ed", relationship: "Blocked", online: true },
  ];
  it("lists each tab", () => {
    expect(friendGroups(people, "online", "")).toEqual([{ kind: "friend", ids: ["a"] }]);
    expect(friendGroups(people, "all", "")[0].ids).toEqual(["a", "b"]);
    expect(friendGroups(people, "pending", "")).toEqual([
      { kind: "incoming", ids: ["c"] },
      { kind: "outgoing", ids: ["d"] },
    ]);
    expect(friendGroups(people, "blocked", "")[0].ids).toEqual(["e"]);
  });
  it("searches names and usernames, and drops empty request groups", () => {
    expect(friendGroups(people, "all", "BE")[0].ids).toEqual(["b"]);
    expect(friendGroups(people, "pending", "cy")).toEqual([{ kind: "incoming", ids: ["c"] }]);
    expect(friendGroups(people, "pending", "zzz")).toEqual([]);
  });
});

describe("moderation", () => {
  const perms = { assignRoles: true, timeout: true, kick: true, ban: true, memberKnown: true };
  it("offers actions only on lower-ranked others", () => {
    expect(moderationActions({ self: false, member: true, owner: false, inferior: true, perms })).toEqual({ roles: true, timeout: true, kick: true, ban: true, banUser: false });
    expect(moderationActions({ self: false, member: true, owner: false, inferior: false, perms })).toMatchObject({ roles: false, kick: false, ban: false });
    expect(moderationActions({ self: true, member: true, owner: false, inferior: false, perms })).toMatchObject({ roles: true, timeout: false });
    expect(moderationActions({ self: false, member: false, owner: false, inferior: false, perms: { ...perms, memberKnown: false } }).banUser).toBe(true);
  });
  it("toggles roles as the API allows", () => {
    expect(canToggleRole({ rank: 5, managed: false }, false, 2)).toBe(true);
    expect(canToggleRole({ rank: 1, managed: false }, false, 2)).toBe(false);
    expect(canToggleRole({ rank: 1, managed: false }, true, 2)).toBe(true);
    expect(canToggleRole({ rank: 9, managed: true }, true, 2)).toBe(false);
    expect(toggledRoles(["a", "gone"], "b", (id) => id !== "gone")).toEqual(["a", "b"]);
    expect(toggledRoles(["a", "b"], "a", () => true)).toEqual(["b"]);
  });
});

describe("report flow", () => {
  const harassment = { category: "Harassment", subcategories: ["bullying", "flashing"], needs_description: true };
  it("offers flashing only for community items", () => {
    expect(offeredSubs(harassment, "User")).toEqual(["bullying"]);
    expect(offeredSubs(harassment, "CommunityItem")).toEqual(["bullying", "flashing"]);
    expect(afterReason({ category: "Spam" }, "User")).toBe("details");
    expect(afterReason(harassment, "User")).toBe("sub");
  });
  it("goes back keeping the path", () => {
    expect(stepBack("review", true)).toBe("details");
    expect(stepBack("details", true)).toBe("sub");
    expect(stepBack("details", false)).toBe("reason");
    expect(stepBack("sub", true)).toBe("reason");
  });
  it("needs ten characters when a description is required", () => {
    expect(detailsOk(harassment, undefined, "short")).toBe(false);
    expect(detailsOk(harassment, undefined, "long enough text")).toBe(true);
    expect(detailsOk(harassment, "flashing", "")).toBe(true);
    expect(detailsOk({ category: "Spam" }, undefined, "")).toBe(true);
  });
  it("reads the API error type", () => {
    expect(errorType({ type: "TooManyReports" })).toBe("TooManyReports");
    expect(errorType('{"type":"NotFound"}')).toBe("NotFound");
    expect(errorType("nope")).toBeUndefined();
  });
});

describe("mutual cache", () => {
  beforeEach(clearMutualCache);
  it("asks once a minute per viewer and person", async () => {
    const fetcher = jest.fn().mockResolvedValue({ servers: ["s"], users: undefined });
    await expect(mutualFor(fetcher, "me", "u", 0)).resolves.toEqual({ servers: ["s"], users: [] });
    await mutualFor(fetcher, "me", "u", 30_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await mutualFor(fetcher, "me", "u", 61_000);
    await mutualFor(fetcher, "other", "u", 61_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("forgets a refusal", async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error("blocked")).mockResolvedValue({ servers: [], users: [] });
    await expect(mutualFor(fetcher, "me", "u", 0)).resolves.toBeNull();
    await expect(mutualFor(fetcher, "me", "u", 1)).resolves.toEqual({ servers: [], users: [] });
  });
  it("knows a user id", () => {
    expect(isUserId("01HZZZZZZZZZZZZZZZZZZZZZZZ")).toBe(true);
    expect(isUserId("hello")).toBe(false);
  });
});

describe("profile host store", () => {
  afterEach(closeProfile);
  it("opens the profile and returns to it from a step", () => {
    openProfile("u", "s");
    expect(profileStore.get()).toEqual({ userId: "u", serverId: "s", layer: "profile" });
    showLayer("menu");
    showLayer("kick");
    expect(profileStore.get()).toMatchObject({ layer: "kick", back: "profile" });
    leaveLayer();
    expect(profileStore.get()).toMatchObject({ layer: "profile" });
    leaveLayer();
    expect(profileStore.get()).toBeNull();
  });
  it("closes a step opened from the menu alone", () => {
    openUserMenu("u");
    showLayer("report");
    leaveLayer();
    expect(profileStore.get()).toBeNull();
  });
  it("tells listeners", () => {
    const fn = jest.fn();
    const off = profileStore.subscribe(fn);
    openProfile("x");
    off();
    openProfile("y");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
