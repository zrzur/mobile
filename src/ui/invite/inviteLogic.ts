/**
 * Invites, the pure part: reading a pasted code or link, why a link leads
 * nowhere, and the choices for a new link. Shared by add-server, the invite
 * preview card, the invite page and the tests (web: inviteLink.ts,
 * inviteLogic.ts, inviteOptions.ts).
 */

/**
 * Invite codes are short alphanumeric ids; custom links (zrzur.cc/<name>)
 * may also join words with single hyphens (web: isInviteCode).
 */
const RE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Whether `value` is a plain code that is safe to put in an API path */
export function isInviteCode(value: string): boolean {
  return value.length <= 32 && RE_CODE.test(value);
}

/**
 * Read an invite code from what was pasted: the code itself,
 * `zrzur.cc/{code}` (with or without https://, www., a trailing slash, query
 * or hash), or `…/invite/{code}` on the app's address. Undefined when no
 * valid code is found, so the input never reaches the API path
 * (web: parseInviteCode).
 */
export function parseInviteCode(raw: string): string | undefined {
  const input = raw.trim();
  if (!input) return undefined;
  if (isInviteCode(input)) return input;
  // a link typed without its scheme still reads
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(withScheme);
  if (!match) return undefined;
  const host = match[2].toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  const segments = match[3].split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (!isInviteCode(last)) return undefined;
  // short form: zrzur.cc/{code}
  if (host === "zrzur.cc" && segments.length === 1) return last;
  // app form: …/invite/{code}
  if (segments.length >= 2 && segments[segments.length - 2] === "invite") return last;
  return undefined;
}

/** Why an invite link leads nowhere, as the page words it */
export type DeadReason = "ended" | "paused" | "offline";

/**
 * Read the failure of `GET /invites/{code}`. A link that is unknown, used up
 * or past its date all answer NotFound: "ended" covers the three. Anything
 * else (no connection, a server error) says nothing about the link.
 */
export function deadReason(error: unknown): DeadReason {
  const type = typeof error === "string" ? error : (error as { type?: string } | null)?.type;
  if (type === "InvitesPaused") return "paused";
  if (type === "NotFound" || type === "InvalidOperation" || type === "InvalidInvite") return "ended";
  return "offline";
}

/** A member count in the person's language, in Latin digits like the rest of the app ("1,284") */
export function memberCount(count: number, locale: string): string {
  const value = Math.max(0, Math.floor(count));
  try {
    return new Intl.NumberFormat(locale || "en", { numberingSystem: "latn" }).format(value);
  } catch {
    return String(value);
  }
}

/** What `GET /invites/{code}` answers for a server, with the newer optional fields */
export type ServerInviteInfo = {
  type: "Server";
  code: string;
  server_id: string;
  server_name: string;
  server_icon?: { _id: string } | null;
  server_banner?: { _id: string } | null;
  server_flags?: number | null;
  channel_id: string;
  channel_name: string;
  channel_description?: string | null;
  user_name: string;
  user_avatar?: { _id: string } | null;
  member_count: number;
  server_access?: "Open" | "Approval" | "Locked" | string;
  server_description?: string;
  inside?: { name: string; voice?: boolean }[];
  invites_paused?: boolean;
  /** the server's own custom link: nobody in particular invited */
  custom_link?: boolean;
};

/** Seconds; the server's default too (web: inviteOptions.ts) */
export const DEFAULT_EXPIRY = 7 * 24 * 3600;

/** Seconds until expiry, `null` = never */
export const EXPIRY_CHOICES: (number | null)[] = [1800, 3600, 6 * 3600, 12 * 3600, 86400, DEFAULT_EXPIRY, null];

/** 0 = no limit */
export const USES_CHOICES = [0, 1, 5, 10, 25, 50, 100];

/** The options `Channel.createInvite` takes */
export function inviteRequest(expiresIn: number | null, maxUses: number): { expiresIn: number | null; maxUses?: number } {
  return maxUses ? { expiresIn, maxUses } : { expiresIn };
}

/** The short invite link people share (web: getInviteLink with the zrzur.cc origin) */
export function inviteLink(code: string): string {
  return `https://zrzur.cc/${code}`;
}

/**
 * Friends the invite page lists at once: the first few, so the link and its
 * options stay in view; search finds the rest (owner, 2026-11-23: five,
 * about what the web's 240 px friends box shows).
 */
export const FRIENDS_SHOWN = 5;

/** The friends to list: those matching the search, first `FRIENDS_SHOWN` of them */
export function shownFriends<T>(list: readonly T[], matches?: (item: T) => boolean): T[] {
  const out: T[] = [];
  for (const item of list) {
    if (matches && !matches(item)) continue;
    out.push(item);
    if (out.length === FRIENDS_SHOWN) break;
  }
  return out;
}
