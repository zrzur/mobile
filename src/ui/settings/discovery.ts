/**
 * Pure helpers of Overview › Discovery, Invites and sharing, and Features
 * (web: Discoverable, VanityInvite, vanityState, systemMessages).
 */

// ---------- Discovery ----------

/** Discover categories for servers, in the web's order (labels in the page) */
export const DISCOVER_CATEGORIES = ["gaming", "community", "education", "technology", "art", "music", "entertainment", "anime", "sports", "science", "languages", "other"] as const;
export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

/** Main languages offered after "Not set" */
export const DISCOVER_LANGUAGES = ["ar", "en", "fr", "de", "es", "tr", "fa", "ku", "ur", "ru", "pt", "it", "nl", "id", "hi", "zh", "ja", "ko"] as const;

/** Each language in its own words, for engines without Intl.DisplayNames */
const ENDONYMS: Record<string, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  tr: "Türkçe",
  fa: "فارسی",
  ku: "Kurdî",
  ur: "اردو",
  ru: "Русский",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  id: "Bahasa Indonesia",
  hi: "हिन्दी",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
};

/** A language's name in the page language (Intl), else in its own words */
export function languageName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: "language" });
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch {
    // no Intl.DisplayNames on this engine
  }
  return ENDONYMS[code] ?? code;
}

export const MAX_TAGS = 5;

export type DiscoverStatus = "Pending" | "UnderReview" | { Approved: string | null } | { Denied: string | null } | { Removed: string | null };
export type DiscoverKind = "none" | "pending" | "review" | "approved" | "denied" | "removed";

export function statusKind(status: DiscoverStatus | undefined | null): DiscoverKind {
  if (!status) return "none";
  if (status === "Pending") return "pending";
  if (status === "UnderReview") return "review";
  if ("Approved" in status) return "approved";
  if ("Denied" in status) return "denied";
  if ("Removed" in status) return "removed";
  return "none";
}

/** The moderator's reason, if one was given */
export function statusReason(status: DiscoverStatus | undefined | null): string | undefined {
  if (!status || typeof status === "string") return undefined;
  const value = Object.values(status)[0];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** A typed tag as stored: trimmed, no leading "#", lower case */
export function normaliseTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").toLowerCase();
}

export function isValidTag(tag: string): boolean {
  return tag.length >= 2 && tag.length <= 24 && /^[\p{L}\p{N}_-]+$/u.test(tag);
}

/**
 * Add a typed tag. Empty, duplicate or a sixth tag is dropped silently;
 * a malformed one comes back as `invalid` (the page shows the hint).
 */
export function addTag(tags: string[], raw: string): { tags: string[]; invalid?: true } {
  const tag = normaliseTag(raw);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return { tags };
  if (!isValidTag(tag)) return { tags, invalid: true };
  return { tags: [...tags, tag] };
}

/** Typed text ending in a comma or space adds what came before it */
export function splitTagInput(text: string): { done?: string; rest: string } {
  const m = /^(.*?)[,\s]+$/su.exec(text);
  if (!m) return { rest: text };
  return { done: m[1], rest: "" };
}

export type Listing = { category?: string | null; language?: string | null; tags?: string[] | null };

/** The body of PUT / PATCH /servers/{id}/discover (empty strings when unset) */
export function listingBody(l: Listing) {
  return { tags: l.tags ?? [], category: l.category ?? "", language: l.language ?? "" };
}

export function listingDirty(stored: Listing | null | undefined, draft: Listing): boolean {
  return (stored?.category || "") !== (draft.category || "") || (stored?.language || "") !== (draft.language || "") || (stored?.tags ?? []).join() !== (draft.tags ?? []).join();
}

// ---------- Custom invite link ----------

const RE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Letters, digits and single hyphens, 3–32 characters (web: isInviteCode + length) */
export function isVanityName(name: string): boolean {
  return name.length >= 3 && name.length <= 32 && RE_CODE.test(name);
}

/** The name as saved */
export function vanityName(typed: string): string {
  return typed.trim().toLowerCase();
}

export function inviteLink(code: string): string {
  return `https://zrzur.cc/${code}`;
}

export const VANITY_GRACE_DAYS = 7;
export const VANITY_RESERVE_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

export type VanityState = { kind: "active" } | { kind: "grace"; ends: Date } | { kind: "paused"; releasedAt: Date } | { kind: "release" };

/** Where a link stands since its server fell below the level that unlocks it */
export function vanityState(belowLevelSince: Date | undefined, now: Date): VanityState {
  if (!belowLevelSince) return { kind: "active" };
  const since = belowLevelSince.getTime();
  const ends = new Date(since + VANITY_GRACE_DAYS * DAY);
  if (now < ends) return { kind: "grace", ends };
  const releasedAt = new Date(since + VANITY_RESERVE_DAYS * DAY);
  if (now < releasedAt) return { kind: "paused", releasedAt };
  return { kind: "release" };
}

// ---------- Features ----------

export const SYSTEM_MESSAGE_KEYS = ["user_joined", "user_left", "user_kicked", "user_banned"] as const;
export type SystemMessageKey = (typeof SYSTEM_MESSAGE_KEYS)[number];
export type SystemMessages = Partial<Record<SystemMessageKey, string | null>>;

/** Each message posts to its channel; "none" turns it off; other keys stay */
export function systemMessagesPatch(current: SystemMessages | null | undefined, next: Record<SystemMessageKey, string>): SystemMessages {
  const result: SystemMessages = { ...(current ?? {}) };
  for (const key of SYSTEM_MESSAGE_KEYS) {
    if (next[key] === "none") delete result[key];
    else result[key] = next[key];
  }
  return result;
}

export type Stat = "Members" | "Channels" | "Roles" | "Wings";

export type FeaturesDraft = { rules: string; messages: Record<SystemMessageKey, string>; stats: Stat[] };

/** The form as the server has it ("none" where nothing is set) */
export function featuresFrom(rulesChannel: string | undefined, messages: SystemMessages | null | undefined, stats: Stat[]): FeaturesDraft {
  const m = {} as Record<SystemMessageKey, string>;
  for (const key of SYSTEM_MESSAGE_KEYS) m[key] = messages?.[key] || "none";
  return { rules: rulesChannel || "none", messages: m, stats: [...stats] };
}

/** Tap a counter: off removes it, on appends it (stats keep the tapping order) */
export function toggleStat(stats: Stat[], stat: Stat): Stat[] {
  return stats.includes(stat) ? stats.filter((s) => s !== stat) : [...stats, stat];
}

/** PATCH /servers/{id} body with only the parts that changed; `null` when nothing did */
export function featuresBody(stored: FeaturesDraft, draft: FeaturesDraft, current: SystemMessages | null | undefined) {
  const body: { rules_channel?: string; stats?: Stat[]; system_messages?: SystemMessages; remove: ("RulesChannel" | "Stats")[] } = { remove: [] };
  let changed = false;
  if (draft.rules !== stored.rules) {
    changed = true;
    if (draft.rules === "none") body.remove.push("RulesChannel");
    else body.rules_channel = draft.rules;
  }
  if (draft.stats.join() !== stored.stats.join()) {
    changed = true;
    if (draft.stats.length) body.stats = draft.stats;
    else body.remove.push("Stats");
  }
  if (SYSTEM_MESSAGE_KEYS.some((k) => draft.messages[k] !== stored.messages[k])) {
    changed = true;
    body.system_messages = systemMessagesPatch(current, draft.messages);
  }
  return changed ? body : null;
}

/** `⁨#name⁩`: the name isolated so it never flips the line around it */
export function channelLabel(name: string): string {
  return `⁨#${name}⁩`;
}
