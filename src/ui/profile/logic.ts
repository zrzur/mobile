/**
 * Pure logic of profiles and people (web: profiles/sections.ts,
 * nameRowBadges.ts, mutualCache.ts, MemberSidebar, Friends, ReportContent).
 * No React, no SDK classes: plain data in, plain data out, so jest can
 * check every rule.
 */
import { BADGES } from "@/ui/settings/user/profile-logic";

// ---------- sections ----------

/** Sections a person can order or hide, in their default order */
export const PROFILE_SECTIONS = ["about", "links", "creations", "wearing", "member_since", "connections", "games"] as const;
export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number];

const knownSection = (id: string): id is ProfileSectionId => (PROFILE_SECTIONS as readonly string[]).includes(id);

/** The sections to draw for a profile, in the owner's order */
export function visibleSections(sections?: string[]): ProfileSectionId[] {
  return sections ? sections.filter(knownSection) : [...PROFILE_SECTIONS];
}

/** Games and Connections draw once, where the first of the two sits */
export function interestsAt(sections: ProfileSectionId[]): ProfileSectionId | undefined {
  return sections.find((id) => id === "games" || id === "connections");
}

// ---------- links ----------

export type SafeLink = { href: string; host: string };

/**
 * A saved link as a plain https address, or nothing. Parsed by hand: the
 * phone's URL class has no `hostname`. User info (`a@b`), spaces and ports
 * other than none are refused, like the web's `profileLinkUrl`.
 */
export function parseHttps(link: unknown): SafeLink | undefined {
  if (typeof link !== "string") return undefined;
  const m = /^https:\/\/([^/?#\s]+)([/?#][^\s]*)?$/i.exec(link.trim());
  if (!m) return undefined;
  const authority = m[1];
  if (authority.includes("@")) return undefined;
  const host = authority.replace(/:\d+$/, "").toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || !/^[a-z0-9.-]+$/.test(host)) return undefined;
  return { href: link.trim(), host };
}

/** The links of a profile that may be shown */
export function safeProfileLinks(links?: unknown[]): SafeLink[] {
  return (links ?? []).flatMap((link) => parseHttps(link) ?? []);
}

/** Sites people link most, by their real address. Nothing else is trusted. */
const KNOWN_SITES: Record<string, string> = {
  "bsky.app": "Bluesky",
  "facebook.com": "Facebook",
  "github.com": "GitHub",
  "instagram.com": "Instagram",
  "kick.com": "Kick",
  "linkedin.com": "LinkedIn",
  "reddit.com": "Reddit",
  "soundcloud.com": "SoundCloud",
  "spotify.com": "Spotify",
  "steamcommunity.com": "Steam",
  "steampowered.com": "Steam",
  "threads.net": "Threads",
  "tiktok.com": "TikTok",
  "twitch.tv": "Twitch",
  "twitter.com": "X",
  "x.com": "X",
  "youtu.be": "YouTube",
  "youtube.com": "YouTube",
};

const SHARED_ENDINGS = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/;

const LOOKALIKES = new Set(Object.entries(KNOWN_SITES).flatMap(([site, name]) => [name.toLowerCase(), site.split(".")[0]]));

/** The site a link belongs to, without subdomains */
export function linkDomain(host: string) {
  const parts = host.split(".");
  return parts.slice(SHARED_ENDINGS.test(host) ? -3 : -2).join(".");
}

/** The name on a link chip: a known site's name, never a lookalike */
export function linkName(host: string) {
  const domain = linkDomain(host);
  const known = KNOWN_SITES[domain];
  if (known) return known;
  const name = domain.split(".")[0];
  return LOOKALIKES.has(name.toLowerCase()) ? domain : name.charAt(0).toUpperCase() + name.slice(1);
}

/** A linked service's own page only (web linkedServices `serviceUrl`) */
export function serviceUrl(service: string, url?: string): string | undefined {
  const hosts: Record<string, string> = { twitch: "www.twitch.tv", github: "github.com", steam: "steamcommunity.com" };
  const link = parseHttps(url);
  if (!link || !hosts[service] || link.host !== hosts[service] || /^https:\/\/[^/?#]+:\d+/i.test(link.href)) return undefined;
  return link.href;
}

// ---------- badges ----------

/** Badges the small card shows beside the name */
export const CARD_BADGES = 3;

/** A person's badges, most important first; bots show none */
export function profileBadgeIds(bits: number, bot: boolean): string[] {
  if (bot) return [];
  return BADGES.filter((b) => (bits & b.bit) !== 0)
    .sort((a, b) => a.priority - b.priority)
    .map((b) => b.id);
}

export function nameRowBadges(ids: string[], size: "card" | "full"): string[] {
  return size === "card" ? ids.slice(0, CARD_BADGES) : ids;
}

// ---------- status ----------

/** Emoji then text, as one line (web statusLine); a custom emoji id is left out */
export function statusLine(emoji: string | undefined | null, text: string | undefined | null): string {
  const e = emoji && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(emoji) ? emoji : "";
  return [e, text?.trim() ?? ""].filter(Boolean).join(" ");
}

// ---------- names ----------

/** Arabic-aware fold for search (same rule as the conversation list) */
export function fold(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي");
}

/** Names in the reader's order, case and marks ignored */
export function compareNames(a: string, b: string) {
  return fold(a).localeCompare(fold(b));
}

// ---------- member list ----------

export type ListMember = { id: string; name: string; online: boolean; roles: string[] };
export type ListRole = { id: string; name: string; hoist: boolean; icon?: string };

export type MemberListRow =
  | { kind: "title"; key: string; name: string; count: number; icon?: string }
  | { kind: "member"; key: string; id: string; online: boolean };

/**
 * The web member sidebar: online members under their highest hoisted role
 * (roles in rank order), the rest under Online, everyone offline last.
 * Empty groups draw nothing.
 */
export function groupMembers(members: ListMember[], roles: ListRole[], labels: { online: string; offline: string }): MemberListRow[] {
  const hoisted = roles.filter((r) => r.hoist);
  const groups = new Map<string, ListMember[]>();
  groups.set("default", []);
  groups.set("offline", []);
  for (const r of hoisted) groups.set(r.id, []);
  for (const m of members) {
    if (!m.online) {
      groups.get("offline")!.push(m);
      continue;
    }
    const role = hoisted.find((r) => m.roles.includes(r.id));
    groups.get(role ? role.id : "default")!.push(m);
  }
  const order = [...hoisted.map((r) => ({ id: r.id, name: r.name, icon: r.icon })), { id: "default", name: labels.online, icon: undefined }, { id: "offline", name: labels.offline, icon: undefined }];
  const rows: MemberListRow[] = [];
  for (const g of order) {
    const list = groups.get(g.id)!.sort((a, b) => compareNames(a.name, b.name));
    if (!list.length) continue;
    rows.push({ kind: "title", key: `t:${g.id}`, name: g.name, count: list.length, icon: g.icon });
    for (const m of list) rows.push({ kind: "member", key: `m:${m.id}`, id: m.id, online: g.id !== "offline" });
  }
  return rows;
}

// ---------- friends ----------

export type FriendTab = "online" | "all" | "pending" | "blocked";
export type FriendPerson = { id: string; name: string; username: string; relationship: string; online: boolean };

export type FriendGroup = { kind: "friend" | "incoming" | "outgoing" | "blocked"; ids: string[] };

/** What one tab of the Friends page lists, search applied (web Friends) */
export function friendGroups(people: FriendPerson[], tab: FriendTab, query: string): FriendGroup[] {
  const q = fold(query.trim());
  const match = (p: FriendPerson) => !q || fold(p.name).includes(q) || fold(p.username).includes(q);
  const pick = (rel: string, online?: boolean) =>
    people
      .filter((p) => p.relationship === rel && (online === undefined || p.online === online) && match(p))
      .sort((a, b) => compareNames(a.name, b.name))
      .map((p) => p.id);
  if (tab === "online") return [{ kind: "friend", ids: pick("Friend", true) }];
  if (tab === "all") return [{ kind: "friend", ids: pick("Friend") }];
  if (tab === "blocked") return [{ kind: "blocked", ids: pick("Blocked") }];
  return [
    { kind: "incoming", ids: pick("Incoming") },
    { kind: "outgoing", ids: pick("Outgoing") },
  ].filter((g) => g.ids.length) as FriendGroup[];
}

// ---------- moderation ----------

export type ModerationFacts = {
  self: boolean;
  member: boolean;
  owner: boolean;
  /** the target ranks below you */
  inferior: boolean;
  perms: { assignRoles: boolean; timeout: boolean; kick: boolean; ban: boolean; memberKnown: boolean };
};

/** Which server actions the user menu offers (web UserContextMenu can*) */
export function moderationActions(f: ModerationFacts) {
  const other = !f.self && f.member && f.inferior;
  return {
    roles: f.member && (f.owner || (f.perms.assignRoles && (f.self || f.inferior))),
    timeout: other && f.perms.timeout,
    kick: other && f.perms.kick,
    ban: other && f.perms.ban,
    banUser: !f.self && !f.member && f.perms.ban && !f.perms.memberKnown,
  };
}

/** A role you may give or take (the API: below your own highest; owner any) */
export function canToggleRole(role: { rank: number; managed: boolean }, owner: boolean, myRanking: number) {
  return !role.managed && (owner || role.rank > myRanking);
}

/** The new roles of a member after one tap */
export function toggledRoles(current: string[], roleId: string, known: (id: string) => boolean): string[] {
  const next = current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId];
  return next.filter(known);
}

export const TIMEOUT_SECONDS = [60, 300, 600, 3600, 86400, 604800] as const;

// ---------- report flow ----------

export type ReportStep = "reason" | "sub" | "details" | "review" | "done";
export type ReasonOption = { category: string; subcategories?: string[]; needs_description?: boolean };

/** Sub-reasons on offer; flashing is only for effects and other moving designs */
export function offeredSubs(option: ReasonOption | undefined, kind: string): string[] {
  return option?.subcategories?.filter((s) => s !== "flashing" || kind === "CommunityItem") ?? [];
}

/** The step after picking a reason */
export function afterReason(option: ReasonOption, kind: string): ReportStep {
  return offeredSubs(option, kind).length ? "sub" : "details";
}

/** Back from a step: keeps what was entered */
export function stepBack(step: ReportStep, hasSubs: boolean): ReportStep {
  if (step === "review") return "details";
  if (step === "details" && hasSubs) return "sub";
  return "reason";
}

/** Whether the details are enough to go on (urgent flashing needs no words) */
export function detailsOk(option: ReasonOption | undefined, sub: string | undefined, description: string) {
  return sub === "flashing" || !option?.needs_description || description.trim().length >= 10;
}

export const REPORT_MAX = 1000;

/** The error type the API sent, if any */
export function errorType(error: unknown): string | undefined {
  try {
    const body = typeof error === "string" ? JSON.parse(error) : error;
    return (body as { type?: string })?.type;
  } catch {
    return undefined;
  }
}

// ---------- mutual cache ----------

export type Mutual = { servers: string[]; users: string[] };
const KEEP_MS = 60_000;
const MAX_PEOPLE = 50;
type MutualEntry = { at: number; list: Promise<Mutual | null> };
const mutualCache = new Map<string, MutualEntry>();

/**
 * What the viewer shares with a person, kept for a minute per viewer and
 * person. A refusal is `null` and is not kept (web mutualCache).
 */
export function mutualFor(fetcher: () => Promise<{ servers?: string[]; users?: string[] }>, viewerId: string, userId: string, now: number): Promise<Mutual | null> {
  const key = `${viewerId}:${userId}`;
  const kept = mutualCache.get(key);
  if (kept && now - kept.at < KEEP_MS) return kept.list;
  const entry: MutualEntry = { at: now, list: Promise.resolve(null) };
  entry.list = fetcher().then(
    (m) => ({ servers: m.servers ?? [], users: m.users ?? [] }),
    () => {
      if (mutualCache.get(key) === entry) mutualCache.delete(key);
      return null;
    },
  );
  mutualCache.delete(key);
  mutualCache.set(key, entry);
  if (mutualCache.size > MAX_PEOPLE) mutualCache.delete(mutualCache.keys().next().value!);
  return entry.list;
}

export function clearMutualCache() {
  mutualCache.clear();
}

/** A user id: 26 characters of the ULID alphabet */
export const isUserId = (value: string) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
