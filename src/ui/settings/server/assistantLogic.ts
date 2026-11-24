/**
 * Zrzur Assistant settings (web: settings/server/assistant/*), the pure
 * part: the service address, the OAuth2 sign-in pieces and which tabs a
 * module shows.
 */

export type AssistantService = { url: string; botId: string };

const BOT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The service and bot id this build uses (web: resolveAssistant). Both
 * unset, or either one malformed, hides the page. Release builds only accept
 * an https address on zrzur.com.
 */
export function resolveAssistant(url: string | undefined, botId: string | undefined, dev: boolean): AssistantService | undefined {
  const service = url?.trim().replace(/\/+$/, "");
  const id = botId?.trim();
  if (!service || !id || !BOT_ID.test(id)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(service);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && !(dev && parsed.protocol === "http:")) return undefined;
  if (!dev && parsed.hostname !== "zrzur.com" && !parsed.hostname.endsWith(".zrzur.com")) return undefined;
  return { url: service, botId: id };
}

/** Bytes as base64url without padding (RFC 7636) */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Standard base64 (what expo-crypto hands out) as base64url */
export function base64ToUrl(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The code in an authorize redirect, only when its state is ours */
export function codeFrom(redirect: string, state: string): string | null {
  let query: URLSearchParams;
  try {
    query = new URL(redirect).searchParams;
  } catch {
    return null;
  }
  return query.get("state") === state ? query.get("code") : null;
}

export type ModuleTab = "settings" | "messages" | "permissions" | "log" | "data";

/** Module pages show only the tabs that have something in them */
export function tabsOf(meta: { messages: unknown[] }): ModuleTab[] {
  return ["settings", ...(meta.messages.length ? (["messages"] as const) : []), "permissions", "log", "data"];
}

/** Lines of a "one per line" field */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** When a module that stays off loses its data (30 days after it was turned off) */
export function purgeDate(disabledAt: number | null | undefined): Date | undefined {
  return disabledAt ? new Date(disabledAt + 30 * 86_400_000) : undefined;
}
