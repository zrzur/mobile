/**
 * Pure logic of the lobby members see (web: src/interface/lobby/Lobby.tsx).
 * Works on plain snapshots of channels and members so it is unit tested
 * and the screen re-renders only when a snapshot changes.
 */
import type { LobbySection } from "@zrzur/sdk/solid";

import { DEFAULT_SECTIONS } from "@/ui/settings/lobby";

/** The busiest channels shown when the managers picked none */
export const AUTO_CHANNELS = 6;
/** Faces shown per voice room before "+N" */
export const FACES = 4;
export const WEEK = 7 * 24 * 60 * 60 * 1000;
/** Sections about people and right now (the web's side column; on a phone after the rest) */
export const SIDE: LobbySection[] = ["Live", "Newcomers", "Team"];

export type StepId = "rules" | "hello" | "voice" | "profile";

export type LobbyChannel = {
  id: string;
  name: string;
  voice: boolean;
  announcement: boolean;
  readable: boolean;
  canSend: boolean;
  unread: boolean;
  mentions: number;
  lastMessageId?: string;
  /** user ids in the voice room */
  voiceUsers: string[];
};

/** The sections in the managers' order (web: sections()) */
export function lobbySections(lobby: { hide_sections?: boolean; sections?: LobbySection[] } | undefined): LobbySection[] {
  if (lobby?.hide_sections) return [];
  return lobby?.sections?.length ? lobby.sections : DEFAULT_SECTIONS;
}

/** Reading sections first, then the people and right-now ones, as the web stacks them on a phone */
export function phoneOrder(sections: LobbySection[]): { main: LobbySection[]; side: LobbySection[] } {
  return { main: sections.filter((s) => !SIDE.includes(s)), side: sections.filter((s) => SIDE.includes(s)) };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The time a ULID was made (web: ulid decodeTime) */
export function ulidTime(id: string): number {
  let time = 0;
  for (const char of id.slice(0, 10).toUpperCase()) {
    const value = CROCKFORD.indexOf(char);
    if (value < 0) return 0;
    time = time * 32 + value;
  }
  return time;
}

/** A message within five minutes counts as "Active now" */
export const isLive = (id: string | undefined, now: number) => !!id && now - ulidTime(id) < 300_000;

/** "5 minutes ago", "3 hours ago", "2 days ago" (web: relative) */
export function relativeTime(time: number, now: number, locale: string): string {
  const minutes = Math.round((now - time) / 60_000);
  let format: Intl.RelativeTimeFormat;
  try {
    format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  return minutes < 60 ? format.format(-Math.max(minutes, 0), "minute") : minutes < 60 * 24 ? format.format(-Math.round(minutes / 60), "hour") : format.format(-Math.round(minutes / 60 / 24), "day");
}

/** Compact from ten thousand on (web: number) */
export function lobbyNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(value);
  }
}

const newestFirst = (a: LobbyChannel, b: LobbyChannel) => (b.lastMessageId ?? "").localeCompare(a.lastMessageId ?? "");

/** Chosen channels, or the text channels with the newest messages */
export function mainChannels(channels: LobbyChannel[], chosen: string[] | undefined, limit: number | undefined): LobbyChannel[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const picked = (chosen ?? []).map((id) => byId.get(id)).filter((c): c is LobbyChannel => !!c && c.readable);
  if (picked.length) return picked.slice(0, limit ?? 9);
  return channels
    .filter((c) => !c.voice && c.readable)
    .sort(newestFirst)
    .slice(0, limit ?? AUTO_CHANNELS);
}

/** Where this member left off: unread mentions first, then unread channels */
export function jumpBack(channels: LobbyChannel[]): LobbyChannel[] {
  return channels
    .filter((c) => !c.voice && c.readable && (c.unread || c.mentions > 0))
    .sort((a, b) => b.mentions - a.mentions || newestFirst(a, b))
    .slice(0, 4);
}

/** Voice rooms with people in them */
export const voiceRooms = (channels: LobbyChannel[]) => channels.filter((c) => c.voice && c.voiceUsers.length > 0 && c.readable);

/** The channel where newcomers say hello (web: intro) */
export function introChannel(channels: LobbyChannel[], introId: string | undefined, firstAction: string | undefined, main: LobbyChannel[]): LobbyChannel | undefined {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const c = (introId ? byId.get(introId) : undefined) ?? (firstAction ? byId.get(firstAction) : undefined) ?? main[0];
  return c && c.readable && c.canSend ? c : undefined;
}

/** Latest news: the chosen channel, or the first announcement channel */
export function newsChannel(channels: LobbyChannel[], newsId: string | undefined): LobbyChannel | undefined {
  const c = (newsId ? channels.find((x) => x.id === newsId) : undefined) ?? channels.find((x) => x.announcement && x.readable);
  return c?.readable ? c : undefined;
}

export type Step = { id: StepId; done: boolean; channel?: LobbyChannel };

/** What a new member does first; each step ticks itself off (web: startSteps) */
export function startSteps(input: { rules?: LobbyChannel; rulesReadKnown: boolean; hello?: LobbyChannel; voice?: LobbyChannel; hasAvatar: boolean; done: StepId[] }): Step[] {
  const list: Step[] = [];
  if (input.rules) list.push({ id: "rules", done: input.done.includes("rules") || (input.rulesReadKnown && !input.rules.unread), channel: input.rules });
  if (input.hello) list.push({ id: "hello", done: input.done.includes("hello"), channel: input.hello });
  if (input.voice) list.push({ id: "voice", done: input.done.includes("voice"), channel: input.voice });
  list.push({ id: "profile", done: input.hasAvatar });
  return list;
}

/** "Start here" shows while there is more than one step and not all are done */
export const showStart = (steps: Step[]) => steps.length > 1 && steps.some((s) => !s.done);

/** Steps done, kept on this device: parse what was stored */
export function parseSteps(raw: string | null | undefined): StepId[] {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((s): s is StepId => s === "rules" || s === "hello" || s === "voice" || s === "profile") : [];
  } catch {
    return [];
  }
}

export type LobbyMember = { userId: string; name: string; joinedAt: number; roles: string[]; bot: boolean; avatar?: string };

/** This week's arrivals, newest first, no bots */
export const newcomers = (members: LobbyMember[], now: number) => members.filter((m) => now - m.joinedAt < WEEK && !m.bot).sort((a, b) => b.joinedAt - a.joinedAt);

export type StaffRole = { id: string; name: string; colour?: string; rank: number };
export type StaffGroup = { key: string; label?: string; colour?: string; owner: boolean; people: { id: string; name: string; member?: LobbyMember }[] };

/** The owner, then members of the chosen roles, highest role first; nobody twice */
export function staffGroups(owner: { id: string; name: string } | undefined, roles: StaffRole[], members: LobbyMember[]): StaffGroup[] {
  const groups: StaffGroup[] = [];
  const listed = new Set<string>();
  if (owner) {
    listed.add(owner.id);
    groups.push({ key: "owner", owner: true, people: [{ id: owner.id, name: owner.name }] });
  }
  for (const role of [...roles].sort((a, b) => a.rank - b.rank)) {
    const people = members
      .filter((m) => m.roles.includes(role.id) && !listed.has(m.userId))
      .map((m) => {
        listed.add(m.userId);
        return { id: m.userId, name: m.name, member: m };
      });
    if (people.length) groups.push({ key: role.id, label: role.name, colour: role.colour, owner: false, people });
  }
  return groups;
}

/** Questions that match the search words (web: faq) */
export function filterFaq<T extends { question: string; answer: string }>(list: T[], query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? list.filter((e) => e.question.toLocaleLowerCase().includes(q) || e.answer.toLocaleLowerCase().includes(q)) : list;
}

/** The server's count is a snapshot from load; the fetched list is current */
export const memberCount = (approximate: number, fetched: number | undefined) => Math.max(approximate, fetched ?? 0);

/** New in the last week, or back */
export const greetingKind = (joinedAt: number, now: number): "new" | "back" => (now - joinedAt < WEEK ? "new" : "back");

// ---- Appearance (web: lobbyAppearance lobbyStyle) ----

/** Mix two six-digit colours: `share` (0 to 1) of `a`, the rest `b` */
export function mix(a: string, b: string, share: number): string {
  const pa = a.slice(1).match(/../g)!.map((x) => parseInt(x, 16));
  const pb = b.slice(1).match(/../g)!.map((x) => parseInt(x, 16));
  return `#${pa.map((v, i) => Math.round(v * share + pb[i] * (1 - share)).toString(16).padStart(2, "0")).join("")}`;
}

/** A six-digit colour as rgba with an alpha */
export const alpha = (hex: string, a: number) => {
  const [r, g, b] = hex.slice(1).match(/../g)!.map((x) => parseInt(x, 16));
  return `rgba(${r},${g},${b},${a})`;
};

export type LobbyLook = {
  accent?: string;
  /** page background, when the managers set one */
  page?: string;
  /** card background, when set (or lifted from the page colour) */
  card?: string;
  /** text on the page and cards, when set */
  ink?: string;
  heading?: string;
  radius: number;
  bannerHeight: number;
  gap: number;
  banner: "Server" | "Gradient" | "Hidden";
};

/**
 * The managers' colours as plain values (web: lobbyStyle), only valid
 * six-digit colours, readable text worked out like the web.
 */
export function lobbyLook(lobby: { accent?: string; appearance?: Record<string, unknown> } | undefined, valid: (c?: string | null) => c is string, inkOn: (hex: string) => string, contrast: (a: string, b: string) => number): LobbyLook {
  const a = (lobby?.appearance ?? {}) as { background?: string; surface?: string; text?: string; radius?: number; banner_height?: number; density?: string; banner_mode?: string };
  const accent = valid(lobby?.accent) ? lobby!.accent : undefined;
  const background = valid(a.background) ? a.background : undefined;
  const surface = valid(a.surface) ? a.surface : undefined;
  const text = (valid(a.text) ? a.text : undefined) ?? (background ? inkOn(background) : undefined);
  const card = surface ?? (background ? mix(background, text ?? "#FFFFFF", 0.9) : undefined);
  const ink = surface ? ((valid(a.text) ? a.text : undefined) ?? inkOn(surface)) : text;
  const heading = accent && (background || surface) ? (contrast(accent, (surface ?? background)!) >= 3 ? accent : (text ?? inkOn(surface!))) : accent;
  return {
    accent,
    page: background,
    card,
    ink,
    heading,
    radius: typeof a.radius === "number" ? a.radius : 14,
    // phones: clamp(100px, height, 180px)
    bannerHeight: Math.min(180, Math.max(100, typeof a.banner_height === "number" ? a.banner_height : 208)),
    gap: a.density === "Compact" ? 8 : 12,
    banner: a.banner_mode === "Gradient" || a.banner_mode === "Hidden" ? a.banner_mode : "Server",
  };
}
