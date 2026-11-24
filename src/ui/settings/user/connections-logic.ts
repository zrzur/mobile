/**
 * Linked accounts on other services (web connections/connectionsApi.ts and
 * serviceConnectionsApi.ts): types, the sign-in return and small rules.
 */

export type ServiceId = "steam" | "twitch" | "github" | "battlenet";
export const SERVICES: ServiceId[] = ["steam", "twitch", "github", "battlenet"];
export const SERVICE_NAMES: Record<ServiceId, string> = { steam: "Steam", twitch: "Twitch", github: "GitHub", battlenet: "Battle.net" };

/** The consent text version the server expects back (`consent: 3`) */
export const LINKED_CONSENT_VERSION = 3;
export const MAX_SHOWN_REPOS = 6;
export const PRIVACY_URL = "https://zrzur.com/legal/privacy#linked-accounts";

/**
 * Where the service sends people after they sign in there. The server only
 * accepts origins on its `return_origins` list (Revolt.toml
 * `[api.connections.*]`), and sends them back to
 * `<origin>/connections/<service>/return?...`. The app asks with the web
 * app's origin and watches for that address in the sign-in browser.
 */
export const RETURN_ORIGIN = "https://app.zrzur.com";
export const returnUrl = (service: ServiceId) => `${RETURN_ORIGIN}/connections/${service}/return`;

export type LinkedGame = {
  appid: number;
  name: string;
  hours: number;
  achievements_unlocked?: number;
  achievements_total?: number;
  icon_url?: string;
  store_url: string;
};

export type LinkedRepo = { id: number; name: string; description?: string; language?: string; stars: number; url: string };

/** One linked account, Steam or a service (fields each service uses) */
export type LinkedAccount = {
  service: ServiceId;
  display_name: string;
  profile_url: string;
  shown: boolean;
  private?: boolean;
  game_count?: number;
  total_hours?: number;
  games?: LinkedGame[];
  hidden_titles?: number[];
  live?: boolean;
  live_title?: string;
  repos?: LinkedRepo[];
  shown_repos?: number[];
  expires_at?: number;
  linked_at: number;
  refreshed_at: number;
  refresh_after: number;
  consent_current?: boolean;
};

export type Connection = { available: boolean; account?: LinkedAccount };
export type LinkedAccounts = Partial<Record<ServiceId, Connection>>;

/** `consent_current === false`: the person must agree to the new text */
export const needsConsent = (account: { consent_current?: boolean }) => account.consent_current === false;

/** The query of the address the sign-in browser came back to */
function queryOf(url: string): URLSearchParams {
  const at = url.indexOf("?");
  const hash = url.indexOf("#");
  const end = hash > at && at >= 0 ? hash : url.length;
  return new URLSearchParams(at >= 0 ? url.slice(at + 1, end) : "");
}

/** Steam returns `state` and the `openid.*` answer */
export function steamReturnFields(url: string): { state: string; params: Record<string, string> } {
  const query = queryOf(url);
  const params: Record<string, string> = {};
  for (const [key, value] of query) if (key.startsWith("openid.")) params[key] = value;
  return { state: query.get("state") ?? "", params };
}

/** Twitch, GitHub and Battle.net return `state` and `code`, or `error` */
export function serviceReturnFields(url: string): { state: string; code: string; denied: boolean } {
  const query = queryOf(url);
  return { state: query.get("state") ?? "", code: query.get("code") ?? "", denied: query.has("error") };
}

/** Whole days left until `until` (Battle.net: confirm within n days) */
export function daysLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 86_400_000));
}

/** Tick or untick a repository; at most six are shown */
export function toggleRepo(shown: number[], id: number, on: boolean): number[] {
  if (!on) return shown.filter((other) => other !== id);
  if (shown.includes(id) || shown.length >= MAX_SHOWN_REPOS) return shown;
  return [...shown, id];
}

/** Tick or untick a Steam game (ticked = shown, so the hidden list loses it) */
export function toggleGame(hidden: number[], appid: number, shown: boolean): number[] {
  return shown ? hidden.filter((id) => id !== appid) : hidden.includes(appid) ? hidden : [...hidden, appid];
}
