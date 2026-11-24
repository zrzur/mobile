// Ported from the web app (interface/designs/gallery.test.ts), plus the phone's filter check
import {
  PAGE_TILES,
  isOn,
  isWallFilter,
  moreState,
  needsMore,
  takenOff,
  weave,
} from "../gallery";

const many = (name: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${name}${i}`);

describe("weave", () => {
  it("keeps every tile and the order inside each kind", () => {
    const wall = weave({ look: many("l", 3), frame: many("f", 5) });
    expect(wall).toHaveLength(8);
    expect(wall.filter((tile) => tile.startsWith("f"))).toEqual(many("f", 5));
  });

  it("gives a mixed wall from six designs", () => {
    const wall = weave({
      look: many("l", 2),
      frame: many("f", 2),
      plate: many("p", 2),
    });
    expect(wall.slice(0, 4)).toEqual(["l0", "f0", "f1", "p0"]);
    expect(wall).toHaveLength(6);
  });

  it("carries on with what is left when a kind runs out", () => {
    expect(weave({ frame: many("f", 40) })).toHaveLength(40);
  });

  it("handles six hundred designs without losing one", () => {
    const wall = weave({ frame: many("f", 450), plate: many("p", 150) });
    expect(new Set(wall).size).toBe(600);
  });

  it("does not hang on kinds outside the rhythm", () => {
    expect(weave({ frame: ["f"] }, ["look"])).toEqual([]);
    expect(weave({})).toEqual([]);
  });
});

describe("try-on helpers", () => {
  it("knows when a piece is on", () => {
    const style = { decoration: "gold", theme: ["#111111", "#222222"] };
    expect(isOn(style, { decoration: "gold" })).toBe(true);
    expect(isOn(style, { decoration: "ice" })).toBe(false);
    expect(isOn(style, { theme: ["#111111", "#222222"] })).toBe(true);
    expect(isOn(style, { theme: ["#111111"] })).toBe(false);
  });

  it("takes a piece off again", () => {
    expect(takenOff({ decoration: "gold" })).toEqual({ decoration: undefined });
  });
});

describe("needsMore", () => {
  it("asks only when the next page would not be full, once, while there is more", () => {
    expect(needsMore(24, 60, true, false)).toBe(false);
    expect(needsMore(40, 60, true, false)).toBe(true);
    expect(needsMore(40, 60, true, true)).toBe(false);
    expect(needsMore(40, 60, false, false)).toBe(false);
  });
});

describe("moreState", () => {
  it("offers more while some are hidden, even with nothing left to fetch", () => {
    expect(moreState(24, 60, false, false)).toBe("more");
    expect(moreState(24, 60, true, true)).toBe("more");
  });
  it("offers to fetch when everything loaded is shown but the server has more", () => {
    expect(moreState(48, 48, true, false)).toBe("more");
  });
  it("waits on the button while the next page is on its way", () => {
    expect(moreState(72, 48, true, true)).toBe("loading");
  });
  it("says it is the end only after a list longer than one page", () => {
    expect(moreState(48, 30, false, false)).toBe("end");
    expect(moreState(24, 10, false, false)).toBe("none");
    expect(moreState(24, 24, false, false)).toBe("none");
  });
  it("shows no foot before anything has loaded: the list has its own placeholders", () => {
    expect(moreState(24, 0, true, true)).toBe("none");
    expect(moreState(24, 0, false, false)).toBe("none");
  });
  it("the first page is about two screens of tiles", () => {
    expect(PAGE_TILES).toBe(24);
  });
});

describe("isWallFilter", () => {
  it("knows the kinds the wall can show, but not the whole wall itself", () => {
    for (const kind of [
      "looks",
      "decorations",
      "nameplates",
      "effects",
      "frames",
      "colours",
      "name",
      "community",
    ])
      expect(isWallFilter(kind)).toBe(true);
    for (const other of ["all", "creators", "studio", "", undefined])
      expect(isWallFilter(other)).toBe(false);
  });
});
