import {
  birthMonthValue,
  canTransferTo,
  confirmsName,
  directMessagesFriendsOnly,
  firstMethod,
  hasOldTag,
  isEmail,
  mfaBody,
  otpauthUri,
  parseBirthMonth,
  stripSpaces,
  userHandle,
  userTag,
  usernameProblem,
} from "../accountLogic";

describe("username check", () => {
  it("needs two characters", () => {
    expect(usernameProblem("a")).toBe("short");
    expect(usernameProblem("  a  ")).toBe("short");
    expect(usernameProblem("ab")).toBeUndefined();
  });
  it("allows letters of any script, digits, _ . -", () => {
    expect(usernameProblem("زرزور_1.a-b")).toBeUndefined();
    expect(usernameProblem("Größe")).toBeUndefined();
  });
  it("refuses spaces and symbols", () => {
    expect(usernameProblem("a b")).toBe("characters");
    expect(usernameProblem("ab!")).toBe("characters");
    expect(usernameProblem("a@b")).toBe("characters");
  });
});

describe("email check", () => {
  it("matches the web pattern", () => {
    expect(isEmail("name@example.com")).toBe(true);
    expect(isEmail("a@b")).toBe(true);
    expect(isEmail("name example.com")).toBe(false);
    expect(isEmail("@example.com")).toBe(false);
    expect(isEmail("a@@b")).toBe(false);
  });
});

describe("typed server name", () => {
  it("ignores case and extra spaces", () => {
    expect(confirmsName("  my   Server ", "My Server")).toBe(true);
    expect(confirmsName("my server", "My  Server")).toBe(true);
  });
  it("refuses empty or different names", () => {
    expect(confirmsName("", "")).toBe(false);
    expect(confirmsName("   ", "  ")).toBe(false);
    expect(confirmsName("my serve", "My Server")).toBe(false);
  });
});

describe("user tag", () => {
  it("shows an old tag only", () => {
    expect(hasOldTag({ username: "a", discriminator: "1234" })).toBe(true);
    expect(hasOldTag({ username: "a", discriminator: "0000" })).toBe(false);
    expect(hasOldTag(undefined)).toBe(false);
    expect(userTag({ discriminator: "1234" })).toBe("#1234");
    expect(userTag({ discriminator: "1234" }, true)).toBe("#••••");
    expect(userTag({ discriminator: "0000" })).toBe("");
    expect(userHandle({ username: "sam", discriminator: "0042" })).toBe("sam#0042");
    expect(userHandle({ username: "sam", discriminator: "0000" })).toBe("sam");
  });
});

describe("MFA", () => {
  it("builds the ticket body", () => {
    expect(mfaBody("Password", " pass word ")).toEqual({ password: " pass word " });
    expect(mfaBody("Totp", "123 456")).toEqual({ totp_code: "123456" });
    expect(mfaBody("Recovery", " abcd-efgh ")).toEqual({ recovery_code: "abcd-efgh" });
  });
  it("never picks Recovery first", () => {
    expect(firstMethod(["Totp", "Recovery"])).toBe("Totp");
    expect(firstMethod(["Recovery"])).toBeUndefined();
    expect(firstMethod(["Password"])).toBe("Password");
  });
  it("builds the authenticator link", () => {
    expect(otpauthUri("sam", "ABC")).toBe("otpauth://totp/Zrzur:sam?secret=ABC&issuer=Zrzur");
    expect(otpauthUri("a b", "ABC")).toBe("otpauth://totp/Zrzur:a%20b?secret=ABC&issuer=Zrzur");
    expect(stripSpaces(" 12 34\t56 ")).toBe("123456");
  });
});

describe("birth month", () => {
  it("round-trips YYYY-MM", () => {
    expect(birthMonthValue("1994", 3)).toBe("1994-03");
    expect(parseBirthMonth("1994-03")).toEqual({ year: 1994, month: 3 });
    expect(parseBirthMonth("1994-13")).toBeUndefined();
    expect(parseBirthMonth(null)).toBeUndefined();
  });
  it("limits direct messages for teens", () => {
    expect(directMessagesFriendsOnly("teen")).toBe(true);
    expect(directMessagesFriendsOnly("under_minimum")).toBe(true);
    expect(directMessagesFriendsOnly("adult_declared")).toBe(false);
    expect(directMessagesFriendsOnly(undefined)).toBe(false);
  });
});

describe("ownership transfer", () => {
  it("skips bots and the owner", () => {
    expect(canTransferTo({ id: "a" }, "o")).toBe(true);
    expect(canTransferTo({ id: "o" }, "o")).toBe(false);
    expect(canTransferTo({ id: "b", bot: { owner: "x" } }, "o")).toBe(false);
  });
});
