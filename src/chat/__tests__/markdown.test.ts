import { isEmojiOnly, parseInline, parseMessage } from "../markdown";

const ID = "01HZX5Q6W8K3M2N4P5R6S7T8V9";

describe("message text", () => {
  it("keeps plain text as it is", () => {
    expect(parseInline("hello there")).toEqual([{ t: "text", v: "hello there" }]);
  });

  it("reads bold, italic, underline, strike, spoiler and code", () => {
    expect(parseInline("**b** *i* __u__ ~~s~~ ||x|| `c`")).toEqual([
      { t: "bold", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "italic", c: [{ t: "text", v: "i" }] },
      { t: "text", v: " " },
      { t: "underline", c: [{ t: "text", v: "u" }] },
      { t: "text", v: " " },
      { t: "strike", c: [{ t: "text", v: "s" }] },
      { t: "text", v: " " },
      { t: "spoiler", c: [{ t: "text", v: "x" }] },
      { t: "text", v: " " },
      { t: "code", v: "c" },
    ]);
  });

  it("does not format inside code or across spaces", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ t: "code", v: "**not bold**" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
    expect(parseInline("snake_case_name")).toEqual([{ t: "text", v: "snake_case_name" }]);
  });

  it("finds mentions, channels, roles and custom emoji", () => {
    expect(parseInline(`hi <@${ID}> in <#${ID}> <@&${ID}> :${ID}:`)).toEqual([
      { t: "text", v: "hi " },
      { t: "user", id: ID },
      { t: "text", v: " in " },
      { t: "channel", id: ID },
      { t: "text", v: " " },
      { t: "role", id: ID },
      { t: "text", v: " " },
      { t: "emoji", id: ID },
    ]);
  });

  it("finds links, with and without a label, without the full stop after them", () => {
    expect(parseInline("see https://zrzur.com/guide.")).toEqual([
      { t: "text", v: "see " },
      { t: "link", url: "https://zrzur.com/guide" },
      { t: "text", v: "." },
    ]);
    expect(parseInline("[Guide](https://zrzur.com/guide)")).toEqual([
      { t: "link", url: "https://zrzur.com/guide", label: "Guide" },
    ]);
  });

  it("keeps escaped marks as text", () => {
    expect(parseInline("\\*not italic\\*")).toEqual([{ t: "text", v: "*not italic*" }]);
  });

  it("splits code blocks and quotes from paragraphs", () => {
    expect(parseMessage("look:\n```js\nconst a = 1;\n```\n> quoted\nafter")).toEqual([
      { t: "para", c: [{ t: "text", v: "look:" }] },
      { t: "codeblock", lang: "js", v: "const a = 1;" },
      { t: "quote", c: [{ t: "text", v: "quoted" }] },
      { t: "para", c: [{ t: "text", v: "after" }] },
    ]);
  });

  it("works in Arabic", () => {
    expect(parseInline("مرحبًا **يا** صديقي")).toEqual([
      { t: "text", v: "مرحبًا " },
      { t: "bold", c: [{ t: "text", v: "يا" }] },
      { t: "text", v: " صديقي" },
    ]);
  });

  it("knows a message of only emoji", () => {
    expect(isEmojiOnly(parseMessage("😀🎉"))).toBe(true);
    expect(isEmojiOnly(parseMessage(`:${ID}: :${ID}:`))).toBe(true);
    expect(isEmojiOnly(parseMessage("hi 😀"))).toBe(false);
  });
});
