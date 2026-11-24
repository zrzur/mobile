/**
 * The parts of the notices that decide without drawing: which notice comes
 * next, its words in the reader's language, which links may open, the
 * policy change words, the "what's new" decision and the Save data offer.
 */

/** How often to look for notices while the app is open (web: RECHECK_MS) */
export const NOTICE_RECHECK_MS = 15 * 60 * 1000;

export type NoticeLike = {
  _id: string;
  title: Record<string, string>;
  body: Record<string, string>;
  link?: string | null;
  tone: string;
};

/** A text in the reader's language (ar, en, de), else English, else nothing */
export function noticeText(value: Record<string, string> | undefined, locale: string | undefined): string {
  if (!value) return "";
  const lang = (locale ?? "en").split(/[-_]/)[0];
  return value[lang] || value.en || "";
}

/**
 * The next notice to tell, among those not told yet this run: an important
 * one first (it opens at once), else the first.
 */
export function nextNotice<T extends NoticeLike>(notices: T[], told: ReadonlySet<string>): T | undefined {
  const fresh = notices.filter((n) => !told.has(n._id));
  return fresh.find((n) => n.tone === "important") ?? fresh[0];
}

/** Only https links from the server open (never javascript: and the like) */
export const safeNoticeLink = (link: string | null | undefined): string | undefined => (link && /^https:\/\//i.test(link) ? link : undefined);

/** A policy link opens only as http(s) (web PolicyChange) */
export const safePolicyLink = (url: string | null | undefined): string | undefined => (url && /^https?:\/\//i.test(url) ? url : undefined);

export type PolicyChangeLike = { description: string; translations?: Record<string, string> | null; url: string; effective_time: string };

/** The change in the reader's language, else the default text */
export function policyText(change: PolicyChangeLike, locale: string | undefined): string {
  const lang = (locale ?? "en").slice(0, 2);
  return change.translations?.[lang] || change.description;
}

export type ChangelogEntry = { id: string; title: string; markdown_content: string; published_at: string };

/** Whether the feed answered with an entry the app can show */
export function validChangelog(data: unknown): data is ChangelogEntry {
  const d = data as Partial<ChangelogEntry> | null;
  return !!d && typeof d.id === "string" && typeof d.title === "string" && typeof d.markdown_content === "string" && typeof d.published_at === "string";
}

/** Show "What's new" once per entry: only when this entry was not seen (and something was seen before: a new install starts quiet) */
export function shouldShowChangelog(entry: ChangelogEntry | null, lastSeenId: string | null): boolean {
  if (!entry) return false;
  if (!lastSeenId) return false;
  return entry.id !== lastSeenId;
}

/** Network kinds that mean the person pays by the megabyte (expo-network types) */
const METERED = new Set(["CELLULAR"]);

/**
 * Offer Save data once, quietly, when the phone is on mobile data and Save
 * data is off (web: shouldOfferSaveData: the device asks for less data).
 */
export function shouldOfferSaveData(input: { on: boolean; offered: boolean; networkType: string | undefined }): boolean {
  return !input.on && !input.offered && METERED.has(input.networkType ?? "");
}
