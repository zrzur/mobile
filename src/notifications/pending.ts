/**
 * A link that opened the app before anyone was signed in. The root layout
 * sends a signed-out person to the sign-in page, which drops the link; it is
 * kept here and opened once the account is inside the app. While someone is
 * inside, the router opens links itself and nothing is kept.
 */

/** Links older than this are not opened any more (the person moved on) */
export const PENDING_MAX_AGE = 15 * 60_000;

let pending: { href: string; at: number } | undefined;
let inside = false;

/** The signed-in part of the app is on screen (set by the notifications controller) */
export function setInsideApp(value: boolean) {
  inside = value;
}

export function rememberLink(href: string, now = Date.now()) {
  if (inside || href === "/" || href === "/home") return;
  pending = { href, at: now };
}

/** The kept link, once: reading it forgets it */
export function takeLink(now = Date.now()): string | undefined {
  const value = pending;
  pending = undefined;
  if (!value || now - value.at > PENDING_MAX_AGE) return undefined;
  return value.href;
}
