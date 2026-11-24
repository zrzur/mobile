import { botCommands, botStanding, creatorShown, localized, safeLink } from "../botAbout";

describe("a bot's profile sections", () => {
  it("only web addresses become links", () => {
    expect(safeLink("https://bot.example/privacy")).toBe("https://bot.example/privacy");
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink(undefined)).toBeUndefined();
  });

  it("a bot Zrzur runs is never called not verified", () => {
    expect(botStanding(true, false)).toBe("official");
    expect(botStanding(false, true)).toBe("verified");
    expect(botStanding(undefined, false)).toBe("unverified");
  });

  it("the owner sees themself; others see the maker only when shown", () => {
    expect(creatorShown(undefined, "owner", "owner")).toEqual({ kind: "self", id: "owner" });
    expect(creatorShown({ creator: { username: "sam", displayName: "Sam" } }, "owner", "me")).toEqual({ kind: "name", name: "Sam" });
    expect(creatorShown({ creator: { username: "sam" } }, "owner", "me")).toEqual({ kind: "name", name: "sam" });
    expect(creatorShown({}, "owner", "me")).toBeUndefined();
  });

  it("commands in the reader's language, this bot's chat commands only, by name", () => {
    const list = botCommands(
      [
        { _id: "2", application_id: "b", type: "ChatInput", name: "zeta", description: "Z", description_localizations: { ar: "ز" } },
        { _id: "1", application_id: "b", type: "ChatInput", name: "alpha", name_localizations: { ar: "ألف" } },
        { _id: "3", application_id: "other", type: "ChatInput", name: "x" },
        { _id: "4", application_id: "b", type: "User", name: "menu" },
      ],
      "b",
      "ar",
    );
    expect(list).toEqual([
      { id: "2", name: "zeta", description: "ز" },
      { id: "1", name: "ألف", description: "" },
    ]);
    expect(botCommands(undefined, "b", "en")).toEqual([]);
  });

  it("falls back from a regional language to its base", () => {
    expect(localized("hi", { ar: "مرحبا" }, "ar-EG")).toBe("مرحبا");
    expect(localized("hi", null, "ar")).toBe("hi");
  });
});
