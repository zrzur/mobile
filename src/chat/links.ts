/**
 * Links in messages (web: markdown/plugins/anchors.tsx, modals/LinkWarning,
 * stores/LinkSafety): Zrzur's own links open inside the app, every other
 * link asks first unless the reader trusted its site.
 */

/** Hosts that are Zrzur itself: their links stay in the app */
const OWN_HOSTS = new Set(["zrzur.com", "app.zrzur.com", "beta.zrzur.com", "www.zrzur.com"]);

const ID = "[0-9A-Z]{26}";

export type OwnLink =
  | { kind: "channel"; channelId: string; messageId?: string; serverId?: string }
  | { kind: "server"; serverId: string }
  | { kind: "invite"; code: string }
  | { kind: "other" };

export function parseUrl(href: string): URL | undefined {
  try {
    return new URL(href);
  } catch {
    return undefined;
  }
}

/** Is this one of Zrzur's own addresses? */
export function isOwnHost(host: string) {
  return OWN_HOSTS.has(host.toLowerCase());
}

/** What an own link points at */
export function parseOwnPath(pathname: string): OwnLink {
  const path = pathname.replace(/\/+$/, "");
  let m = new RegExp(`^/server/(${ID})/channel/(${ID})(?:/(${ID}))?$`).exec(path);
  if (m) return { kind: "channel", serverId: m[1], channelId: m[2], messageId: m[3] };
  m = new RegExp(`^/channel/(${ID})(?:/(${ID}))?$`).exec(path);
  if (m) return { kind: "channel", channelId: m[1], messageId: m[2] };
  m = new RegExp(`^/server/(${ID})$`).exec(path);
  if (m) return { kind: "server", serverId: m[1] };
  m = /^\/(?:invite|i)\/([A-Za-z0-9-]{2,64})$/.exec(path);
  if (m) return { kind: "invite", code: m[1] };
  return { kind: "other" };
}

/** Only web addresses may be opened */
export function isOpenable(url: URL) {
  return url.protocol === "https:" || url.protocol === "http:";
}

/**
 * How closely a link must be read (web LinkWarning "scrutiny"):
 * 0 the text is the address, 1 the text is something else, 2 the text is a
 * different address (a disguised link).
 */
export function scrutiny(url: URL, display: string | undefined): 0 | 1 | 2 {
  if (!display || display === url.toString() || display === url.href.replace(/\/$/, "")) return 0;
  const shown = parseUrl(display);
  if (!shown) return 1;
  return shown.toString() === url.toString() ? 1 : 2;
}

/** Plain http: no encryption */
export const insecure = (url: URL) => url.protocol === "http:";

/** A look-alike (punycode) domain */
export const lookalike = (url: URL) => url.hostname.split(".").some((part) => part.startsWith("xn--"));

/** Whether "Continue" needs the "I understand" tick first */
export function needsConsent(url: URL, display: string | undefined) {
  return scrutiny(url, display) === 2 || insecure(url) || lookalike(url);
}

/** Whether "Don't ask me again" may be offered (never for risky sites) */
export function canTrust(url: URL, display: string | undefined) {
  return scrutiny(url, display) === 0 && !insecure(url) && !lookalike(url) && url.origin !== "null";
}

/** Keep only well-formed origins */
export function cleanOrigins(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((o): o is string => typeof o === "string" && /^https?:\/\/[^/]+$/.test(o)) : [];
}
