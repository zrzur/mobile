/**
 * Zrzur's own invite and bot links, read exactly like the web's
 * `modal/modals/ownLink.ts`: a website preview of one of these is hidden,
 * because the link shows the server or bot card instead.
 */
export type OwnLink =
  | { kind: "invite"; code: string; path: string }
  | { kind: "bot"; id: string; permissions?: number; path: string };

export type OwnLinkOptions = {
  /** Short invite origin besides zrzur.cc (web: VITE_INVITE_ORIGIN) */
  inviteOrigin?: string;
  /** Origins the app itself runs on, besides app/beta.zrzur.com */
  appOrigins?: (string | undefined)[];
};

const SHORT_ORIGIN = "https://zrzur.cc";
const APP_ORIGINS = ["https://app.zrzur.com", "https://beta.zrzur.com"];
const RE_BOT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const RE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Top-level pages of the app: on its own short origin these are not codes */
const APP_PAGES = new Set([
  "app",
  "auth",
  "b",
  "bot",
  "channel",
  "check",
  "confirm-change",
  "connections",
  "create",
  "delete",
  "designs",
  "dev",
  "developers",
  "discover",
  "friends",
  "home",
  "i",
  "invite",
  "login",
  "oauth2",
  "pwa",
  "resend",
  "reset",
  "server",
  "settings",
  "verify",
  "you",
]);

type Base = { host: string; path: string[] };

function plainHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.(?=:|$)/, "")
    .replace(/^www\./, "");
}

function baseOf(origin: string | undefined): Base | undefined {
  const raw = origin?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return { host: plainHost(url.host), path: url.pathname.split("/").filter(Boolean) };
  } catch {
    return undefined;
  }
}

export function isInviteCode(value: string): boolean {
  return value.length <= 32 && RE_CODE.test(value);
}

function botLink(id: string, query: URLSearchParams): OwnLink | null {
  if (!RE_BOT_ID.test(id)) return null;
  const asked = query.get("permissions");
  const permissions = asked && /^\d+$/.test(asked) ? Number(asked) : 0;
  return Number.isSafeInteger(permissions) && permissions > 0
    ? { kind: "bot", id, permissions, path: `/bot/${id}?permissions=${permissions}` }
    : { kind: "bot", id, path: `/bot/${id}` };
}

function inviteLink(code: string): OwnLink | null {
  return isInviteCode(code) ? { kind: "invite", code, path: `/invite/${code}` } : null;
}

/** Whether `href` is one of our own invite or bot links, and what it points at */
export function parseOwnLink(href: string, options: OwnLinkOptions = {}): OwnLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;

  const host = plainHost(url.host);
  const segments = url.pathname.split("/").filter(Boolean);
  const clean = `/${segments.join("/")}`;
  if (url.pathname !== clean && url.pathname !== `${clean}/`) return null;
  const trailingSlash = url.pathname !== clean;

  const appHosts = new Set(
    [...APP_ORIGINS, ...(options.appOrigins ?? [])].map((origin) => baseOf(origin)?.host).filter(Boolean),
  );

  for (const base of [baseOf(SHORT_ORIGIN), baseOf(options.inviteOrigin)]) {
    if (!base || base.host !== host) continue;
    if (!base.path.every((segment, i) => segments[i] === segment)) continue;
    const rest = segments.slice(base.path.length);
    if (rest.length === 2 && rest[0] === "b") {
      const bot = botLink(rest[1], url.searchParams);
      if (bot) return bot;
    }
    if (rest.length === 1 && !trailingSlash && !(appHosts.has(host) && APP_PAGES.has(rest[0].toLowerCase()))) {
      const invite = inviteLink(rest[0]);
      if (invite) return invite;
    }
  }

  if (!appHosts.has(host)) return null;
  let rest = segments;
  if (rest[0] === "i") {
    const prefixed = rest[1] ? plainHost(rest[1]) : "";
    if (prefixed !== host && !appHosts.has(prefixed)) return null;
    rest = rest.slice(2);
  }
  if (rest.length !== 2) return null;
  if (rest[0] === "invite") return inviteLink(rest[1]);
  if (rest[0] === "bot" || rest[0] === "b") return botLink(rest[1], url.searchParams);
  return null;
}
