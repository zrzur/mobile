import { decodeParam, fieldTexts, isInvitationCode, isSharePath, myEventsShown, notBefore, onDayAt, zoneText } from "../eventFormat";

describe("date field", () => {
  it("puts a chosen day at the field's clock time", () => {
    const d = onDayAt(new Date(2026, 11, 24, 3, 0), new Date(2026, 0, 1, 19, 45));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 24, 19, 45]);
  });
  it("moves a value up to the earliest allowed moment", () => {
    const min = new Date(2026, 5, 1, 12, 0);
    expect(notBefore(new Date(2026, 4, 1), min).getTime()).toBe(min.getTime());
    expect(notBefore(new Date(2026, 6, 1), min).getTime()).toBe(new Date(2026, 6, 1).getTime());
    expect(notBefore(new Date(2026, 4, 1), undefined).getTime()).toBe(new Date(2026, 4, 1).getTime());
  });
  it("writes the day and time in the language, with Latin digits", () => {
    const v = new Date(2026, 11, 24, 19, 45);
    const en = fieldTexts(v, "en");
    expect(en.day).toContain("24");
    expect(en.day).toContain("2026");
    expect(en.time).toMatch(/7:45|19:45/);
    const ar = fieldTexts(v, "ar");
    expect(ar.day).toMatch(/24/);
    expect(ar.time).toMatch(/45/);
  });
  it("names the time zone with its id", () => {
    expect(zoneText(new Date(Date.UTC(2026, 0, 15)), "en", "Europe/Vienna")).toMatch(/· Europe\/Vienna$/);
    expect(zoneText(new Date(Date.UTC(2026, 0, 15)), "en", "UTC")).toContain("UTC");
    expect(zoneText(new Date(), "en", "Not/AZone")).toBe("Not/AZone");
  });
});

describe("event links", () => {
  it("knows share paths and invitation codes (web: eventLinks)", () => {
    expect(isSharePath("game-night-bcdfghjk")).toBe(true);
    expect(isSharePath("bcdfghjk")).toBe(true);
    expect(isSharePath("game-night-abcdefgh")).toBe(false);
    expect(isSharePath(`${"x".repeat(60)}-bcdfghjk`)).toBe(false);
    expect(isInvitationCode("bcdfghjkmnpqrstv")).toBe(true);
    expect(isInvitationCode("bcdfghjk")).toBe(false);
    expect(isInvitationCode("BCDFGHJKMNPQRSTV")).toBe(false);
  });
  it("decodes route parameters safely", () => {
    expect(decodeParam("%D9%84%D9%8A%D9%84%D8%A9-bcdfghjk")).toBe("ليلة-bcdfghjk");
    expect(decodeParam("%E0%A4%A")).toBe("");
    expect(decodeParam(["a", "b"])).toBe("a");
    expect(decodeParam(undefined)).toBe("");
  });
});

describe("my events", () => {
  const list = [
    { _id: "1", status: "Scheduled" as const, server: "s" },
    { _id: "2", status: "Active" as const, server: "s" },
    { _id: "3", status: "Completed" as const, server: "s" },
    { _id: "4", status: "Scheduled" as const, server: "gone" },
  ];
  it("keeps upcoming events of your servers, yours or all", () => {
    const mine = (id: string) => id === "2" || id === "3";
    const inServer = (id: string) => id === "s";
    expect(myEventsShown(list, "all", mine, inServer).map((e) => e._id)).toEqual(["1", "2"]);
    expect(myEventsShown(list, "mine", mine, inServer).map((e) => e._id)).toEqual(["2"]);
  });
});
