/**
 * Pure rules for the gateway connection on a phone: retrying the first
 * config fetch, keeping the socket open for a short while in the
 * background, and what the connection line under the header says.
 */

/** Wait before the next `initConfig` try: 1 s, 2 s, 4 s … up to 30 s */
export function configRetryDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

/**
 * How long the gateway stays open after the app goes to the background.
 * Android backgrounds the app for the image picker, camera, document
 * picker and share sheet; closing at once would rebuild the whole session
 * (full Ready payload) after every attachment pick.
 */
export const BACKGROUND_GRACE_MS = 45_000;

/** Close the socket in the background only when no call is running (the call needs its events) */
export function mayCloseInBackground(callStatus: string): boolean {
  return callStatus === "idle";
}

/** What the connection line shows; `null` hides it */
export type BannerKind = "connecting" | "reconnecting" | "disconnected" | "offline";

/**
 * - `status`: the app's live status
 * - `everConnected`: the gateway was connected before in this session
 * - `configFailed`: the server config could not be fetched (usually no network)
 */
export function bannerKind(status: "connecting" | "connected" | "offline", everConnected: boolean, configFailed: boolean): BannerKind | null {
  if (status === "connected") return null;
  if (status === "offline") return configFailed ? "offline" : "disconnected";
  return everConnected ? "reconnecting" : "connecting";
}

/**
 * "Connecting…" at app start usually lasts a moment; showing the line at
 * once would push the screen down and back up (web: Titlebar phoneShow).
 * A lasting problem shows at once, connecting only after this delay.
 */
export const BANNER_DELAY_MS = 1500;

export function bannerDelay(kind: BannerKind): number {
  return kind === "connecting" || kind === "reconnecting" ? BANNER_DELAY_MS : 0;
}

/** `color-mix(in srgb, top pct%, base)` for #RRGGBB colours; answers `base` for anything else */
export function mixHex(top: string, base: string, pct: number): string {
  const parse = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null);
  const a = parse(top);
  const b = parse(base);
  if (!a || !b) return base;
  const p = Math.min(100, Math.max(0, pct)) / 100;
  return `#${a.map((v, i) => Math.round(v * p + b[i] * (1 - p)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
