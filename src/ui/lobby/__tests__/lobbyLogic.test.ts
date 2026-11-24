import { DEFAULT_SECTIONS } from "@/ui/settings/lobby";

import {
  filterFaq,
  greetingKind,
  introChannel,
  isLive,
  lobbyLook,
  mix,
  jumpBack,
  type LobbyChannel,
  lobbySections,
  mainChannels,
  memberCount,
  newcomers,
  newsChannel,
  parseSteps,
  phoneOrder,
  showStart,
  staffGroups,
  startSteps,
  ulidTime,
  voiceRooms,
  WEEK,
} from "../lobbyLogic";

const ch = (id: string, over: Partial<LobbyChannel> = {}): LobbyChannel => ({
  id,
  name: id,
  voice: false,
  announcement: false,
  readable: true,
  canSend: true,
  unread: false,
  mentions: 0,
  voiceUsers: [],
  ...over,
});

describe("sections", () => {
  it("uses the default order, none when hidden, else the managers' order", () => {
    expect(lobbySections(undefined)).toEqual(DEFAULT_SECTIONS);
    expect(lobbySections({ hide_sections: true, sections: ["News"] })).toEqual([]);
    expect(lobbySections({ sections: ["Team", "News"] })).toEqual(["Team", "News"]);
  });
  it("puts live, newcomers and team after the reading sections on a phone", () => {
    expect(phoneOrder(DEFAULT_SECTIONS)).toEqual({ main: ["Start", "News", "About", "Channels", "Questions"], side: ["Live", "Newcomers", "Team"] });
  });
});

describe("ulid times", () => {
  it("decodes the time part", () => {
    // the same value as the ulid package decodeTime
    expect(ulidTime("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(1469922850259);
    expect(ulidTime("not-a-ulid!")).toBe(0);
  });
  it("is live within five minutes", () => {
    const t = ulidTime("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(isLive("01ARZ3NDEKTSV4RRFFQ69G5FAV", t + 60_000)).toBe(true);
    expect(isLive("01ARZ3NDEKTSV4RRFFQ69G5FAV", t + 600_000)).toBe(false);
    expect(isLive(undefined, t)).toBe(false);
  });
});

describe("channels", () => {
  const list = [ch("a", { lastMessageId: "01B" }), ch("b", { lastMessageId: "01D" }), ch("v", { voice: true, voiceUsers: ["u"] }), ch("hidden", { readable: false, lastMessageId: "01Z" }), ch("c", { lastMessageId: "01C", unread: true }), ch("m", { mentions: 2, unread: true })];
  it("shows the chosen readable channels, else the newest text channels", () => {
    expect(mainChannels(list, ["c", "hidden", "a"], undefined).map((c) => c.id)).toEqual(["c", "a"]);
    expect(mainChannels(list, [], 2).map((c) => c.id)).toEqual(["b", "c"]);
  });
  it("jumps back to mentions first, then unread", () => {
    expect(jumpBack(list).map((c) => c.id)).toEqual(["m", "c"]);
  });
  it("lists voice rooms with people", () => {
    expect(voiceRooms(list).map((c) => c.id)).toEqual(["v"]);
  });
  it("finds where to say hello only where one can write", () => {
    expect(introChannel(list, "b", undefined, [])?.id).toBe("b");
    expect(introChannel([ch("r", { canSend: false })], "r", undefined, [])).toBeUndefined();
    expect(introChannel(list, undefined, "c", [])?.id).toBe("c");
    expect(introChannel(list, undefined, undefined, [list[0]])?.id).toBe("a");
  });
  it("takes the news channel, else the first announcement channel", () => {
    expect(newsChannel([ch("x"), ch("ann", { announcement: true })], undefined)?.id).toBe("ann");
    expect(newsChannel([ch("x"), ch("ann", { announcement: true })], "x")?.id).toBe("x");
    expect(newsChannel([ch("x")], undefined)).toBeUndefined();
  });
});

describe("start here", () => {
  it("ticks off rules once read and keeps device ticks", () => {
    const steps = startSteps({ rules: ch("r", { unread: false }), rulesReadKnown: true, hello: ch("h"), hasAvatar: false, done: ["hello"] });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["rules", true],
      ["hello", true],
      ["profile", false],
    ]);
    expect(showStart(steps)).toBe(true);
  });
  it("hides with one step or all done", () => {
    expect(showStart(startSteps({ rulesReadKnown: false, hasAvatar: false, done: [] }))).toBe(false);
    expect(showStart(startSteps({ hello: ch("h"), rulesReadKnown: false, hasAvatar: true, done: ["hello"] }))).toBe(false);
  });
  it("reads stored steps safely", () => {
    expect(parseSteps('["rules","nope","voice"]')).toEqual(["rules", "voice"]);
    expect(parseSteps("{")).toEqual([]);
    expect(parseSteps(null)).toEqual([]);
  });
});

describe("people", () => {
  const now = 10 * WEEK;
  const members = [
    { userId: "o", name: "Owner", joinedAt: 0, roles: ["mod"], bot: false },
    { userId: "a", name: "A", joinedAt: now - 1000, roles: ["mod"], bot: false },
    { userId: "b", name: "B", joinedAt: now - 2000, roles: ["admin", "mod"], bot: false },
    { userId: "bot", name: "Bot", joinedAt: now - 10, roles: [], bot: true },
  ];
  it("lists this week's arrivals newest first, without bots", () => {
    expect(newcomers(members, now).map((m) => m.userId)).toEqual(["a", "b"]);
  });
  it("groups the owner, then roles by rank, nobody twice", () => {
    const groups = staffGroups({ id: "o", name: "Owner" }, [
      { id: "mod", name: "Mod", rank: 5 },
      { id: "admin", name: "Admin", rank: 1 },
    ], members);
    expect(groups.map((g) => [g.key, g.people.map((p) => p.id)])).toEqual([
      ["owner", ["o"]],
      ["admin", ["b"]],
      ["mod", ["a"]],
    ]);
  });
  it("counts the larger of snapshot and fetched list", () => {
    expect(memberCount(10, 12)).toBe(12);
    expect(memberCount(10, undefined)).toBe(10);
  });
  it("greets new members and those coming back", () => {
    expect(greetingKind(now - 1000, now)).toBe("new");
    expect(greetingKind(0, now)).toBe("back");
  });
});

describe("questions", () => {
  it("filters by question or answer", () => {
    const faq = [
      { question: "How to join voice?", answer: "Tap a room" },
      { question: "Rules?", answer: "Be kind" },
    ];
    expect(filterFaq(faq, "kind")).toHaveLength(1);
    expect(filterFaq(faq, " VOICE ")).toHaveLength(1);
    expect(filterFaq(faq, "")).toHaveLength(2);
  });
});

describe("appearance", () => {
  const valid = (c?: string | null): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  const inkOn = (hex: string) => (hex === "#000000" ? "#FFFFFF" : "#101116");
  const contrast = () => 5;
  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#000000", 1)).toBe("#ff0000");
  });
  it("uses the app's colours when nothing is set", () => {
    expect(lobbyLook(undefined, valid, inkOn, contrast)).toMatchObject({ accent: undefined, page: undefined, card: undefined, ink: undefined, radius: 14, bannerHeight: 180, gap: 12, banner: "Server" });
  });
  it("works out readable text and lifted cards from a page colour", () => {
    const look = lobbyLook({ accent: "#E0195F", appearance: { background: "#000000", banner_height: 90, density: "Compact", banner_mode: "Gradient", surface: "red" } }, valid, inkOn, contrast);
    expect(look).toMatchObject({ page: "#000000", ink: "#FFFFFF", card: mix("#000000", "#FFFFFF", 0.9), heading: "#E0195F", bannerHeight: 100, gap: 8, banner: "Gradient" });
  });
});
