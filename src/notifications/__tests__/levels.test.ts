import {
  MENTIONS_EVERYONE,
  MUTE_MINUTES,
  channelMuted,
  channelState,
  cleanOptions,
  defaultOptions,
  effectiveServerState,
  mentionsForNotification,
  muteFor,
  parseOptions,
  pushAllowed,
  shouldNotify,
  withEntry,
} from "../levels";

const NOW = 1_700_000_000_000;

describe("cleanOptions (web: NotificationOptions.clean)", () => {
  it("keeps valid levels and drops unknown ones", () => {
    const out = cleanOptions({ server: { a: "all", b: "loud" }, channel: { c: "none" } }, NOW);
    expect(out.server).toEqual({ a: "all" });
    expect(out.channel).toEqual({ c: "none" });
  });

  it("moves the legacy muted level to the mute maps", () => {
    const out = cleanOptions({ server: { a: "muted" }, channel: { c: "muted" } }, NOW);
    expect(out.server_mutes).toEqual({ a: {} });
    expect(out.channel_mutes).toEqual({ c: {} });
    expect(out.server).toEqual({});
  });

  it("drops mutes that ran out and keeps forever mutes", () => {
    const out = cleanOptions({ channel_mutes: { old: { until: NOW - 1 }, soon: { until: NOW + 10 }, ever: {} } }, NOW);
    expect(out.channel_mutes).toEqual({ soon: { until: NOW + 10 }, ever: {} });
  });

  it("keeps only true/false suppress flags", () => {
    const out = cleanOptions({ suppress_everyone: { a: true, b: "yes" }, suppress_roles: { c: false } }, NOW);
    expect(out.suppress_everyone).toEqual({ a: true });
    expect(out.suppress_roles).toEqual({ c: false });
  });

  it("reads a broken synced value as the defaults", () => {
    expect(parseOptions("{nope", NOW)).toEqual(defaultOptions());
    expect(parseOptions(undefined, NOW)).toEqual(defaultOptions());
    expect(parseOptions(JSON.stringify({ server: { s: "mention" } }), NOW).server).toEqual({ s: "mention" });
  });
});

describe("levels", () => {
  it("a server uses its own choice, else its default, else mentions only", () => {
    expect(effectiveServerState("none", "All")).toBe("none");
    expect(effectiveServerState(undefined, "All")).toBe("all");
    expect(effectiveServerState(undefined, "Mentions")).toBe("mention");
    expect(effectiveServerState(undefined, undefined)).toBe("mention");
  });

  it("a channel inherits its server; DMs and groups default to all", () => {
    let o = withEntry(defaultOptions(), "server", "s", "none");
    expect(channelState(o, { id: "c", type: "TextChannel", serverId: "s" })).toBe("none");
    o = withEntry(o, "channel", "c", "all");
    expect(channelState(o, { id: "c", type: "TextChannel", serverId: "s" })).toBe("all");
    expect(channelState(o, { id: "dm", type: "DirectMessage" })).toBe("all");
  });

  it("withEntry with undefined removes the entry and leaves the input alone", () => {
    const a = withEntry(defaultOptions(), "channel", "c", "all");
    const b = withEntry(a, "channel", "c", undefined);
    expect(a.channel).toEqual({ c: "all" });
    expect(b.channel).toEqual({});
  });
});

describe("mutes", () => {
  it("offers the web's lengths", () => {
    expect([...MUTE_MINUTES]).toEqual([15, 60, 180, 480, 1440, undefined]);
  });

  it("a timed mute runs out; a forever mute does not", () => {
    expect(muteFor(15, NOW)).toEqual({ until: NOW + 15 * 60_000 });
    expect(muteFor(undefined, NOW)).toEqual({});
    const o = withEntry(defaultOptions(), "channel_mutes", "c", muteFor(15, NOW));
    expect(channelMuted(o, "c", undefined, NOW + 60_000)).toBe(true);
    expect(channelMuted(o, "c", undefined, NOW + 16 * 60_000)).toBe(false);
  });

  it("a muted server mutes its channels", () => {
    const o = withEntry(defaultOptions(), "server_mutes", "s", {});
    expect(channelMuted(o, "c", "s", NOW)).toBe(true);
    expect(channelMuted(o, "c", undefined, NOW)).toBe(false);
  });
});

describe("mentionsForNotification", () => {
  const base = { selfId: "me", mentionIds: [], flags: 0, mentionsMyRole: false, suppressEveryone: false, suppressRoles: false };
  it("a mention by name always counts", () => {
    expect(mentionsForNotification({ ...base, mentionIds: ["me"], suppressEveryone: true, suppressRoles: true })).toBe(true);
  });
  it("@everyone counts unless suppressed", () => {
    expect(mentionsForNotification({ ...base, flags: MENTIONS_EVERYONE })).toBe(true);
    expect(mentionsForNotification({ ...base, flags: MENTIONS_EVERYONE, suppressEveryone: true })).toBe(false);
  });
  it("a role mention counts unless suppressed", () => {
    expect(mentionsForNotification({ ...base, mentionsMyRole: true })).toBe(true);
    expect(mentionsForNotification({ ...base, mentionsMyRole: true, suppressRoles: true })).toBe(false);
  });
});

describe("shouldNotify (web: NotificationsWorker)", () => {
  const base = {
    selfId: "me",
    authorId: "you",
    authorBlocked: false,
    channelId: "c",
    channelType: "TextChannel" as const,
    serverId: "s",
    serverDefault: "All" as const,
    viewingChannelId: undefined,
    appActive: true,
    mentioned: false,
    presence: "Online",
    options: defaultOptions(),
    now: NOW,
  };
  it("notifies for a message in an all-messages server", () => {
    expect(shouldNotify(base)).toBe(true);
  });
  it("never for own messages, the open channel, blocked people or saved notes", () => {
    expect(shouldNotify({ ...base, authorId: "me" })).toBe(false);
    expect(shouldNotify({ ...base, viewingChannelId: "c" })).toBe(false);
    expect(shouldNotify({ ...base, authorBlocked: true })).toBe(false);
    expect(shouldNotify({ ...base, channelType: "SavedMessages", serverId: undefined })).toBe(false);
  });
  it("follows mutes and levels", () => {
    expect(shouldNotify({ ...base, options: withEntry(defaultOptions(), "server_mutes", "s", {}) })).toBe(false);
    expect(shouldNotify({ ...base, serverDefault: "Mentions" })).toBe(false);
    expect(shouldNotify({ ...base, serverDefault: "Mentions", mentioned: true })).toBe(true);
    expect(shouldNotify({ ...base, options: withEntry(defaultOptions(), "channel", "c", "none"), mentioned: true })).toBe(false);
  });
  it("Busy hides everything, Focus everything but mentions", () => {
    expect(shouldNotify({ ...base, presence: "Busy", mentioned: true })).toBe(false);
    expect(shouldNotify({ ...base, presence: "Focus" })).toBe(false);
    expect(shouldNotify({ ...base, presence: "Focus", mentioned: true })).toBe(true);
  });
});

describe("pushAllowed (closed app)", () => {
  it("drops pushes for muted or None channels", () => {
    const o = defaultOptions();
    expect(pushAllowed({ options: o, channelId: "c", serverId: "s", now: NOW })).toBe(true);
    expect(pushAllowed({ options: withEntry(o, "channel_mutes", "c", {}), channelId: "c", now: NOW })).toBe(false);
    expect(pushAllowed({ options: withEntry(o, "server", "s", "none"), channelId: "c", serverId: "s", now: NOW })).toBe(false);
    expect(pushAllowed({ options: withEntry(o, "channel", "dm", "none"), channelId: "dm", now: NOW })).toBe(false);
  });
});
