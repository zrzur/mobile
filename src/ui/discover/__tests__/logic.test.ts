import {
  askedGroups,
  askedPermissions,
  browsePage,
  commandsIn,
  detailGroups,
  findLocal,
  fromBot,
  fromServer,
  hasBit,
  inviteQuery,
  isPaidListing,
  listedCommands,
  listingBadge,
  listingMark,
  mergeResults,
  normalise,
  once,
  plainDescription,
  queryString,
  safeLink,
  toggleBit,
  ulidTime,
  type Listing,
} from "../logic";

const listing = (id: string, extra: Partial<Listing> = {}): Listing => ({ kind: "servers", id, name: id, verified: false, featured: false, tags: [], count: 0, ...extra });

describe("listings", () => {
  it("reads servers with their flags", () => {
    const l = fromServer({ _id: "s1", name: "S", member_count: 12, flags: 1, tags: ["a"], online_count: 3, link: "my-s" });
    expect(l).toMatchObject({ kind: "servers", id: "s1", count: 12, verified: true, official: true, online: 3, link: "my-s", tags: ["a"] });
    expect(fromServer({ _id: "s2", name: "S", member_count: 1, flags: 2 })).toMatchObject({ verified: true, official: false });
    expect(fromServer({ _id: "s3", name: "S", member_count: 1, description: null }).description).toBeUndefined();
  });

  it("reads bots", () => {
    expect(fromBot({ _id: "b1", username: "Helper", server_count: 4, verified: true })).toMatchObject({ kind: "bots", name: "Helper", count: 4, verified: true, tags: [] });
  });

  it("leaves empty query values out", () => {
    expect(queryString({ query: "a b", sort: "new", tag: "", limit: 24, featured: true })).toBe("?query=a%20b&sort=new&limit=24&featured=true");
    expect(queryString({})).toBe("");
  });
});

describe("marks", () => {
  it("picks the strongest mark", () => {
    expect(listingMark({ promoted: true, boost: "MegaBoost" })).toBe("promoted");
    expect(listingMark({ boost: "MegaBoost" })).toBe("headline");
    expect(listingMark({ boost: "SuperBoost" })).toBe("spotlight");
    expect(listingMark({ boost: "Boost" })).toBe("boosted");
    expect(listingMark({ featured: true })).toBe("picked");
    expect(listingMark({})).toBeUndefined();
  });

  it("marks every paid place as an ad, never hand-picked", () => {
    expect(isPaidListing({ boost: "Boost" })).toBe(true);
    expect(isPaidListing({ featured: true })).toBe(false);
  });

  it("gives one badge", () => {
    expect(listingBadge({ kind: "servers", verified: true, official: true })).toBe("server_official");
    expect(listingBadge({ kind: "servers", verified: true })).toBe("server_verified");
    expect(listingBadge({ kind: "bots", verified: true })).toBe("bot_verified");
    expect(listingBadge({ kind: "bots" })).toBeUndefined();
  });
});

describe("search", () => {
  it("folds Arabic the way people type it", () => {
    expect(normalise("أحمد  الكبيرة")).toBe("احمد الكبيره");
    expect(normalise("مُحَمَّد")).toBe("محمد");
  });

  it("ranks names first and needs every word", () => {
    const items = [listing("1", { name: "Chess club", tags: ["games"] }), listing("2", { name: "Games night" }), listing("3", { name: "Art", description: "we play chess" })];
    expect(findLocal(items, "chess").map((i) => i.id)).toEqual(["1", "3"]);
    expect(findLocal(items, "games").map((i) => i.id)).toEqual(["2", "1"]);
    expect(findLocal(items, "chess night")).toEqual([]);
  });

  it("merges and dedupes", () => {
    expect(mergeResults([listing("a")], [listing("b"), listing("a")]).map((i) => i.id)).toEqual(["a", "b"]);
    const seen = new Set<string>();
    expect(once([listing("a"), listing("a")], seen).length).toBe(1);
    expect(once([listing("a"), listing("b")], seen).map((i) => i.id)).toEqual(["b"]);
  });

  it("shows each listing once on the browse page, the headline first", () => {
    const head = listing("h", { boost: "MegaBoost" });
    const page = browsePage({ popular: [head, listing("p")], featured: [listing("p"), listing("f")], fresh: [listing("n")], topRow: [listing("t"), head] });
    expect(page.paid?.id).toBe("h");
    expect(page.topRow.map((i) => i.id)).toEqual(["t"]);
    expect(page.picked.map((i) => i.id)).toEqual(["p", "f"]);
    expect(page.list.map((i) => i.id)).toEqual(["n"]);
  });
});

describe("bot pages", () => {
  it("finds commands its description names, never pieces of a link", () => {
    expect(commandsIn("Use /play and /skip. See https://x.io/help or /a")).toEqual(["play", "skip"]);
    expect(commandsIn("اكتب و/مساعدة")).toEqual(["مساعدة"]);
  });

  it("lists registered commands in the reader's language", () => {
    const registered = [
      { name: "play", description: "Play", description_localizations: { ar: "تشغيل" } },
      { name: "menu", type: "Message" },
    ];
    expect(listedCommands(registered, undefined, "ar-SY")).toEqual({ source: "registered", items: [{ name: "play", description: "تشغيل" }] });
    expect(listedCommands(undefined, "try /hi", "en").source).toBe("description");
  });

  it("keeps descriptions as plain words", () => {
    expect(plainDescription("# Hi\n**bold** [link](https://x.y) ||secret||")).toBe("Hi bold link …");
    expect(plainDescription(null)).toBe("");
  });

  it("only links web addresses", () => {
    expect(safeLink("https://a.b")).toBe("https://a.b");
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
  });

  it("reads when a bot was registered", () => {
    expect(ulidTime("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(1469918176385);
    expect(ulidTime("nope")).toBeUndefined();
  });
});

describe("bot permissions", () => {
  it("asks for the link's permissions, else the bot's own", () => {
    expect(askedPermissions({ defaultPermissions: 8 }, 4)).toBe(4);
    expect(askedPermissions({ defaultPermissions: 8 })).toBe(8);
    expect(askedPermissions({ defaultPermissions: 0 }, -1)).toBeUndefined();
  });

  it("ticks bits past 2^31", () => {
    const big = 2 ** 37;
    expect(hasBit(big + 1, big)).toBe(true);
    expect(toggleBit(big + 1, big)).toBe(1);
    expect(toggleBit(1, big)).toBe(big + 1);
  });

  it("always names the permissions for a server", () => {
    expect(inviteQuery(true, 0)).toBe("?permissions=0");
    expect(inviteQuery(true)).toBe("?permissions=0");
    expect(inviteQuery(false, 8)).toBe("");
  });

  it("groups what is asked and hides nothing", () => {
    const asked = 2 ** 1 + 2 ** 22 + 2 ** 50;
    expect(askedGroups(asked)).toEqual([
      { id: "server", bits: [2 ** 1] },
      { id: "messages", bits: [2 ** 22] },
      { id: "other", bits: [2 ** 50] },
    ]);
    expect(detailGroups(asked).map((g) => g.id)).toEqual(["server", "messages"]);
    expect(detailGroups(undefined)).toEqual([]);
  });
});
