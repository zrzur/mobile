import { MEMBER_ROW, PLATE_FADE, PLATE_RATIO, memberRowBox, plateCoverStops, plateFrame, plateInk, plateSource } from "../plate";

describe("plateFrame (web nameplateLayer)", () => {
  it("takes the row's height less 3 px above and below, at the art's shape", () => {
    const f = plateFrame();
    expect(MEMBER_ROW).toBe(44);
    expect(f.top).toBe(3);
    expect(f.height).toBe(38);
    expect(f.width).toBeCloseTo(38 * (448 / 84), 5);
    expect(f.end).toBe(8);
    expect(f.radius).toBe(10);
  });

  it("never grows wider than the row less 8 px on each side", () => {
    expect(plateFrame(44, 150).width).toBe(134);
    expect(plateFrame(44, 351).width).toBeCloseTo(38 * PLATE_RATIO, 5);
    expect(plateFrame(44, 10).width).toBe(0);
  });
});

describe("plateCoverStops (web --z-plate-fade as a cover)", () => {
  it("hides what the mask hides: 98 % at the start, nothing from the middle", () => {
    const stops = plateCoverStops(false);
    expect(stops).toHaveLength(PLATE_FADE.length);
    expect(stops[0]).toEqual({ offset: 0, opacity: 0.98 });
    expect(stops.at(-1)).toEqual({ offset: 0.5, opacity: 0 });
    // the plate comes in on an ease-in curve: the cover only ever thins
    for (let i = 1; i < stops.length; i++) expect(stops[i].opacity).toBeLessThanOrEqual(stops[i - 1].opacity);
  });

  it("starts on the right in right-to-left, in ascending offsets", () => {
    const stops = plateCoverStops(true);
    expect(stops[0]).toEqual({ offset: 0.5, opacity: 0 });
    expect(stops.at(-1)).toEqual({ offset: 1, opacity: 0.98 });
    for (let i = 1; i < stops.length; i++) expect(stops[i].offset).toBeGreaterThan(stops[i - 1].offset);
    // the mirror of the left-to-right cover
    const ltr = plateCoverStops(false);
    for (const stop of stops) expect(ltr.find((s) => Math.abs(s.offset - (1 - stop.offset)) < 1e-9)?.opacity).toBe(stop.opacity);
  });
});

describe("plateSource", () => {
  it("is nothing without a plate, or with one this app does not know", () => {
    expect(plateSource(undefined, "https://cdn", false)).toBeUndefined();
    expect(plateSource({}, "https://cdn", false)).toBeUndefined();
    expect(plateSource({ nameplate: "no-such-plate" }, "https://cdn", false)).toBeUndefined();
  });

  it("asks for the right-to-left copy of a built-in plate (its own address)", () => {
    const ltr = plateSource({ nameplate: "flag-eg" }, undefined, false);
    expect(ltr).toBe("https://app.zrzur.com/nameplates/flag-eg.svg");
    expect(plateSource({ nameplate: "flag-eg" }, undefined, true)).toBe(`${ltr}?rtl#rtl`);
  });

  it("shows a creator's plate as its still picture, the same in both directions", () => {
    const style = { nameplate: "c:abc", nameplate_file: "file_1" };
    expect(plateSource(style, "https://cdn.example", false)).toBe("https://cdn.example/decorations/file_1");
    expect(plateSource(style, "https://cdn.example", true)).toBe("https://cdn.example/decorations/file_1");
    expect(plateSource(style, undefined, false)).toBeUndefined();
  });
});

describe("plateInk (web --z-plate-ink)", () => {
  it("is white with a dark halo on dark themes", () => {
    expect(plateInk(true, "#111111")).toEqual({ color: "#FFFFFF", halo: "rgba(0,0,0,0.7)", radius: 4 });
  });
  it("is the theme's ink with a light halo on light themes", () => {
    const ink = plateInk(false, "#171925");
    expect(ink.color).toBe("#171925");
    expect(ink.halo).toMatch(/^rgba\(255,255,255/);
  });
});

describe("memberRowBox (web MenuButton on a phone)", () => {
  it("paints a 36 px box in a 44 px row", () => {
    for (const boxed of [true, false]) expect(MEMBER_ROW - memberRowBox(boxed).inset * 2).toBe(36);
  });
  it("lines up with the invite row inside the channel details' box", () => {
    expect(memberRowBox(true)).toMatchObject({ margin: 6, padStart: 8, padEnd: 8, gap: 12, radius: 12 });
  });
  it("keeps the sidebar's spacing on the member page", () => {
    expect(memberRowBox(false)).toMatchObject({ margin: 8, padStart: 14, padEnd: 8, gap: 8, radius: 10 });
  });
});
