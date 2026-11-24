// The phone's own Designs logic: the wall's grid, the try-on store, the
// style helpers, the addresses and deep links, the API query.
import { linkHref, parseDeepLink, systemPath } from "@/notifications/links";

import { listQuery, withoutNull } from "../api";
import { GAP, ROW, columnsFor, packGrid, spanOf } from "../grid";
import { designsHref, slugView } from "../routes";
import {
  DECORATIONS,
  EFFECT_IDS,
  NAMEPLATES,
  decorationUrl,
  nameplateUrl,
  sameStyle,
  sendableStyle,
  userStyleOf,
  wearsAll,
} from "../style";
import { createTryOnStore, showsSaved, wornParts } from "../tryOn";

describe("the wall's grid", () => {
  it("has 12 columns on a wide screen and 6 below 900 px", () => {
    expect(columnsFor(1180)).toBe(12);
    expect(columnsFor(899)).toBe(6);
    expect(columnsFor(390)).toBe(6);
  });

  it("puts every tile across the whole page on a phone, keeping its height", () => {
    for (const kind of [
      "look",
      "frame",
      "plate",
      "effect",
      "card",
      "type",
      "ink",
      "maker",
      "mood",
      "open",
    ] as const)
      expect(spanOf(kind, false, 390).cols).toBe(6);
    expect(spanOf("frame", true, 390).rows).toBe(4);
    expect(spanOf("card", false, 390).rows).toBe(6);
    expect(spanOf("type", false, 390).rows).toBe(1);
  });

  it("keeps the web's mixed shapes on an iPad", () => {
    expect(spanOf("frame", false, 820)).toEqual({ cols: 3, rows: 2 });
    expect(spanOf("look", false, 820)).toEqual({ cols: 6, rows: 3 });
    expect(spanOf("card", false, 820)).toEqual({ cols: 4, rows: 6 });
    expect(spanOf("ink", false, 820)).toEqual({ cols: 3, rows: 1 });
    expect(spanOf("paint", false, 820)).toEqual({ cols: 6, rows: 3 });
    expect(spanOf("plate", false, 1180)).toEqual({ cols: 4, rows: 2 });
  });

  it("stacks full-width tiles one under the other", () => {
    const { boxes, height } = packGrid(
      [
        { cols: 6, rows: 2 },
        { cols: 6, rows: 1 },
      ],
      6,
      358,
    );
    expect(boxes[0]).toEqual({ x: 0, y: 0, width: 358, height: 2 * ROW + GAP });
    expect(boxes[1].y).toBe(2 * (ROW + GAP));
    expect(height).toBe(3 * ROW + 2 * GAP);
  });

  it("fills a hole with a later small tile, as dense CSS grids do", () => {
    const { boxes } = packGrid(
      [
        { cols: 3, rows: 2 },
        { cols: 6, rows: 1 },
        { cols: 3, rows: 2 },
      ],
      6,
      600,
    );
    // the wide tile cannot fit beside the first, the small one can
    expect(boxes[2]).toMatchObject({ y: 0 });
    expect(boxes[2].x).toBeGreaterThan(0);
    expect(boxes[1].y).toBe(2 * (ROW + GAP));
  });

  it("is empty for no tiles", () => {
    expect(packGrid([], 6, 300)).toEqual({ boxes: [], height: 0 });
  });
});

describe("the try-on store", () => {
  it("starts from your profile with the first Designs screen and forgets with the last", () => {
    const store = createTryOnStore();
    const leaveA = store.retain({ decoration: "laurel" });
    const leaveB = store.retain({ decoration: "other" });
    expect(store.get().draft).toEqual({ decoration: "laurel" });
    leaveA();
    expect(store.get().draft).toBeDefined();
    leaveB();
    expect(store.get().draft).toBeUndefined();
  });

  it("puts a design on with a tap and takes it off with the next", () => {
    const store = createTryOnStore();
    store.retain({});
    expect(store.toggle({ decoration: "laurel" }, "Laurel")).toBe(true);
    expect(store.get().lastName).toBe("Laurel");
    expect(store.get().landed).toBe(1);
    expect(store.wearing({ decoration: "laurel" })).toBe(true);
    expect(store.toggle({ decoration: "laurel" })).toBe(false);
    expect(store.get().draft?.decoration).toBeUndefined();
    expect(store.get().lastName).toBeUndefined();
  });

  it("saves what is on, remembers the profile before for Undo, and puts it back", async () => {
    const store = createTryOnStore();
    store.retain({ theme: ["#111111", "#222222"] });
    store.put({ nameplate: "ocean" });
    const sent: unknown[] = [];
    const edit = async (style: unknown) => void sent.push(style);
    expect(await store.save({ theme: ["#111111", "#222222"] }, edit)).toBe(
      true,
    );
    expect(sent[0]).toEqual({
      theme: ["#111111", "#222222"],
      nameplate: "ocean",
    });
    expect(store.get().saved).toEqual({ theme: ["#111111", "#222222"] });
    await store.undo(edit);
    expect(sent[1]).toEqual({ theme: ["#111111", "#222222"] });
    expect(store.get().saved).toBeUndefined();
    expect(store.get().draft).toEqual({ theme: ["#111111", "#222222"] });
  });

  it("keeps the saved note for the whole of an Undo, until the profile is back", async () => {
    const store = createTryOnStore();
    store.retain({});
    store.put({ decoration: "laurel" });
    await store.save({}, async () => {});
    // saved, and the profile now matches what is on
    expect(showsSaved(store.get(), false)).toBe(true);
    let finish = () => {};
    const sent = new Promise<void>((resolve) => (finish = resolve));
    const undone = store.undo(() => sent);
    // the draft is already back, so it differs from the profile; the note stays
    expect(store.get().saving).toBe(true);
    expect(showsSaved(store.get(), true)).toBe(true);
    finish();
    await undone;
    expect(showsSaved(store.get(), false)).toBe(false);
    // a failed Undo leaves the note off and shows the error instead
    store.put({ decoration: "laurel" });
    await store.save({}, async () => {});
    await store.undo(async () => {
      throw { type: "InternalError" };
    });
    expect(showsSaved(store.get(), true)).toBe(false);
    expect(store.get().error).toBeDefined();
  });

  it("keeps the failure and stops saving when the server refuses", async () => {
    const store = createTryOnStore();
    store.retain({});
    const refused = { type: "FailedValidation" };
    expect(
      await store.save({}, async () => {
        throw refused;
      }),
    ).toBe(false);
    expect(store.get().error).toBe(refused);
    expect(store.get().saving).toBe(false);
    store.put({ decoration: "laurel" });
    expect(store.get().error).toBeUndefined();
  });

  it("resets to your profile", () => {
    const store = createTryOnStore();
    store.retain({ decoration: "laurel" });
    store.put({ decoration: "ivy", nameplate: "ocean" });
    store.reset({ decoration: "laurel" });
    expect(store.get().draft).toEqual({ decoration: "laurel" });
  });

  it("lists the pieces you have on, each with what takes it off", () => {
    const parts = wornParts({
      decoration: "laurel",
      nameplate: "ocean",
      theme: ["#111111"],
      name_font: "default",
      name_colour: ["#ffffff"],
      effect: "snow",
    });
    expect(parts.map((part) => part.key)).toEqual([
      "decoration",
      "nameplate",
      "effect",
      "theme",
      "colour",
    ]);
    expect(parts[0].clear).toEqual({
      decoration: undefined,
      decoration_file: undefined,
    });
  });
});

describe("style helpers", () => {
  it("knows the design pack as well as the first designs", () => {
    expect(DECORATIONS).toContain("laurel");
    expect(DECORATIONS).toContain("rank-gold");
    expect(NAMEPLATES.some((plate) => plate.id === "arcade-night")).toBe(true);
    expect(EFFECT_IDS).toContain("coin-rush");
  });

  it("sends the choices only, with a creator's effect keeping its file", () => {
    expect(
      sendableStyle({
        decoration: "c:1",
        decoration_file: "f",
        theme: [],
        effect: "c:2",
        effect_file: "e",
        name_font: "bold",
      }),
    ).toEqual({
      decoration: "c:1",
      effect: "c:2",
      effect_file: "e",
      name_font: "bold",
    });
  });

  it("reads a user's style and drops a design this app does not know", () => {
    expect(
      userStyleOf({
        style: {
          decoration: "gone-forever",
          nameplate: "ocean",
          theme: ["#ff0000", "bad"],
          effect: "c:9",
          effect_file: "x",
        },
      }),
    ).toEqual({
      nameplate: "ocean",
      theme: ["#ff0000"],
      effect: "c:9",
      effect_file: "x",
    });
    expect(userStyleOf(undefined)).toEqual({});
  });

  it("compares styles by what shows", () => {
    expect(sameStyle({ name_font: "default" }, {})).toBe(true);
    expect(sameStyle({ decoration: "laurel" }, {})).toBe(false);
    expect(
      sameStyle(
        { decoration: "laurel", decoration_file: "a" },
        { decoration: "laurel" },
      ),
    ).toBe(true);
  });

  it("knows when a design is on your profile", () => {
    expect(
      wearsAll(
        { theme: ["#1", "#2"], decoration: "laurel" },
        { theme: ["#1", "#2"] },
      ),
    ).toBe(true);
    expect(wearsAll({ decoration: "laurel" }, { decoration: "ivy" })).toBe(
      false,
    );
    expect(wearsAll(undefined, { decoration: "laurel" })).toBe(false);
  });

  it("finds the picture of a decoration and a nameplate", () => {
    expect(decorationUrl({ decoration: "laurel" }, "https://cdn")).toBe(
      "https://app.zrzur.com/decorations/laurel.svg",
    );
    expect(
      decorationUrl(
        { decoration: "c:1", decoration_file: "abc" },
        "https://cdn",
      ),
    ).toBe("https://cdn/decorations/abc/original");
    expect(
      decorationUrl(
        { decoration: "c:1", decoration_file: "abc" },
        "https://cdn",
        false,
      ),
    ).toBe("https://cdn/decorations/abc");
    expect(
      decorationUrl(
        { decoration: "c:1", decoration_file: "../x" },
        "https://cdn",
      ),
    ).toBeUndefined();
    expect(nameplateUrl({ nameplate: "ocean" }, "https://cdn")).toBe(
      "https://app.zrzur.com/nameplates/ocean.svg",
    );
    expect(
      nameplateUrl({ nameplate: "not-a-plate" }, "https://cdn"),
    ).toBeUndefined();
  });
});

describe("Designs addresses", () => {
  it("opens every web address on its phone screen", () => {
    expect(designsHref([])).toBe("/designs");
    expect(designsHref(["looks"])).toBe("/designs/looks");
    expect(designsHref(["decoration-laurel"])).toBe(
      "/designs/decoration-laurel",
    );
    expect(designsHref(["01JC3V9X8Q2W5E7R4T6Y1Z0P9A"])).toBe(
      "/designs/01JC3V9X8Q2W5E7R4T6Y1Z0P9A",
    );
    expect(designsHref(["creators"])).toBe("/designs/creators");
    expect(designsHref(["favourites"])).toBe("/designs/favourites");
    expect(designsHref(["creator", "01ABC"])).toBe("/designs/creator/01ABC");
    expect(designsHref(["creator"])).toBe("/designs/creators");
    expect(designsHref(["studio", "drafts"])).toBe("/designs");
    expect(designsHref(["nothing-here"])).toBe("/designs");
  });

  it("tells a kind of the wall from a design's page", () => {
    expect(slugView("nameplates")).toEqual({
      page: "wall",
      filter: "nameplates",
    });
    expect(slugView("look-ember")).toEqual({
      page: "design",
      slug: "look-ember",
    });
    expect(slugView("all")).toEqual({ page: "home" });
    expect(slugView(undefined)).toEqual({ page: "home" });
  });

  it("reads Designs links from the web app, the public site and the app's scheme", () => {
    expect(parseDeepLink("https://app.zrzur.com/designs/look-ember")).toEqual({
      kind: "designs",
      href: "/designs/look-ember",
    });
    expect(
      parseDeepLink("https://designs.zrzur.com/decoration-laurel?hl=ar"),
    ).toEqual({ kind: "designs", href: "/designs/decoration-laurel" });
    expect(parseDeepLink("https://designs.zrzur.com/")).toEqual({
      kind: "designs",
      href: "/designs",
    });
    expect(parseDeepLink("zrzur://designs/creator/01ABC")).toEqual({
      kind: "designs",
      href: "/designs/creator/01ABC",
    });
    expect(linkHref({ kind: "designs", href: "/designs/creators" })).toBe(
      "/designs/creators",
    );
    expect(systemPath("https://app.zrzur.com/designs/nameplates")).toBe(
      "/designs/nameplates",
    );
    expect(systemPath("/designs/favourites")).toBe("/designs/favourites");
  });
});

describe("the community API", () => {
  it("asks with the set values only", () => {
    expect(
      listQuery({
        query: "fire ring",
        sort: "popular",
        favourites: undefined,
        limit: 48,
        offset: undefined,
      }),
    ).toBe("?query=fire%20ring&sort=popular&limit=48");
    expect(listQuery({})).toBe("");
  });

  it("drops null fields, deeply", () => {
    expect(
      withoutNull({ a: null, b: { c: null, d: 1 }, e: [{ f: null }] }),
    ).toEqual({ b: { d: 1 }, e: [{}] });
  });
});
