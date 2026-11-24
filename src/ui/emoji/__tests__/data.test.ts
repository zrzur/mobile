import { countryFlagCode, emojiCategories, EMOJI, searchEmoji, SHORTHAND, takesSkinTone, withSkinTone } from "../data";

describe("emoji data", () => {
  it("groups every emoji into the eight categories", () => {
    const cats = emojiCategories();
    expect(cats.map((c) => c.id)).toEqual(["people", "nature", "food", "travel", "activities", "objects", "symbols", "flags"]);
    expect(cats[0].emoji[0].emoji).toBe("😀");
    for (const c of cats) expect(c.emoji.length).toBeGreaterThan(0);
  });

  it("offers country flags only, Arab countries first, never IL", () => {
    const flags = emojiCategories().find((c) => c.id === "flags")!.emoji;
    expect(countryFlagCode(flags[0].emoji)).toBe("PS");
    expect(flags.every((f) => countryFlagCode(f.emoji))).toBe(true);
    expect(EMOJI.some((e) => e.emoji === "🇮🇱")).toBe(false);
  });

  it("searches shorthands, names starting with the query first", () => {
    const found = searchEmoji("joy");
    expect(found[0].emoji).toBe("😂");
    expect(searchEmoji("")).toEqual([]);
    expect(SHORTHAND["joy"].emoji).toBe("😂");
  });

  it("puts a skin tone on people and hands only", () => {
    expect(takesSkinTone("👍")).toBe(true);
    expect(withSkinTone("👍", 3)).toBe("👍🏽");
    expect(withSkinTone("✌️", 1)).toBe("✌🏻");
    expect(withSkinTone("😀", 3)).toBe("😀");
    expect(withSkinTone("👍", 0)).toBe("👍");
  });
});
