import { createElement, Fragment } from "react";

import { glueEnd, isolate, lineDescent, lineFor, middleDrop, NBSP } from "../inlineRun";

describe("inline pieces in a line of text", () => {
  it("Arabic lines are 2 px taller", () => {
    expect(lineFor("en", 24)).toBe(24);
    expect(lineFor("ar", 24)).toBe(26);
  });

  it("a one-line pill moves down to the line's bottom (16 px text, line 24)", () => {
    // Latin: 12 + (0.275 - 1.025) * 8 = 6
    expect(lineDescent("en", 16, 24)).toBe(6);
    // Arabic font, line 26: 13 + (0.415 - 1.085) * 8 = 7.64 -> 7.5
    expect(lineDescent("ar", 16, 24)).toBe(7.5);
    expect(lineDescent("de", 16, 24)).toBe(6);
  });

  it("a pill moved down stays inside its line", () => {
    for (const locale of ["en", "ar"]) {
      const l = lineFor(locale, 24);
      const drop = lineDescent(locale, 16, 24);
      expect(drop).toBeGreaterThan(0);
      expect(drop).toBeLessThan(l / 2);
    }
  });

  it("a custom emoji is centred on the text like vertical-align: middle", () => {
    // 22 px picture: 11 - 0.516 * 8 = 6.87 -> 7
    expect(middleDrop("en", 16, 22)).toBe(7);
    expect(middleDrop("en", 16, 16)).toBe(4);
  });

  it("the sentence's last space becomes a no-break space", () => {
    expect(glueEnd("started a call that lasted ")).toBe(`started a call that lasted${NBSP}`);
    expect(glueEnd("no space")).toBe("no space");
    const pill = createElement("span", { key: "p" }, "Sam ");
    const out = glueEnd([pill, " started a call that lasted "]) as unknown[];
    expect(out[0]).toBe(pill);
    expect(out[1]).toBe(` started a call that lasted${NBSP}`);
  });

  it("Arabic word order: the trailing space is still glued", () => {
    const pill = createElement("span", { key: "p" }, "سامي");
    const out = glueEnd(["بدأ ", pill, " مكالمة استمرت "]) as unknown[];
    expect(out[2]).toBe(`مكالمة استمرت${NBSP}`.replace(/^/, " "));
  });

  it("a pill at the end is left alone; a fragment is looked into", () => {
    const pill = createElement("span", { key: "p" }, "Sam ");
    expect((glueEnd(["from ", pill]) as unknown[])[1]).toBe(pill);
    const frag = createElement(Fragment, null, "lasted ");
    const glued = glueEnd(frag) as { props: { children: unknown } };
    expect(glued.props.children).toBe(`lasted${NBSP}`);
  });

  it("names are isolated in their own direction", () => {
    expect(isolate("سامي")).toBe("⁨سامي⁩");
    expect(isolate("")).toBe("");
  });
});
