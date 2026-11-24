import { DEFAULT_EXPIRY, EXPIRY_CHOICES, FRIENDS_SHOWN, shownFriends, deadReason, inviteLink, inviteRequest, isInviteCode, memberCount, parseInviteCode } from "../inviteLogic";

describe("parseInviteCode", () => {
  it("reads a bare code and every link form", () => {
    for (const input of [
      "Dm8w7T5p",
      " Dm8w7T5p ",
      "https://zrzur.cc/Dm8w7T5p",
      "zrzur.cc/Dm8w7T5p",
      "https://www.zrzur.cc/Dm8w7T5p/",
      "https://zrzur.cc/Dm8w7T5p?x=1#y",
      "https://app.zrzur.com/invite/Dm8w7T5p",
      "app.zrzur.com/invite/Dm8w7T5p",
    ]) {
      expect(parseInviteCode(input)).toBe("Dm8w7T5p");
    }
    expect(parseInviteCode("zrzur.cc/my-server")).toBe("my-server");
  });

  it("refuses what is not an invite", () => {
    for (const input of ["", "   ", "https://example.com/abc", "https://zrzur.cc/a/b", "https://zrzur.cc/..%2Fusers", "ftp://zrzur.cc/abc", "a b", "x".repeat(40), "-abc", "abc--d"]) {
      expect(parseInviteCode(input)).toBeUndefined();
    }
  });

  it("keeps codes safe for an API path", () => {
    expect(isInviteCode("abc123")).toBe(true);
    expect(isInviteCode("a/b")).toBe(false);
    expect(isInviteCode("x".repeat(33))).toBe(false);
  });
});

describe("deadReason", () => {
  it("words why a link leads nowhere", () => {
    expect(deadReason({ type: "NotFound" })).toBe("ended");
    expect(deadReason("InvalidOperation")).toBe("ended");
    expect(deadReason({ type: "InvitesPaused" })).toBe("paused");
    expect(deadReason({ type: "Network" })).toBe("offline");
    expect(deadReason(null)).toBe("offline");
  });
});

describe("memberCount", () => {
  it("groups digits in Latin numerals and never goes below zero", () => {
    expect(memberCount(1284, "en")).toBe("1,284");
    expect(memberCount(1284, "ar")).toMatch(/^1.?284$/);
    expect(memberCount(-3, "en")).toBe("0");
  });
});

describe("invite options", () => {
  it("names the uses only when limited", () => {
    expect(inviteRequest(DEFAULT_EXPIRY, 0)).toEqual({ expiresIn: DEFAULT_EXPIRY });
    expect(inviteRequest(null, 5)).toEqual({ expiresIn: null, maxUses: 5 });
    expect(EXPIRY_CHOICES).toContain(null);
    expect(EXPIRY_CHOICES).toContain(DEFAULT_EXPIRY);
  });

  it("builds the short link", () => {
    expect(inviteLink("abc")).toBe("https://zrzur.cc/abc");
  });
});

describe("shownFriends", () => {
  const list = ["a", "b", "c", "d", "e", "f", "g"];

  it("lists only the first five", () => {
    expect(FRIENDS_SHOWN).toBe(5);
    expect(shownFriends(list)).toEqual(["a", "b", "c", "d", "e"]);
    expect(shownFriends(["a", "b"])).toEqual(["a", "b"]);
    expect(shownFriends([])).toEqual([]);
  });

  it("searches the whole list, not just the first five", () => {
    expect(shownFriends(list, (x) => x === "g")).toEqual(["g"]);
    expect(shownFriends(list, () => false)).toEqual([]);
  });
});
