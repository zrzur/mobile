/** The seven languages Zrzur is fully translated into (same catalogs as the web app) */
export const LOCALES = ["ar", "en", "de", "es", "fr", "ru", "zh-Hans"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language by its own name and short code: no flags */
export const LOCALE_NAMES: Record<Locale, { name: string; code: string }> = {
  ar: { name: "العربية", code: "AR" },
  en: { name: "English", code: "EN" },
  de: { name: "Deutsch", code: "DE" },
  es: { name: "Español", code: "ES" },
  fr: { name: "Français", code: "FR" },
  ru: { name: "Русский", code: "RU" },
  "zh-Hans": { name: "简体中文", code: "ZH" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

/**
 * Pick the language: the person's own choice first, then the first device
 * language the app has, then English.
 */
export function pickLocale(
  saved: string | null | undefined,
  deviceLanguages: readonly (string | null | undefined)[],
): Locale {
  if (isLocale(saved)) return saved;
  for (const tag of deviceLanguages) {
    const parts = tag?.split(/[-_]/) ?? [];
    const base = parts[0]?.toLowerCase();
    if (base === "zh") {
      // Simplified Chinese only: Traditional script regions fall through
      const rest = parts.slice(1).map((p) => p.toLowerCase());
      if (rest.includes("hant") || rest.some((p) => ["tw", "hk", "mo"].includes(p))) continue;
      return "zh-Hans";
    }
    if (isLocale(base)) return base;
  }
  return "en";
}
