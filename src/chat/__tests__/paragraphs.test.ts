import { parseInline } from "../markdown";
import { directionText, paragraphRuns, splitInlineLines } from "../paragraphs";

const USER = "01J0000000000000000000000A";

describe("splitInlineLines", () => {
  it("cuts text at line breaks and keeps empty lines", () => {
    expect(splitInlineLines([{ t: "text", v: "a\n\nb" }])).toEqual([[{ t: "text", v: "a" }], [], [{ t: "text", v: "b" }]]);
  });

  it("repeats formatting that spans lines", () => {
    expect(splitInlineLines(parseInline("**one\ntwo**"))).toEqual([[{ t: "bold", c: [{ t: "text", v: "one" }] }], [{ t: "bold", c: [{ t: "text", v: "two" }] }]]);
  });

  it("keeps mentions and links on their line", () => {
    const lines = splitInlineLines(parseInline(`hi <@${USER}>\nsee https://zrzur.com`));
    expect(lines).toHaveLength(2);
    expect(lines[0][1]).toEqual({ t: "user", id: USER });
    expect(lines[1][1]).toEqual({ t: "link", url: "https://zrzur.com" });
  });
});

describe("directionText (what sets a line's direction)", () => {
  it("leaves mentions out, like dir=auto skips children with their own dir", () => {
    expect(directionText(parseInline(`<@${USER}> في مشكلة`))).toBe(" في مشكلة");
  });

  it("reads formatting, code and link labels", () => {
    expect(directionText(parseInline("**bold** `x` [label](https://a.b)"))).toBe("bold x label");
  });
});

describe("paragraphRuns", () => {
  it("an Arabic server description with link lines is one right-to-left run", () => {
    const text = "سيرفر زرزور الرسمي\n\n**الروابط الرسمية**\n- الموقع: https://zrzur.com\n- المطوّرون: https://developers.zrzur.com";
    const runs = paragraphRuns(parseInline(text), "ltr");
    expect(runs).toHaveLength(1);
    expect(runs[0].dir).toBe("rtl");
    expect(runs[0].lines).toHaveLength(5);
  });

  it("mixed messages split into runs", () => {
    const runs = paragraphRuns(parseInline("Welcome!\nأهلاً بكم\nBye"), "rtl");
    expect(runs.map((r) => r.dir)).toEqual(["ltr", "rtl", "ltr"]);
  });

  it("a mention-led Arabic line reads right to left", () => {
    expect(paragraphRuns(parseInline(`<@${USER}> في مشكلة في autoreplies`), "ltr")[0].dir).toBe("rtl");
  });

  it("only emoji or digits: the layout's direction", () => {
    expect(paragraphRuns(parseInline("🔥 123"), "rtl")[0].dir).toBe("rtl");
    expect(paragraphRuns(parseInline("🔥 123"), "ltr")[0].dir).toBe("ltr");
  });
});
