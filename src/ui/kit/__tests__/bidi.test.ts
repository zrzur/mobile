import { FSI, PDI, autoDirStyle, directionRuns, firstStrongDirection, inputDirStyle, inputSideStyle, isLatinInput, isolate, isolateWithin, paragraphDirStyle, plainText, startsAtLayoutStart, textDirection } from "../bidi";

describe("firstStrongDirection (the web's dir=auto)", () => {
  it("takes the first strong letter", () => {
    expect(firstStrongDirection("Sara Haddad")).toBe("ltr");
    expect(firstStrongDirection("سارة حداد")).toBe("rtl");
    expect(firstStrongDirection("Sara سارة")).toBe("ltr");
    expect(firstStrongDirection("سارة Sara")).toBe("rtl");
    expect(firstStrongDirection("שרה")).toBe("rtl");
    expect(firstStrongDirection("Привет")).toBe("ltr");
    expect(firstStrongDirection("さくら")).toBe("ltr");
    expect(firstStrongDirection("小明")).toBe("ltr");
  });

  it("skips digits, punctuation, spaces and emoji", () => {
    expect(firstStrongDirection("  123 - 🔥 Sara")).toBe("ltr");
    expect(firstStrongDirection("🔥🔥 علي")).toBe("rtl");
    expect(firstStrongDirection("(#general)")).toBe("ltr");
    expect(firstStrongDirection("٣ علي")).toBe("rtl");
    expect(firstStrongDirection("١٢٣ Sam")).toBe("ltr");
  });

  it("reads letters outside the basic plane (fancy names)", () => {
    expect(firstStrongDirection("𝓢𝓪𝓻𝓪")).toBe("ltr");
  });

  it("is null without any letter", () => {
    expect(firstStrongDirection("")).toBeNull();
    expect(firstStrongDirection("12345")).toBeNull();
    expect(firstStrongDirection("🔥 ... ✨")).toBeNull();
  });

  it("honours the direction marks", () => {
    expect(firstStrongDirection("\u200f123 Sam")).toBe("rtl");
    expect(firstStrongDirection("\u200eسارة")).toBe("ltr");
  });
});

describe("textDirection", () => {
  it("falls back to the layout for text without letters", () => {
    expect(textDirection("2026", "rtl")).toBe("rtl");
    expect(textDirection("2026", "ltr")).toBe("ltr");
    expect(textDirection(undefined, "rtl")).toBe("rtl");
    expect(textDirection("Sara", "rtl")).toBe("ltr");
  });
});

describe("autoDirStyle", () => {
  it("phones: the base direction follows the text, alignment stays natural (the layout's start)", () => {
    expect(autoDirStyle("Sara Haddad", true, "ios")).toEqual({ writingDirection: "ltr", textAlign: "auto" });
    expect(autoDirStyle("سارة", false, "android")).toEqual({ writingDirection: "rtl", textAlign: "auto" });
  });

  it("web: names the layout's start side, since text-align:start would follow the text", () => {
    expect(autoDirStyle("Sara Haddad", true, "web")).toEqual({ writingDirection: "ltr", textAlign: "right" });
    expect(autoDirStyle("سارة", false, "web")).toEqual({ writingDirection: "rtl", textAlign: "left" });
    expect(autoDirStyle("123", true, "web")).toEqual({ writingDirection: "rtl", textAlign: "right" });
  });
});

describe("plainText", () => {
  it("joins string and number children, ignores elements", () => {
    expect(plainText("Sara")).toBe("Sara");
    expect(plainText(["sam", "#", 1234])).toBe("sam#1234");
    expect(plainText({ type: "View" })).toBe("");
  });
});

describe("isolates (the web's dir=auto skips children with their own dir)", () => {
  it("skips text inside an isolate when finding the first strong letter", () => {
    expect(firstStrongDirection(`${isolate("Sami")} في مشكلة`)).toBe("rtl");
    expect(firstStrongDirection(`${isolate("سارة")} joined`)).toBe("ltr");
    expect(firstStrongDirection(`${FSI}${isolate("a")}b${PDI} c`)).toBe("ltr");
    expect(firstStrongDirection(isolate("سارة"))).toBeNull();
  });

  it("isolate leaves empty text alone", () => {
    expect(isolate("")).toBe("");
    expect(isolate("x")).toBe(`${FSI}x${PDI}`);
  });

  it("isolateWithin: the name keeps its direction, the sentence follows the interface words", () => {
    const title = isolateWithin("Invite friends to ردهة زرزور", "ردهة زرزور");
    expect(title).toBe(`Invite friends to ${FSI}ردهة زرزور${PDI}`);
    expect(firstStrongDirection(title)).toBe("ltr");
    const ar = isolateWithin("ادعُ أصدقاءك إلى Zrzur Lounge", "Zrzur Lounge");
    expect(firstStrongDirection(ar)).toBe("rtl");
    // text that is only the name, or does not hold it, stays as it is
    expect(isolateWithin("سارة", "سارة")).toBe("سارة");
    expect(isolateWithin("Discover", "سارة")).toBe("Discover");
    expect(isolateWithin("Discover", undefined)).toBe("Discover");
    // not twice
    expect(isolateWithin(title, "ردهة زرزور")).toBe(title);
  });
});

describe("paragraphDirStyle (a paragraph on its own side, like a block with dir=auto)", () => {
  it("phones: left/right are the layout's start/end, so an Arabic paragraph in the English app is 'right'", () => {
    expect(paragraphDirStyle("مرحبا", false, "ios")).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(paragraphDirStyle("Hello", false, "ios")).toEqual({ writingDirection: "ltr", textAlign: "left" });
    expect(paragraphDirStyle("مرحبا", true, "android")).toEqual({ writingDirection: "rtl", textAlign: "left" });
    expect(paragraphDirStyle("Hello", true, "android")).toEqual({ writingDirection: "ltr", textAlign: "right" });
  });

  it("phones: text without letters stays with the layout", () => {
    expect(paragraphDirStyle("123 🔥", true, "ios")).toEqual({ writingDirection: "rtl", textAlign: "left" });
    expect(paragraphDirStyle("", false, "ios")).toEqual({ writingDirection: "ltr", textAlign: "left" });
  });

  it("web: names the real side", () => {
    expect(paragraphDirStyle("مرحبا", false, "web")).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(paragraphDirStyle("Hello", true, "web")).toEqual({ writingDirection: "ltr", textAlign: "left" });
  });

  it("a list line with a link reads as Arabic", () => {
    expect(paragraphDirStyle("- الموقع: https://zrzur.com", false, "ios").writingDirection).toBe("rtl");
    expect(startsAtLayoutStart("rtl", false)).toBe(false);
    expect(startsAtLayoutStart("rtl", true)).toBe(true);
  });
});

describe("directionRuns (each line is a bidi paragraph)", () => {
  it("one run for text in one direction", () => {
    expect(directionRuns(["مرحبا", "", "كيف الحال"], "ltr")).toEqual([{ dir: "rtl", from: 0, to: 3 }]);
    expect(directionRuns(["Hello"], "rtl")).toEqual([{ dir: "ltr", from: 0, to: 1 }]);
  });

  it("splits where the direction changes", () => {
    expect(directionRuns(["Hello", "مرحبا", "Bye"], "ltr")).toEqual([
      { dir: "ltr", from: 0, to: 1 },
      { dir: "rtl", from: 1, to: 2 },
      { dir: "ltr", from: 2, to: 3 },
    ]);
  });

  it("lines without letters keep the line before; a blank line before a change opens the next run", () => {
    expect(directionRuns(["سيرفر زرزور", "", "الروابط", "- الموقع: https://zrzur.com"], "ltr")).toEqual([{ dir: "rtl", from: 0, to: 4 }]);
    expect(directionRuns(["Hello", "🔥🔥", "", "مرحبا"], "ltr")).toEqual([
      { dir: "ltr", from: 0, to: 2 },
      { dir: "rtl", from: 2, to: 4 },
    ]);
    // a leading line without letters takes the first line that has some
    expect(directionRuns(["123", "مرحبا"], "ltr")).toEqual([{ dir: "rtl", from: 0, to: 2 }]);
  });

  it("text without any letter takes the fallback", () => {
    expect(directionRuns(["🔥", ""], "rtl")).toEqual([{ dir: "rtl", from: 0, to: 2 }]);
    expect(directionRuns([], "ltr")).toEqual([]);
  });
});

describe("inputDirStyle (a text field with dir=auto)", () => {
  it("an empty field starts at the app language's side", () => {
    expect(inputDirStyle("", { layoutRtl: true })).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(inputDirStyle(undefined, { layoutRtl: false })).toEqual({ writingDirection: "ltr", textAlign: "left" });
    expect(inputDirStyle(null, { layoutRtl: true, latin: true })).toEqual({ writingDirection: "rtl", textAlign: "right" });
  });

  it("typed Arabic starts from the right, even in the English app", () => {
    expect(inputDirStyle("م", { layoutRtl: false })).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(inputDirStyle("مرحبا Sara", { layoutRtl: false })).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(inputDirStyle("🔥 علي", { layoutRtl: false }).textAlign).toBe("right");
  });

  it("typed Latin starts from the left, even in the Arabic app", () => {
    expect(inputDirStyle("H", { layoutRtl: true })).toEqual({ writingDirection: "ltr", textAlign: "left" });
    expect(inputDirStyle("Hi سارة", { layoutRtl: true })).toEqual({ writingDirection: "ltr", textAlign: "left" });
  });

  it("follows each keystroke", () => {
    const steps = ["", "1", "12 ", "12 م", "12 مر"].map((v) => inputDirStyle(v, { layoutRtl: false }).textAlign);
    expect(steps).toEqual(["left", "left", "left", "right", "right"]);
  });

  it("text without letters keeps the app's side", () => {
    expect(inputDirStyle("123 🔥", { layoutRtl: true }).textAlign).toBe("right");
    expect(inputDirStyle("123 🔥", { layoutRtl: false }).textAlign).toBe("left");
  });

  it("a multi-line draft takes the first strong letter of the whole text", () => {
    expect(inputDirStyle("\n\nمرحبا\nHello", { layoutRtl: false }).writingDirection).toBe("rtl");
  });

  it("latin fields run left to right once typed", () => {
    expect(inputDirStyle("sara@zrzur.com", { layoutRtl: true, latin: true })).toEqual({ writingDirection: "ltr", textAlign: "left" });
    expect(inputDirStyle("كلمة", { layoutRtl: true, latin: true }).textAlign).toBe("left");
  });

  it("inputSideStyle names the real side", () => {
    expect(inputSideStyle("rtl")).toEqual({ writingDirection: "rtl", textAlign: "right" });
    expect(inputSideStyle("ltr")).toEqual({ writingDirection: "ltr", textAlign: "left" });
  });
});

describe("isLatinInput (fields that only hold Latin text)", () => {
  it("knows email, password, URL, number and code fields", () => {
    expect(isLatinInput({ keyboardType: "email-address" })).toBe(true);
    expect(isLatinInput({ keyboardType: "number-pad" })).toBe(true);
    expect(isLatinInput({ secureTextEntry: true })).toBe(true);
    expect(isLatinInput({ textContentType: "oneTimeCode" })).toBe(true);
    expect(isLatinInput({ autoComplete: "new-password" })).toBe(true);
    expect(isLatinInput({ keyboardType: "url" })).toBe(true);
  });

  it("leaves free text alone", () => {
    expect(isLatinInput({})).toBe(false);
    expect(isLatinInput({ keyboardType: "default", autoComplete: "off", textContentType: "none" })).toBe(false);
    expect(isLatinInput({ textContentType: "username" })).toBe(false);
  });
});
