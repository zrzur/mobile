import { foldText, textMatches } from "../fold";
import { cleanPlaces, placeFromPath, withVisit } from "../recentPlaces";
import { channelListed, nextIndex, nextUnread, parseQuery, rankItems, type SwitchItem, withFolds } from "../switcher";

// hoisted by jest above the imports
jest.mock("@/chat/persist", () => ({ jsonFile: () => ({ read: async () => ({}), write: () => {} }) }));

const ID = (n: number) => `01ARZ3NDEKTSV4RRFFQ69G5F${String(n).padStart(2, "0")}`.slice(0, 26);

describe("foldText (Arabic folding)", () => {
  it("folds alef forms, tashkeel, tatweel, ta marbuta and ya", () => {
    expect(foldText("أُسامة")).toBe(foldText("اسامه"));
    expect(foldText("إسـلام")).toBe("اسلام");
    expect(foldText("مصطفى")).toBe("مصطفي");
  });
  it("folds digits, case, accents and invisible marks", () => {
    expect(foldText("١٢٣")).toBe("123");
    expect(foldText("Café  OK")).toBe("cafe ok");
    expect(foldText("a‏b")).toBe("ab");
  });
  it("matches every word, with or without the article", () => {
    expect(textMatches("كتاب جديد", "الكتاب")).toBe(true);
    expect(textMatches("Zrzur team", "team zr")).toBe(true);
    expect(textMatches("Zrzur", "other")).toBe(false);
    expect(textMatches("anything", "   ")).toBe(true);
  });
});

const item = (id: string, kind: SwitchItem["kind"], name: string, extra: Partial<SwitchItem> = {}): SwitchItem =>
  withFolds({ id, kind, name, unread: false, mentions: 0, updatedAt: 0, ...extra });

describe("Go to ranking", () => {
  const items = [
    item("1", "channel", "general", { place: "Zrzur" }),
    item("2", "conversation", "أسامة", { place: "Direct message", updatedAt: 5 }),
    item("3", "server", "Gamers", { unread: true }),
    item("4", "friend", "Lina", { mentions: 0 }),
    item("5", "channel", "announcements", { place: "Gamers", mentions: 2 }),
  ];

  it("reads the kind marks", () => {
    expect(parseQuery("#gen")).toEqual({ kinds: ["channel"], text: "gen" });
    expect(parseQuery(" @ li")).toEqual({ kinds: ["conversation", "friend"], text: "li" });
    expect(parseQuery("*x").kinds).toEqual(["server"]);
    expect(parseQuery("plain")).toEqual({ text: "plain" });
  });

  it("with nothing typed: recents, then mentions, then unread, then the rest", () => {
    expect(rankItems(items, "", ["4"]).map((i) => i.id)).toEqual(["4", "5", "3", "2", "1"]);
  });

  it("finds folded Arabic names", () => {
    expect(rankItems(items, "اسامه").map((i) => i.id)).toEqual(["2"]);
  });

  it("puts names that start with the text before names that hold it, then places", () => {
    expect(rankItems(items, "gam").map((i) => i.id)).toEqual(["3", "5"]);
  });

  it("narrows by kind", () => {
    expect(rankItems(items, "#").map((i) => i.id).sort()).toEqual(["1", "5"]);
    expect(rankItems(items, "*gam").map((i) => i.id)).toEqual(["3"]);
  });

  it("stops at the limit", () => {
    expect(rankItems(items, "", [], 2)).toHaveLength(2);
  });

  it("lists only channels the person may open", () => {
    expect(channelListed({ type: "TextChannel", server: {}, havePermission: () => true })).toBe(true);
    expect(channelListed({ type: "TextChannel", server: {}, havePermission: () => false })).toBe(false);
    expect(channelListed({ type: "DirectMessage", active: false })).toBe(false);
    expect(channelListed({ type: "Group" })).toBe(true);
    expect(channelListed({ type: "VoiceChannel" })).toBe(false);
  });
});

describe("next unread", () => {
  it("wraps around and never returns the current item", () => {
    expect(nextIndex(4, 3, 1)).toBe(0);
    expect(nextIndex(4, 0, -1)).toBe(3);
    expect(nextIndex(1, 0, 1)).toBe(-1);
    expect(nextIndex(0, -1, 1)).toBe(-1);
    expect(nextIndex(5, -1, 1, (i) => i === 2)).toBe(2);
  });

  it("goes to mentions first, then unread", () => {
    const list = [
      { id: "a", unread: true, mentions: 0 },
      { id: "b", unread: true, mentions: 3 },
      { id: "c", unread: true, mentions: 0 },
    ];
    expect(nextUnread(list, undefined)?.id).toBe("b");
    expect(nextUnread(list, "b")?.id).toBe("c");
    expect(nextUnread([], undefined)).toBeUndefined();
  });
});

describe("recent places", () => {
  it("reads a place from a page address", () => {
    expect(placeFromPath(`/channel/${ID(1)}`)).toBe(ID(1));
    expect(placeFromPath(`/server/${ID(2)}`)).toBe(ID(2));
    expect(placeFromPath(`/thread/${ID(3)}/`)).toBe(ID(3));
    expect(placeFromPath("/home")).toBeUndefined();
    expect(placeFromPath(`/channel-settings/${ID(1)}`)).toBeUndefined();
  });

  it("keeps the newest first, once, at most twelve", () => {
    let list: string[] = [];
    for (let n = 0; n < 14; n++) list = withVisit(list, ID(n));
    expect(list).toHaveLength(12);
    expect(list[0]).toBe(ID(13));
    expect(withVisit(list, ID(5))[0]).toBe(ID(5));
    expect(withVisit(list, ID(5)).filter((id) => id === ID(5))).toHaveLength(1);
  });

  it("drops anything malformed when reading the file", () => {
    expect(cleanPlaces({ [ID(1)]: [ID(2), "bad", 3], nope: [ID(2)] })).toEqual({ [ID(1)]: [ID(2)] });
    expect(cleanPlaces(null)).toEqual({});
    expect(cleanPlaces([1])).toEqual({});
  });
});
