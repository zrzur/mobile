import { contrast, mixColours, profileColours, weakestOn } from "../theme";

describe("profileColours", () => {
  it("draws nothing without two valid colours", () => {
    expect(profileColours(undefined)).toBeNull();
    expect(profileColours([])).toBeNull();
    expect(profileColours(["#12345", "#000000"])).toBeNull();
  });

  it.each([
    ["the audit's pink and navy", ["#7A1F5C", "#1E2A5E"]],
    ["teal and deep blue", ["#0F2027", "#1E3A5F"]],
    ["two pale colours", ["#F4F5F9", "#FFE7A0"]],
    ["white", ["#FFFFFF", "#FFFFFF"]],
    ["one colour", ["#55DCC8"]],
  ])("keeps every text of %s at AA on the whole gradient", (_name, chosen) => {
    const c = profileColours(chosen)!;
    expect(c).not.toBeNull();
    expect(weakestOn(c.ink, c)).toBeGreaterThanOrEqual(4.5);
    expect(weakestOn(c.ink2, c)).toBeGreaterThanOrEqual(4.5);
    expect(weakestOn(c.muted, c)).toBeGreaterThanOrEqual(4.5);
    // text on a chip and on the bubble
    expect(contrast(c.ink, c.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.muted, c.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ink, c.bubble)).toBeGreaterThanOrEqual(4.5);
  });

  it("mixes like a see-through layer", () => {
    expect(mixColours("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixColours("#102030", "#102030", 0.7)).toBe("#102030");
  });
});
