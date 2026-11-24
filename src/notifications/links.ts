/**
 * Links that open the app: `zrzur://…`, the web app's addresses on
 * https://app.zrzur.com and the short invite links on https://zrzur.cc,
 * plus the targets push notifications carry. Pure, so `+native-intent`, the
 * notification handlers and the tests share one reading of an address.
 *
 * The web app's addresses (src/app.tsx routes, src/redirects.tsx):
 *   /invite/{code}                     invite (zrzur.cc/{code} is the short form)
 *   /bot/{id}, /b/{id}                 add a bot
 *   /server/{s}/channel/{c}/{message}  a channel in a server, optionally a message
 *   /channel/{c}/{message}             a direct message, group or any channel
 *   /server/{s}                        a server (also /server/{s}/lobby, /events)
 *   /friends?profile={user}            someone's profile (friend request pushes)
 *   /e/{path}                          an event link
 *   /discover/{link or id}             a listed server's page (/discover/bots/{id}: a bot)
 *   /login/verify/{code}, /login/reset/{token}
 *   /login/delete/{token}              confirm deleting the account
 *   /login/confirm-change/{token}      confirm or decline a support change
 *   /designs/{…}                       Designs: the gallery, a kind, a design,
 *                                      creators, a creator, favourites
 *                                      (designs.zrzur.com/{…} is the public site)
 */

import { designsHref } from "@/ui/designs/routes";

/** Hosts whose https links are the web app */
export const APP_HOSTS = ["app.zrzur.com"] as const;
/** Host of the public Designs site: designs.zrzur.com/{slug} is /designs/{slug} */
export const DESIGNS_HOSTS = ["designs.zrzur.com"] as const;
/** Hosts of the short invite links (zrzur.cc/{code}, zrzur.cc/b/{bot}) */
export const INVITE_HOSTS = ["zrzur.cc"] as const;
/** The app's own scheme */
export const SCHEME = "zrzur";
/** Where the web app lives, for links this app hands out */
export const APP_ORIGIN = "https://app.zrzur.com";

export type DeepLink =
  | { kind: "verify"; code: string }
  | { kind: "reset"; token: string }
  | { kind: "delete"; token: string }
  | { kind: "confirm-change"; token: string }
  | { kind: "invite"; code: string }
  | { kind: "bot"; id: string; permissions?: number }
  | { kind: "channel"; channelId: string; serverId?: string; messageId?: string }
  | { kind: "server"; serverId: string }
  | { kind: "user"; userId: string }
  | { kind: "event"; path: string }
  | { kind: "discover"; slug: string }
  | { kind: "designs"; href: string }
  | { kind: "page"; page: "home" | "friends" | "discover" | "settings" | "notifications" };

/** Invite codes: short alphanumeric ids, custom links join words with single hyphens (web: isInviteCode) */
const RE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
export function isInviteCode(value: string): boolean {
  return value.length <= 32 && RE_CODE.test(value);
}

/** Discover's own list pages (topics, languages): not a server's page */
const DISCOVER_PAGES: ReadonlySet<string> = new Set([
  "servers", "gaming", "community", "education", "technology", "art", "music", "entertainment",
  "anime", "sports", "science", "languages", "other", "ar", "en", "de",
]);

/** Object ids (ULIDs) */
const RE_ID = /^[0-9A-Za-z]{1,32}$/;
export function isId(value: string | undefined): value is string {
  return !!value && RE_ID.test(value);
}

/** Tokens in verify and reset links */
const RE_TOKEN = /^[A-Za-z0-9_-]+$/;

type Parts = { host: string; segments: string[]; query: Record<string, string> };

function decode(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

function readQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    const key = decode(k.replace(/\+/g, " "));
    const value = decode(v.replace(/\+/g, " "));
    if (key !== undefined && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Split an address into host, path segments and query. `host` is "" for an
 * in-app path and the scheme's first part for `zrzur://`. Undefined for
 * other schemes (the development client's own links pass through).
 */
function split(url: string): Parts | undefined {
  const trimmed = url.trim();
  const noHash = trimmed.split("#")[0];
  const [front, search = ""] = noHash.split("?");
  let host = "";
  let path = front;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(front);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    const rest = scheme[2];
    if (name === SCHEME) {
      // zrzur://invite/abc and zrzur:///invite/abc mean the same page
      host = SCHEME;
      path = rest;
    } else if (name === "https" || name === "http") {
      const slash = rest.indexOf("/");
      host = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
      path = slash === -1 ? "" : rest.slice(slash);
    } else {
      return undefined;
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(front)) {
    return undefined;
  }
  const segments: string[] = [];
  for (const raw of path.split("/")) {
    if (!raw) continue;
    const part = decode(raw);
    if (part === undefined) return undefined;
    segments.push(part);
  }
  return { host, segments, query: readQuery(search) };
}

function botLink(id: string | undefined, query: Record<string, string>): DeepLink | undefined {
  if (!isId(id)) return undefined;
  const asked = Number(query.permissions);
  return Number.isSafeInteger(asked) && asked > 0 ? { kind: "bot", id, permissions: asked } : { kind: "bot", id };
}

/** Read a path of the web app (also used for `zrzur://` links) */
function readAppPath(segments: string[], query: Record<string, string>): DeepLink | undefined {
  // sign-up and password links: /verify/x, /login/verify/x, /reset/x, /login/reset/x
  const s = segments[0] === "login" ? segments.slice(1) : segments;
  if (s[0] === "verify" && s[1] && RE_TOKEN.test(s[1])) return { kind: "verify", code: s[1] };
  if (s[0] === "reset" && s[1] && RE_TOKEN.test(s[1])) return { kind: "reset", token: s[1] };
  if (s[0] === "delete" && s[1] && RE_TOKEN.test(s[1])) return { kind: "delete", token: s[1] };
  if (s[0] === "confirm-change" && s[1] && RE_TOKEN.test(s[1])) return { kind: "confirm-change", token: s[1] };

  const [first, second, third, fourth, fifth] = segments;
  switch (first) {
    case undefined:
    case "app":
    case "pwa":
      return { kind: "page", page: "home" };
    case "invite":
    case "invite-dialog":
      return second && isInviteCode(second) ? { kind: "invite", code: second } : undefined;
    case "bot":
    case "b":
      return botLink(second, query);
    case "server": {
      if (!isId(second)) return undefined;
      if (third === "channel" && isId(fourth)) {
        return { kind: "channel", serverId: second, channelId: fourth, ...(isId(fifth) ? { messageId: fifth } : {}) };
      }
      return { kind: "server", serverId: second };
    }
    case "channel":
      if (!isId(second)) return undefined;
      return { kind: "channel", channelId: second, ...(isId(third) ? { messageId: third } : {}) };
    case "user":
    case "profile":
      return isId(second) ? { kind: "user", userId: second } : undefined;
    case "friends":
      return isId(query.profile) ? { kind: "user", userId: query.profile } : { kind: "page", page: "friends" };
    case "discover": {
      // /discover/bots/{id} is a bot's page; /discover/servers/{id} and
      // /discover/{custom link} a server's; topics and languages are the list
      if (second === "bots") return isId(third) ? { kind: "bot", id: third } : { kind: "page", page: "discover" };
      const slug = second === "servers" ? third : second;
      if (slug && isInviteCode(slug) && !DISCOVER_PAGES.has(slug)) return { kind: "discover", slug };
      return { kind: "page", page: "discover" };
    }
    case "settings":
      return { kind: "page", page: "settings" };
    case "notifications":
    case "inbox":
      return { kind: "page", page: "notifications" };
    case "e":
      return second ? { kind: "event", path: segments.slice(1).join("/") } : undefined;
    case "designs":
      return { kind: "designs", href: designsHref(segments.slice(1)) };
    default:
      return undefined;
  }
}

/**
 * Read any address the app may be opened with. Undefined when it is not one
 * of ours (another scheme, another website, an unknown page).
 */
export function parseDeepLink(url: string): DeepLink | undefined {
  const parts = split(url);
  if (!parts) return undefined;
  const { host, segments, query } = parts;
  if ((INVITE_HOSTS as readonly string[]).includes(host)) {
    // zrzur.cc/{code}, zrzur.cc/b/{bot}, zrzur.cc/invite/{code}
    if (segments.length === 1 && isInviteCode(segments[0])) return { kind: "invite", code: segments[0] };
    if (segments[0] === "b" || segments[0] === "bot") return botLink(segments[1], query);
    if (segments[0] === "invite" && segments[1] && isInviteCode(segments[1])) return { kind: "invite", code: segments[1] };
    return undefined;
  }
  if ((DESIGNS_HOSTS as readonly string[]).includes(host)) return { kind: "designs", href: designsHref(segments) };
  if (host === "" || host === SCHEME || (APP_HOSTS as readonly string[]).includes(host)) {
    return readAppPath(segments, query);
  }
  return undefined;
}

/**
 * The screen of this app a link opens. Invites open their preview card
 * first (web: /invite/{code}), bots the add-bot page, events their page
 * (`/e/{path}`, `/e/join/{code}`).
 */
export function linkHref(link: DeepLink): string {
  switch (link.kind) {
    case "verify":
      return `/verify/${link.code}`;
    case "reset":
      return `/reset/${link.token}`;
    case "delete":
      return `/delete/${link.token}`;
    case "confirm-change":
      return `/confirm-change/${link.token}`;
    case "invite":
      return `/invite-preview/${encodeURIComponent(link.code)}`;
    case "channel":
      return link.messageId ? `/channel/${link.channelId}?message=${link.messageId}` : `/channel/${link.channelId}`;
    case "server":
      return `/server/${link.serverId}`;
    case "user":
      return `/friends?profile=${link.userId}`;
    case "page":
      return `/${link.page}`;
    case "bot":
      return link.permissions ? `/bot/${link.id}?permissions=${link.permissions}` : `/bot/${link.id}`;
    case "event":
      return `/e/${link.path.split("/").map(encodeURIComponent).join("/")}`;
    case "discover":
      return `/discover/${encodeURIComponent(link.slug)}`;
    case "designs":
      return link.href;
  }
}

/** Links that work signed out (the email's token is the proof) */
const SIGNED_OUT: ReadonlySet<DeepLink["kind"]> = new Set(["verify", "reset", "delete", "confirm-change"]);

/** Whether the screen a link opens needs a signed-in account */
export function needsAccount(link: DeepLink): boolean {
  return !SIGNED_OUT.has(link.kind);
}

/** The web app's address of a channel (web: ChannelContextMenu copyLink) */
export function channelLink(channelId: string, serverId?: string): string {
  return `${APP_ORIGIN}${serverId ? `/server/${serverId}` : ""}/channel/${channelId}`;
}

/** What a notification's data says to open, and which channel it is about */
export type PushTarget = { href: string; channelId?: string };

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Read the target out of a notification's data. Covers the three shapes:
 * - notifications this app shows itself: `{ href, channelId }`
 * - Apple pushes from pushd: `{ url, message: { channel } }` (whole payload)
 * - Firebase data messages from pushd: `{ type, channel | id | channel_id }`
 */
export function pushTarget(data: Record<string, unknown> | null | undefined): PushTarget | undefined {
  if (!data) return undefined;
  const href = str(data.href);
  if (href && href.startsWith("/")) return { href, channelId: str(data.channelId) };

  const url = str(data.url);
  if (url) {
    const link = parseDeepLink(url);
    if (link && needsAccount(link)) {
      return { href: linkHref(link), channelId: link.kind === "channel" ? link.channelId : undefined };
    }
  }

  const type = str(data.type);
  const message = data.message;
  const nestedChannel = message && typeof message === "object" ? str((message as Record<string, unknown>).channel) : undefined;
  const channelId = str(data.channel) ?? str(data.channel_id) ?? str(data.channelId) ?? nestedChannel;
  if (type === "push.fr.received" || type === "push.fr.accepted") {
    const id = str(data.id);
    return isId(id) ? { href: `/friends?profile=${id}` } : { href: "/friends" };
  }
  if (isId(channelId)) {
    const messageId = typeof message === "string" && isId(message) ? message : undefined;
    return { href: messageId ? `/channel/${channelId}?message=${messageId}` : `/channel/${channelId}`, channelId };
  }
  return undefined;
}

/** The path of an in-app address, without its query or hash */
function pathOf(href: string): string {
  return href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/**
 * `+native-intent`: the in-app path for an address the system opens the app
 * with. Unknown addresses pass through unchanged (Expo Router shows them or
 * its own not-found page), so nothing that worked before breaks.
 */
export function systemPath(path: string): string {
  // the app's own start (index decides where a person lands)
  if (pathOf(path) === "/") return path;
  const link = parseDeepLink(path);
  if (!link) return path;
  // an in-app path that is already this screen keeps its own query (/friends?add=1);
  // a web path that differs here (/invite/{code}, /channel/{c}/{m}) is rewritten
  const href = linkHref(link);
  if (path.startsWith("/") && needsAccount(link) && pathOf(path) === pathOf(href)) return path;
  return href;
}
