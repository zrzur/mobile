import { parseOwnLink } from "../ownLink";

describe("parseOwnLink", () => {
  it("reads short and app invite and bot links", () => {
    expect(parseOwnLink("https://zrzur.cc/abc-1")).toEqual({ kind: "invite", code: "abc-1", path: "/invite/abc-1" });
    expect(parseOwnLink("https://app.zrzur.com/invite/abc")?.kind).toBe("invite");
    expect(parseOwnLink("https://zrzur.cc/b/01ARZ3NDEKTSV4RRFFQ69G5FAV?permissions=8")).toEqual({
      kind: "bot",
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      permissions: 8,
      path: "/bot/01ARZ3NDEKTSV4RRFFQ69G5FAV?permissions=8",
    });
    expect(parseOwnLink("https://beta.zrzur.com/i/app.zrzur.com/bot/01ARZ3NDEKTSV4RRFFQ69G5FAV")?.kind).toBe("bot");
  });
  it("leaves other links alone", () => {
    expect(parseOwnLink("https://zrzur.cc.evil.test/abc")).toBeNull();
    expect(parseOwnLink("https://app.zrzur.com/settings")).toBeNull();
    expect(parseOwnLink("https://zrzur.cc/abc/")).toBeNull();
    expect(parseOwnLink("https://user:pw@zrzur.cc/abc")).toBeNull();
    expect(parseOwnLink("not a link")).toBeNull();
  });
});
