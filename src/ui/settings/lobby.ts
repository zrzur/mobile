/**
 * Pure logic of the lobby settings (web: LobbySettings, lobbyAppearance,
 * LobbyRoleQuestionsEditor): the draft, its validation, the saved body,
 * and the welcome (role) questions. No React, no i18n: callers map the
 * problem codes to the exact web messages.
 */
import type { LobbyAppearance, LobbyRoleQuestion, LobbySection, ServerLobby } from "@zrzur/sdk/solid";

export const DEFAULT_SECTIONS: LobbySection[] = ["Start", "News", "About", "Live", "Channels", "Questions", "Newcomers", "Team"];
export const MAX_BUTTONS = 3;
export const MAX_MAIN_CHANNELS = 9;
export const MAX_FAQ = 20;
export const MAX_STAFF_ROLES = 10;
export const MAX_QUESTIONS = 5;
export const MAX_ANSWERS = 8;

type Action = { label: string; channel: string; emoji?: string };
type Faq = { question: string; answer: string };

export type LobbyDraft = {
  enabled: boolean;
  tagline: string;
  about: string;
  accent: string;
  appearance: LobbyAppearance;
  actions: Action[];
  channels: string[];
  faq: Faq[];
  staff_roles: string[];
  /** every section in page order, each on or off */
  sections: { id: LobbySection; on: boolean }[];
  news_channel: string;
  intro_channel: string;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) ?? value;

/** The editable draft of a stored lobby (web: draftOf) */
export function draftOf(lobby?: ServerLobby): LobbyDraft {
  const chosen = lobby?.hide_sections ? [] : lobby?.sections?.length ? lobby.sections : DEFAULT_SECTIONS;
  return {
    enabled: lobby?.enabled ?? false,
    tagline: lobby?.tagline ?? "",
    about: lobby?.about ?? "",
    accent: lobby?.accent ?? "",
    appearance: clone(lobby?.appearance ?? {}),
    actions: clone(lobby?.actions ?? []),
    channels: [...(lobby?.channels ?? [])],
    faq: clone(lobby?.faq ?? []),
    staff_roles: [...(lobby?.staff_roles ?? [])],
    sections: [...chosen.map((id) => ({ id, on: true })), ...DEFAULT_SECTIONS.filter((id) => !chosen.includes(id)).map((id) => ({ id, on: false }))],
    news_channel: lobby?.news_channel ?? "",
    intro_channel: lobby?.intro_channel ?? "",
  };
}

export const sameDraft = (a: LobbyDraft, b: LobbyDraft) => JSON.stringify(a) === JSON.stringify(b);

/** Only persisted six-digit colours, never arbitrary CSS */
export const isLobbyColour = (value?: string | null): value is string => !!value && /^#[0-9a-f]{6}$/i.test(value);

function luminance(hex: string) {
  const [r, g, b] = (hex.slice(1).match(/../g) ?? []).map((part) => {
    const n = parseInt(part, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/** WCAG contrast ratio between two six-digit colours */
export function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A readable foreground on a colour (white, else near black) */
export const inkOn = (hex: string) => (contrast(hex, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#101116");

export type LobbyProblem = "colour" | "contrast" | "buttons" | "faq";

/** The first reason the draft can't be saved (web: validation memo) */
export function lobbyProblem(d: LobbyDraft): LobbyProblem | undefined {
  const a = d.appearance;
  if ([d.accent, a.secondary, a.background, a.surface, a.text].some((c) => c && !isLobbyColour(c))) return "colour";
  const bg = a.background;
  const text = a.text || (bg ? inkOn(bg) : undefined);
  if (text && [bg, a.surface].some((c) => c && contrast(text, c) < 4.5)) return "contrast";
  if (d.actions.some((x) => !x.label.trim() || !x.channel)) return "buttons";
  if (d.faq.some((q) => !q.question.trim() || !q.answer.trim())) return "faq";
  return undefined;
}

/** The whole lobby object sent with server.edit({ lobby }) (web: save) */
export function lobbyBody(d: LobbyDraft, stored?: ServerLobby): ServerLobby {
  const on = d.sections.filter((s) => s.on).map((s) => s.id);
  return {
    enabled: d.enabled,
    tagline: d.tagline.trim() || undefined,
    about: d.about.trim() || undefined,
    accent: d.accent || undefined,
    appearance: clone(d.appearance),
    // edited under Welcome questions; kept as they are
    onboarding: clone(stored?.onboarding ?? []),
    hide_sections: on.length === 0,
    actions: d.actions.filter((x) => x.label.trim() && x.channel).map((x) => ({ ...x, label: x.label.trim() })),
    channels: [...d.channels],
    faq: d.faq.filter((q) => q.question.trim() && q.answer.trim()),
    staff_roles: [...d.staff_roles],
    // the default order with nothing hidden is stored as "default"
    sections: JSON.stringify(on) === JSON.stringify(DEFAULT_SECTIONS) ? [] : on,
    news_channel: d.news_channel || undefined,
    intro_channel: d.intro_channel || undefined,
  };
}

/** The stored lobby with only `enabled` flipped (Show the lobby auto-save) */
export const withEnabled = (stored: ServerLobby | undefined, enabled: boolean): ServerLobby => ({ ...clone(stored ?? {}), enabled });

/** Move one item; out-of-range moves return the list unchanged */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Add or remove an id from an ordered pick list with a maximum */
export const toggleIn = (list: string[], id: string, max: number) => (list.includes(id) ? list.filter((v) => v !== id) : list.length < max ? [...list, id] : list);

/** A size value inside its range, rounded to a whole number */
export const clampStep = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

// ---- Welcome questions (onboarding role questions) ----

/** Bits an ordinary member role may hold (web: PUBLIC_ROLE_BITS) */
export const PUBLIC_ROLE_BITS = [10, 12, 20, 21, 22, 25, 26, 27, 29, 30, 31, 32, 36, 41].reduce((m, b) => m | (1n << BigInt(b)), 0n);

/** A role with no moderation or admin permission */
export const isOrdinary = (allow: bigint) => (allow & ~PUBLIC_ROLE_BITS) === 0n;

export type QuestionRole = { id: string; name: string; colour?: string; rank: number; managed: boolean; ordinary: boolean };

/** Roles an answer may give: not managed, ordinary, and below the user (the owner may use all) */
export const eligibleRoles = (roles: QuestionRole[], isOwner: boolean, myRank: number) => roles.filter((r) => !r.managed && r.ordinary && (isOwner || r.rank > myRank));

export type RoleQuestion = { id: string; question: string; description?: string; options: { id: string; label: string; role: string }[] };

/** Normalise a stored question list (null vs missing, absent description) */
export const questionsOf = (list?: LobbyRoleQuestion[]): RoleQuestion[] =>
  (list ?? []).map((q) => ({ id: q.id, question: q.question ?? "", ...(q.description ? { description: q.description } : {}), options: (q.options ?? []).map((o) => ({ id: o.id, label: o.label ?? "", role: o.role ?? "" })) }));

/** Dirty check that ignores null vs missing and empty descriptions */
export const sameQuestions = (a: RoleQuestion[], b: RoleQuestion[]) => JSON.stringify(questionsOf(a)) === JSON.stringify(questionsOf(b));

export type QuestionErrors = { question: Record<string, boolean>; label: Record<string, boolean>; role: Record<string, boolean> };

/** Field errors; `invalid` is true when anything stops the save */
export function questionsProblem(list: RoleQuestion[], roleIds: Set<string>): { invalid: boolean; errors: QuestionErrors } {
  const errors: QuestionErrors = { question: {}, label: {}, role: {} };
  let invalid = false;
  for (const q of list) {
    if (!q.question.trim()) errors.question[q.id] = invalid = true;
    if (!q.options.length) invalid = true;
    for (const o of q.options) {
      if (!o.label.trim()) errors.label[o.id] = invalid = true;
      if (!o.role || !roleIds.has(o.role)) errors.role[o.id] = invalid = true;
    }
  }
  return { invalid, errors };
}

/** Trimmed questions as stored */
export const questionsBody = (list: RoleQuestion[]): LobbyRoleQuestion[] =>
  list.map((q) => ({ id: q.id, question: q.question.trim(), description: q.description?.trim() || undefined, options: q.options.map((o) => ({ id: o.id, label: o.label.trim(), role: o.role })) }));

/** The lobby object saved by Welcome questions: the current lobby with new onboarding */
export const lobbyWithQuestions = (stored: ServerLobby | undefined, list: RoleQuestion[]): ServerLobby => ({ ...clone(stored ?? {}), enabled: stored?.enabled ?? false, onboarding: questionsBody(list) });
