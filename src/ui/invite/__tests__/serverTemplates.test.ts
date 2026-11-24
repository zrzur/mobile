import {
  NAME_LIMIT,
  PERMISSION,
  TemplateTimeout,
  clip,
  defaultServerName,
  landedServer,
  localiseTemplate,
  openingChannel,
  openingRoom,
  pickableServerTemplates,
  previousStep,
  serverBlueprint,
  tailorServerTemplate,
  withTimeout,
} from "../serverTemplates";

describe("templates", () => {
  it("offers the web's ready-made starts", () => {
    expect(pickableServerTemplates().map((t) => t.id)).toEqual(["gaming", "friends"]);
  });

  it("builds a flat server for friends from scratch", () => {
    const t = tailorServerTemplate("custom", "friends");
    expect(t.flat).toBe(true);
    const b = serverBlueprint(t);
    expect(b.categories).toEqual([]);
    expect(b.channels.map((c) => [c.name, c.type])).toEqual([
      ["General", "Text"],
      ["Hangout", "Voice"],
    ]);
    expect(b.roles).toEqual([]);
  });

  it("builds a staffed community from scratch", () => {
    const b = serverBlueprint(tailorServerTemplate("custom", "community"), "icon1");
    expect(b.icon).toBe("icon1");
    expect(b.categories.map((c) => c.title)).toEqual(["Start here", "Community", "Hang out"]);
    const rules = b.categories[0].channels.find((c) => c.name === "rules");
    expect(rules).toEqual({ name: "rules", type: "Text", read_only: true, rules: true });
    expect(b.roles.map((r) => r.name)).toEqual(["Moderators", "Members"]);
    expect(b.roles[0].allow).toBe(PERMISSION.ManageMessages + PERMISSION.TimeoutMembers + PERMISSION.KickMembers + PERMISSION.AssignRoles);
    expect(b.roles[1]).toMatchObject({ hoist: false, posts_in_read_only: false, allow: 0 });
  });

  it("cuts a template to the answer", () => {
    expect(tailorServerTemplate("gaming", "friends").groups.map((g) => g.key)).toEqual(["chat", "voice"]);
    const friends = tailorServerTemplate("friends", "community");
    expect(friends.groups[0].key).toBe("start");
    expect(friends.roles?.map((r) => r.key)).toEqual(["moderators"]);
    expect(tailorServerTemplate("gaming", "skip").groups).toHaveLength(3);
  });

  it("opens on the first room people can write in", () => {
    const gaming = tailorServerTemplate("gaming", "community");
    expect(openingRoom(gaming)).toBe("general");
    const channels = [
      { id: "1", name: "rules" },
      { id: "2", name: "General" },
    ];
    expect(openingChannel(gaming, channels)).toBe("2");
    expect(openingChannel(gaming, [{ id: "9", name: "x" }])).toBe("9");
    expect(openingChannel(gaming, [])).toBeUndefined();
  });

  it("puts the names in the person's language", () => {
    const local = localiseTemplate(tailorServerTemplate("custom", "community"), { General: "عام", "Start here": "ابدأ هنا", Moderators: "المشرفون" });
    expect(local.groups[0].name).toBe("ابدأ هنا");
    expect(local.groups[1].rooms[0].name).toBe("عام");
    expect(local.roles?.[0].name).toBe("المشرفون");
    // keys stay, so read-only and rules rooms still match
    expect(serverBlueprint(local).categories[0].channels[0].rules).toBe(true);
  });
});

describe("server name", () => {
  it("never splits a character", () => {
    expect(clip("ab😀c", 3)).toBe("ab");
    expect(clip("abc", 10)).toBe("abc");
  });

  it("starts from the person's name within the limit", () => {
    const own = (name: string) => `${name}'s server`;
    expect(defaultServerName("Sam", own)).toBe("Sam's server");
    const long = defaultServerName("A".repeat(60), own);
    expect(long.length).toBeLessThanOrEqual(NAME_LIMIT);
    expect(long.endsWith("'s server")).toBe(true);
  });
});

describe("timeouts", () => {
  it("fails with TemplateTimeout when no answer comes", async () => {
    await expect(withTimeout(() => new Promise(() => {}), 5)).rejects.toBeInstanceOf(TemplateTimeout);
    await expect(withTimeout(async () => 7, 50)).resolves.toBe(7);
  });

  it("finds a server that landed after a timeout", () => {
    const servers = [
      { id: "old", ownerId: "me" },
      { id: "new", ownerId: "me" },
      { id: "theirs", ownerId: "you" },
    ];
    expect(landedServer(servers, "me", new Set(["old"]))?.id).toBe("new");
    expect(landedServer(servers, "me", new Set(["old", "new"]))).toBeUndefined();
  });
});

describe("previousStep", () => {
  it("goes back one step, and closes from the start", () => {
    expect(previousStep("start")).toBeUndefined();
    expect(previousStep("audience")).toBe("start");
    expect(previousStep("yours")).toBe("audience");
    expect(previousStep("join")).toBe("start");
    expect(previousStep("invite")).toBe("join");
  });
});
