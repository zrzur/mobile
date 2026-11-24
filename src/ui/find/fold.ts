/**
 * Text folded for searching (web: common/lib/arabicFold.ts), so a person
 * finds a name however it was typed. Only the copy used for the comparison
 * is folded; what is stored and shown never changes.
 *
 * - case, and accents on Latin letters
 * - Arabic vowel marks (tashkeel), Quranic marks and the tatweel (ـ)
 * - every form of alef (أ إ آ ٱ ا), hamza on waw and ya (ؤ ئ)
 * - ta marbuta and ha (ة ه), alef maqsura and ya (ى ي)
 * - Persian and Urdu forms of kaf, ya and ha (ک ی ے ہ ھ)
 * - Arabic-Indic and Persian digits (٠-٩, ۰-۹) and Latin digits
 * - presentation forms and ligatures (ﻻ), invisible direction marks
 */
export function foldText(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g, "")
      .replace(/[ـ؜​-‏‪-‮⁠-⁩﻿]/g, "")
      .replace(/[ٱ-ٳٵ]/g, "ا")
      .replace(/[ىیےۓۍې]/g, "ي")
      .replace(/[ةۀ-ۃھە]/g, "ه")
      .replace(/[کڪػؼ]/g, "ك")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .toLocaleLowerCase("en")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The folded word without a leading definite article (ال), if it has one */
export function withoutArticle(word: string) {
  return word.length > 3 && word.startsWith("ال") ? word.slice(2) : word;
}

/** Whether every word typed is in the text, folded (with or without ال) */
export function textMatches(text: string | undefined | null, query: string) {
  const words = foldText(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = foldText(text ?? "");
  return words.every((word) => haystack.includes(word) || haystack.includes(withoutArticle(word)));
}
