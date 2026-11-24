import { LOCALES, LOCALE_NAMES, isRtl, pickLocale } from "../locale";

describe("pickLocale", () => {
  it("keeps the person's own choice", () => {
    expect(pickLocale("de", ["ar-SY"])).toBe("de");
  });
  it("uses the first device language the app has", () => {
    expect(pickLocale(null, ["it-IT", "ar-SY", "en-US"])).toBe("ar");
    expect(pickLocale(null, ["fr-FR", "ar-SY"])).toBe("fr");
    expect(pickLocale(undefined, ["de_AT"])).toBe("de");
  });
  it("maps Chinese to Simplified only", () => {
    expect(pickLocale(null, ["zh-CN"])).toBe("zh-Hans");
    expect(pickLocale(null, ["zh-Hans-SG"])).toBe("zh-Hans");
    expect(pickLocale(null, ["zh-TW", "fr-FR"])).toBe("fr");
    expect(pickLocale(null, ["zh-Hant-HK"])).toBe("en");
  });
  it("has the seven languages", () => {
    expect(LOCALES).toEqual(["ar", "en", "de", "es", "fr", "ru", "zh-Hans"]);
  });
  it("falls back to English", () => {
    expect(pickLocale("xx", ["it-IT", null])).toBe("en");
    expect(pickLocale(null, [])).toBe("en");
  });
  it("is right-to-left only for Arabic", () => {
    expect(LOCALES.filter(isRtl)).toEqual(["ar"]);
  });
  it("names languages by their own name and code, no flags", () => {
    expect(LOCALE_NAMES.ar).toEqual({ name: "العربية", code: "AR" });
    for (const { name } of Object.values(LOCALE_NAMES)) {
      expect(name).not.toMatch(/\p{Regional_Indicator}/u);
    }
  });
});
