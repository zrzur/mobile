import { defaultAvatarIndex, defaultAvatarXml } from "../defaultAvatar";
import { initialsText, toInitials } from "../initials";

describe("initials (web Initials.tsx)", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsText("Speed test")).toBe("St");
    expect(initialsText("Settings")).toBe("S");
    expect(initialsText("  a  b  c ")).toBe("ab");
  });
  it("skips the Arabic article and keeps the letters apart", () => {
    expect(toInitials("مكتبة الأصدقاء")).toEqual(["م", "أ"]);
    expect(initialsText("مكتبة الأصدقاء")).toBe("م\u200Cأ");
  });
  it("gives nothing for an empty name", () => {
    expect(initialsText("")).toBe("");
  });
});

describe("default avatar pack (web sampleAvatars.ts)", () => {
  it("maps the server's default picture to a pack face", () => {
    expect(defaultAvatarXml("http://127.0.0.1:14702/users/01M7TDQNX1B66KSZFG40TFZG46/default_avatar")).toMatch(/^<svg/);
  });
  it("leaves official (?v=2) and uploaded pictures alone", () => {
    expect(defaultAvatarXml("https://api.zrzur.com/users/01M7TDQNX1B66KSZFG40TFZG46/default_avatar?v=2")).toBeUndefined();
    expect(defaultAvatarXml("https://cdn.zrzur.com/avatars/abc")).toBeUndefined();
    expect(defaultAvatarXml(undefined)).toBeUndefined();
  });
  it("picks the same face as the web for the same id", () => {
    // web: FNV-1a over TextEncoder bytes of "zrzur-default-v1:<id>" gives 11 for this id
    expect(defaultAvatarIndex("01M7TDQNX1B66KSZFG40TFZG46")).toBe(11);
  });
});
