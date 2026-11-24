import { centredScrollX, detailsTabs, pickTab, stripOffset } from "../detailsTabs";

describe("centredScrollX (web scrollIntoView inline: center)", () => {
  it("puts the tapped tab in the middle of the strip", () => {
    // a 60 px tab at 300 in a 390 px strip of 600: its middle (330) at 195
    expect(centredScrollX(300, 60, 390, 600)).toBe(135);
  });
  it("does not scroll before the start", () => {
    expect(centredScrollX(10, 80, 390, 600)).toBe(0);
  });
  it("does not scroll past the end", () => {
    expect(centredScrollX(540, 60, 390, 600)).toBe(210);
  });
  it("stays put when everything fits", () => {
    expect(centredScrollX(200, 60, 390, 380)).toBe(0);
  });
});

describe("detailsTabs (web ChannelDetailsPhone)", () => {
  it("gives a text channel every tab, members first", () => {
    expect(detailsTabs({ type: "TextChannel" })).toEqual(["members", "media", "pins", "threads", "links", "files"]);
  });
  it("gives a direct message no members and no threads", () => {
    expect(detailsTabs({ type: "DirectMessage" })).toEqual(["media", "pins", "links", "files"]);
  });
  it("opens the tab asked for, else the first", () => {
    const tabs = detailsTabs({ type: "Group" });
    expect(pickTab(tabs, "pins")).toBe("pins");
    expect(pickTab(tabs, "threads")).toBe("members");
  });
});

describe("stripOffset", () => {
  it("is the x itself on a phone, in both directions", () => {
    expect(stripOffset(135, 390, 600, false)).toBe(135);
  });
  it("counts back from the right edge in a right-to-left browser strip", () => {
    // 210 px overflow: the far left is -210, the start (right edge) is 0
    expect(stripOffset(0, 390, 600, true)).toBe(-210);
    expect(stripOffset(210, 390, 600, true)).toBe(0);
    expect(stripOffset(0, 390, 380, true)).toBe(0);
  });
});
