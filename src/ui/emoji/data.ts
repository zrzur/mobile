/**
 * The emoji the picker offers (web: ui/emojis.ts, emojiSections.ts,
 * countryFlags.ts): the web's own mapping (emoji + shorthands, usual
 * order), cut into categories where each one starts, country flags only
 * (Arab League first), and the same search.
 */
import mapping from "./emojiMapping.json";

export type EmojiDef = { emoji: string; shorthands: string[] };

export type EmojiCategoryId = "people" | "nature" | "food" | "travel" | "activities" | "objects" | "symbols" | "flags";

const CATEGORY_STARTS: [EmojiCategoryId, string][] = [
  ["people", "smile"],
  ["nature", "bouquet"],
  ["food", "strawberry"],
  ["travel", "stop-sign"],
  ["activities", "party-popper"],
  ["objects", "camera"],
  ["symbols", "red-circle"],
  ["flags", "chequered-flag"],
];

const ARAB_COUNTRIES = ["PS", "SA", "AE", "EG", "SY", "JO", "LB", "IQ", "KW", "QA", "BH", "OM", "YE", "DZ", "MA", "TN", "LY", "SD", "MR", "SO", "DJ", "KM"];

/** Product country-flag selection (the IL flag is not offered) */
const COUNTRIES = new Set(
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW".split(" "),
);

const points = (text: string) => [...text].map((c) => c.codePointAt(0)!);

export function countryFlagCode(text: string): string | undefined {
  const p = points(text);
  if (p.length !== 2 || p.some((x) => x < 0x1f1e6 || x > 0x1f1ff)) return;
  const code = String.fromCharCode(...p.map((x) => x - 0x1f1e6 + 65));
  return COUNTRIES.has(code) ? code : undefined;
}

export function isOfferedEmoji(text: string): boolean {
  const p = points(text);
  const flag = p.some((x) => x >= 0x1f1e6 && x <= 0x1f1ff) || [0x1f3c1, 0x1f3f3, 0x1f3f4, 0x1f38c, 0x1f6a9].includes(p[0]);
  return !flag || !!countryFlagCode(text);
}

const isRegionalLetter = (emoji: string) => {
  const p = points(emoji);
  return p.length === 1 && p[0] >= 0x1f1e6 && p[0] <= 0x1f1ff;
};

const MAP = mapping as string[][];

/** Every offered emoji once, in the usual order */
export const EMOJI: EmojiDef[] = [];
/** Shorthand → emoji (for `:name:` in the composer) */
export const SHORTHAND: Record<string, EmojiDef> = {};
{
  const seen = new Set<string>();
  for (const entry of MAP) {
    if (!isOfferedEmoji(entry[0])) continue;
    const def = { emoji: entry[0], shorthands: entry.slice(1) };
    for (const s of def.shorthands) SHORTHAND[s] ??= def;
    if (seen.has(def.emoji)) continue;
    seen.add(def.emoji);
    EMOJI.push(def);
  }
}

let categories: { id: EmojiCategoryId; emoji: EmojiDef[] }[] | undefined;

/** Every emoji grouped into picker categories (built on first use) */
export function emojiCategories() {
  if (categories) return categories;
  const firstPosition = new Map<string, number>();
  MAP.forEach((entry, index) => {
    if (!firstPosition.has(entry[0])) firstPosition.set(entry[0], index);
  });
  // some emoji appear twice (🎉 also sits among the smileys): look for each start after the previous one
  let previous = -1;
  const starts = CATEGORY_STARTS.map(([id, name]) => {
    const at = MAP.findIndex((entry, index) => index > previous && entry.slice(1).includes(name));
    if (at >= 0) previous = at;
    return { id, at };
  });
  const groups = new Map<EmojiCategoryId, EmojiDef[]>(starts.map(({ id }) => [id, []]));
  for (const def of EMOJI) {
    if (isRegionalLetter(def.emoji)) continue;
    const position = firstPosition.get(def.emoji) ?? -1;
    let category: EmojiCategoryId | undefined;
    for (const start of starts) if (start.at >= 0 && position >= start.at) category = start.id;
    if (category) groups.get(category)!.push(def);
  }
  const flags = groups.get("flags")!.filter((d) => countryFlagCode(d.emoji));
  const arab = (d: EmojiDef) => ARAB_COUNTRIES.indexOf(countryFlagCode(d.emoji)!);
  groups.set("flags", [...flags.filter((d) => arab(d) >= 0).sort((a, b) => arab(a) - arab(b)), ...flags.filter((d) => arab(d) < 0)]);
  categories = starts.map(({ id }) => ({ id, emoji: groups.get(id)! }));
  return categories;
}

let index: { def: EmojiDef; text: string }[] | undefined;

/** Emoji whose shorthands contain the query; names starting with it first */
export function searchEmoji(query: string, limit = 120): EmojiDef[] {
  const needle = query.trim().toLowerCase().replace(/^:|:$/g, "");
  if (!needle) return [];
  index ??= EMOJI.map((def) => ({ def, text: def.shorthands.join("\n").toLowerCase() }));
  const starts: EmojiDef[] = [];
  const contains: EmojiDef[] = [];
  for (const entry of index) {
    if (!entry.text.includes(needle)) continue;
    if (entry.def.shorthands.some((s) => s.startsWith(needle))) starts.push(entry.def);
    else contains.push(entry.def);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/* ---------- skin tone ---------- */

export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5;
/** Fitzpatrick modifiers 🏻 🏼 🏽 🏾 🏿 */
export const SKIN_MODIFIERS = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff];

/** Unicode Emoji_Modifier_Base (emoji-data.txt) */
const MODIFIER_BASE: [number, number][] = [
  [0x261d, 0x261d], [0x26f9, 0x26f9], [0x270a, 0x270d], [0x1f385, 0x1f385], [0x1f3c2, 0x1f3c4], [0x1f3c7, 0x1f3c7],
  [0x1f3ca, 0x1f3cc], [0x1f442, 0x1f443], [0x1f446, 0x1f450], [0x1f466, 0x1f478], [0x1f47c, 0x1f47c], [0x1f481, 0x1f483],
  [0x1f485, 0x1f487], [0x1f48f, 0x1f48f], [0x1f491, 0x1f491], [0x1f4aa, 0x1f4aa], [0x1f574, 0x1f575], [0x1f57a, 0x1f57a],
  [0x1f590, 0x1f590], [0x1f595, 0x1f596], [0x1f645, 0x1f647], [0x1f64b, 0x1f64f], [0x1f6a3, 0x1f6a3], [0x1f6b4, 0x1f6b6],
  [0x1f6c0, 0x1f6c0], [0x1f6cc, 0x1f6cc], [0x1f90c, 0x1f90c], [0x1f90f, 0x1f90f], [0x1f918, 0x1f91f], [0x1f926, 0x1f926],
  [0x1f930, 0x1f939], [0x1f93c, 0x1f93e], [0x1f977, 0x1f977], [0x1f9b5, 0x1f9b6], [0x1f9b8, 0x1f9b9], [0x1f9bb, 0x1f9bb],
  [0x1f9cd, 0x1f9cf], [0x1f9d1, 0x1f9dd], [0x1fac3, 0x1fac5], [0x1faf0, 0x1faf8],
];

export function isModifierBase(cp: number) {
  for (const [a, b] of MODIFIER_BASE) if (cp >= a && cp <= b) return true;
  return false;
}

/** Whether this emoji takes a skin tone (one person or one hand at its start) */
export function takesSkinTone(emoji: string) {
  const p = points(emoji);
  if (!p.length || !isModifierBase(p[0])) return false;
  // couples and families (two bases joined) keep their default look
  return p.slice(1).filter(isModifierBase).length === 0;
}

/** The emoji in the chosen tone (0 = default yellow) */
export function withSkinTone(emoji: string, tone: SkinTone): string {
  if (!tone || !takesSkinTone(emoji)) return emoji;
  const p = points(emoji);
  const rest = p.slice(1);
  // the tone replaces a variation selector right after the base
  if (rest[0] === 0xfe0f) rest.shift();
  return String.fromCodePoint(p[0], SKIN_MODIFIERS[tone - 1], ...rest);
}
