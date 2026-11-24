import { HEX } from "./profile-catalog";

/** The look fields of `user.style` the profile form edits */
export type LookStyle = {
  theme?: string[];
  name_font?: string;
  name_colour?: string[];
  decoration?: string;
  nameplate?: string;
  effect?: string;
  effect_file?: string;
};

/** Read the style the API attached to a user, dropping empty values */
export function cleanStyle(style: Record<string, unknown> | null | undefined): LookStyle {
  const out: LookStyle = {};
  if (!style) return out;
  const colours = (v: unknown) => (Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, 2) : []);
  const theme = colours(style.theme);
  if (theme.length) out.theme = theme;
  const name = colours(style.name_colour);
  if (name.length) out.name_colour = name;
  for (const key of ["name_font", "decoration", "nameplate", "effect", "effect_file"] as const) {
    const v = style[key];
    if (typeof v === "string" && v && !(key === "name_font" && v === "default")) out[key] = v;
  }
  return out;
}

export const sameStyle = (a: LookStyle, b: LookStyle) => JSON.stringify(cleanStyle(a)) === JSON.stringify(cleanStyle(b));

/** What the form started from (user + profile) */
export type ProfileOriginal = { displayName: string; pronouns: string; bio: string; style: LookStyle };

/** What the person changed; avatar/banner: undefined = kept, null = removed, string = new upload id */
export type ProfileDraft = { displayName: string; pronouns: string; bio: string; style: LookStyle; avatar?: string | null; banner?: string | null };

export function isDirty(original: ProfileOriginal, draft: ProfileDraft): boolean {
  return (
    draft.displayName.trim() !== original.displayName ||
    draft.pronouns.trim() !== original.pronouns ||
    draft.bio.trim() !== original.bio.trim() ||
    draft.avatar !== undefined ||
    draft.banner !== undefined ||
    !sameStyle(original.style, draft.style)
  );
}

/** The one PATCH /users/@me body for Save changes (web EditProfile) */
export function buildUserEdit(original: ProfileOriginal, draft: ProfileDraft): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const remove: string[] = [];
  const profile: Record<string, unknown> = {};

  const name = draft.displayName.trim();
  if (name !== original.displayName) {
    if (name) data.display_name = name;
    else remove.push("DisplayName");
  }
  const pronouns = draft.pronouns.trim();
  if (pronouns !== original.pronouns) {
    if (pronouns) data.pronouns = pronouns;
    else remove.push("Pronouns");
  }
  const bio = draft.bio.trim();
  if (bio !== original.bio.trim()) {
    if (bio) profile.content = bio;
    else remove.push("ProfileContent");
  }
  if (draft.avatar === null) remove.push("Avatar");
  else if (draft.avatar) data.avatar = draft.avatar;
  if (draft.banner === null) remove.push("ProfileBackground");
  else if (draft.banner) profile.background = draft.banner;
  if (!sameStyle(original.style, draft.style)) data.style = cleanStyle(draft.style);

  if (Object.keys(profile).length) data.profile = profile;
  if (remove.length) data.remove = remove;
  return data;
}

/** "Gradient" / "Solid colour" / "No colour" */
export const colourKind = (colours: string[] | undefined): "gradient" | "solid" | "none" =>
  colours?.length === 2 ? "gradient" : colours?.length === 1 ? "solid" : "none";

// ---------- links ----------

export const MAX_LINKS = 5;

/** The site address shown under a link field, when it starts with https:// */
export function linkHost(value: string): string | undefined {
  const v = value.trim();
  if (!v.toLowerCase().startsWith("https://")) return undefined;
  const host = v.slice(8).split(/[/?#]/)[0];
  return host || undefined;
}

/** Why a link can't be saved: not https, or no real site address */
export function linkProblem(value: string): "https" | "host" | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!v.toLowerCase().startsWith("https://")) return "https";
  const host = linkHost(v);
  if (!host || !/^[^\s.:@]+(\.[^\s.:@]+)+(:\d+)?$/.test(host)) return "host";
  return undefined;
}

export const cleanLinks = (links: string[]) => links.map((l) => l.trim()).filter(Boolean);

// ---------- profile sections ----------

export const SECTION_IDS = ["about", "links", "creations", "wearing", "member_since", "connections", "games"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
const CREATOR_ONLY: SectionId[] = ["creations", "wearing"];

export type SectionRow = { id: SectionId; shown: boolean };

/** The list the person orders: saved order first, then hidden, then the rest */
export function initialSections(sections: string[] | undefined, hidden: string[], creator: boolean): SectionRow[] {
  const offered = SECTION_IDS.filter((id) => creator || !CREATOR_ONLY.includes(id));
  const known = (id: string): id is SectionId => (offered as readonly string[]).includes(id);
  if (!sections) return offered.map((id) => ({ id, shown: !hidden.includes(id) }));
  const rows: SectionRow[] = [];
  for (const id of sections) if (known(id) && !rows.some((r) => r.id === id)) rows.push({ id, shown: !hidden.includes(id) });
  for (const id of hidden) if (known(id) && !rows.some((r) => r.id === id)) rows.push({ id, shown: false });
  // a section the saved list doesn't name is new: shown at its place
  for (const id of offered) if (!rows.some((r) => r.id === id)) rows.push({ id, shown: true });
  return rows;
}

/** Move one row up (-1) or down (+1) */
export function moveSection(rows: SectionRow[], index: number, by: -1 | 1): SectionRow[] {
  const to = index + by;
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The PATCH profile body; ids this phone doesn't know stay hidden as they were */
export function sectionsBody(rows: SectionRow[], savedHidden: string[]): { sections: string[]; hidden_sections: string[] } {
  const ids = rows.map((r) => r.id as string);
  const unknown = savedHidden.filter((id) => !ids.includes(id));
  return { sections: rows.filter((r) => r.shown).map((r) => r.id), hidden_sections: [...rows.filter((r) => !r.shown).map((r) => r.id), ...unknown] };
}

// ---------- badges ----------

export type OwnBadge = { badge: string; source: string; granted_at: number; expires_at?: number | null; revoked_at?: number | null; revoke_reason?: string | null; hidden: boolean };

export type BadgeMeta = { id: string; bit: number; tier: 0 | 1 | 2; priority: number; colours: [string, string]; retired?: boolean };

const meta = (id: string, bit: number, tier: 0 | 1 | 2, priority: number, colours: [string, string], retired?: boolean): BadgeMeta => ({ id, bit, tier, priority, colours, retired });

/** The badge catalogue (web badges/catalog.ts) */
export const BADGES: BadgeMeta[] = [
  meta("founder", 16, 2, 5, ["#454B6E", "#1F2338"]),
  meta("staff", 262144, 2, 10, ["#9F88FF", "#5E46C8"]),
  meta("developer", 1, 1, 20, ["#5C9BEA", "#2F63B8"]),
  meta("platform_moderator", 32, 1, 25, ["#4F8DB8", "#2C5D80"]),
  meta("partner", 524288, 1, 30, ["#4A9DB3", "#2A6C83"]),
  meta("super_creator", 8192, 2, 40, ["#CF7BEB", "#7A52E0"]),
  meta("creator", 4096, 1, 45, ["#A783F0", "#6E4FC9"]),
  meta("verified_server_owner", 16777216, 1, 46, ["#5E86C4", "#3A5F9A"]),
  meta("verified_bot_developer", 33554432, 1, 47, ["#6FB0C9", "#3F7890"]),
  meta("saha_champion", 67108864, 1, 48, ["#E3B93F", "#A97F1C"]),
  meta("elite_bug_hunter", 32768, 2, 50, ["#E8B04A", "#B0702A"]),
  meta("community_helper", 134217728, 1, 52, ["#E08A7A", "#B0503F"]),
  meta("bug_hunter", 16384, 1, 55, ["#D4924A", "#9C5F27"]),
  meta("big_community", 8388608, 1, 57, ["#7C8FD0", "#4A5BA0"]),
  meta("community_builder", 4194304, 0, 58, ["#C97F6A", "#8F4B3A"]),
  meta("beta_tester", 65536, 0, 60, ["#5DB0D4", "#2F7899"]),
  meta("beta_veteran", 131072, 1, 65, ["#C09A5E", "#7D5F31"]),
  meta("plus", 2048, 1, 70, ["#D92654", "#AD1A40"]),
  meta("early_supporter", 4, 1, 75, ["#DD6F88", "#9E4058"]),
  meta("early_adopter", 256, 0, 80, ["#7DAA62", "#4C7240"]),
  meta("three_years", 2097152, 1, 82, ["#4F9A7A", "#2C6A4F"]),
  meta("one_year", 1048576, 0, 83, ["#6FA8A0", "#3D746C"]),
  meta("translator", 2, 0, 90, ["#7290B3", "#4B6687"], true),
  meta("responsible_disclosure", 8, 1, 91, ["#6E7890", "#474F63"], true),
  meta("supporter", 64, 0, 92, ["#A6819A", "#755467"], true),
  meta("reserved_1", 512, 0, 94, ["#7E8396", "#555A6B"], true),
  meta("reserved_2", 1024, 0, 95, ["#7E8396", "#555A6B"], true),
];

export const badgeMeta = (id: string) => BADGES.find((b) => b.id === id);

/** A held badge: from a grant, or from live state (Feather, early adopter bit) */
export type ShownBadge = { meta: BadgeMeta; grant?: OwnBadge };

export const heldGrant = (grant: OwnBadge, now: number) => !grant.revoked_at && (!grant.expires_at || grant.expires_at > now);

/** Badges you hold, most important first (web MyBadges `held`) */
export function heldBadges(mine: { badges: OwnBadge[]; plus: boolean }, bits: number, now: number): ShownBadge[] {
  const shown: ShownBadge[] = [];
  for (const grant of mine.badges) {
    const m = badgeMeta(grant.badge);
    if (m && heldGrant(grant, now) && !shown.some((s) => s.meta.id === m.id)) shown.push({ meta: m, grant });
  }
  const add = (id: string) => {
    const m = badgeMeta(id);
    if (m && !shown.some((s) => s.meta.id === id)) shown.push({ meta: m });
  };
  if (mine.plus) add("plus");
  if (bits & 256) add("early_adopter");
  return shown.sort((a, b) => a.meta.priority - b.meta.priority);
}

/** Every badge that can still be earned (not retired, not founder) */
export const collectable = () => BADGES.filter((b) => !b.retired && b.id !== "founder");

/** Badges still to earn */
export const earnable = (held: ShownBadge[]) => collectable().filter((b) => !held.some((h) => h.meta.id === b.id));

/** Grants that ended (revoked or expired) */
export const pastBadges = (mine: { badges: OwnBadge[] }, now: number) => mine.badges.filter((g) => !heldGrant(g, now) && badgeMeta(g.badge));

/** Why a past badge ended */
export function endReason(grant: OwnBadge): "expired" | "ineligible" | "removed" {
  if (grant.revoke_reason === "expired" || (!grant.revoked_at && grant.expires_at)) return "expired";
  if (grant.revoke_reason === "no longer eligible") return "ineligible";
  return "removed";
}

// ---------- server identity ----------

/** PATCH /servers/{server}/members/{user} body; avatar: undefined kept, null removed, string new id */
export function memberEdit(original: { nickname: string; pronouns: string }, draft: { nickname: string; pronouns: string; avatar?: string | null }): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const remove: string[] = [];
  const nick = draft.nickname.trim();
  if (nick !== original.nickname) {
    if (nick) data.nickname = nick;
    else remove.push("Nickname");
  }
  const pronouns = draft.pronouns.trim();
  if (pronouns !== original.pronouns) {
    if (pronouns) data.pronouns = pronouns;
    else remove.push("Pronouns");
  }
  if (draft.avatar === null) remove.push("Avatar");
  else if (draft.avatar) data.avatar = draft.avatar;
  if (remove.length) data.remove = remove;
  return data;
}

/** A file size the way the web's humanFileSize writes it (KB / MB, base 1000) */
export function humanSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}
