/**
 * Keeping the `notifications` account setting in step with the server
 * (web: stores/Sync.ts): the newer revision wins; a change made here while
 * offline is sent once the server answers. Pure, so it is unit tested.
 */
import type { ServerNotificationLevel } from "./levels";

/** The account setting's key on `/sync/settings/*` */
export const SYNC_KEY = "notifications";

/** What this device keeps between launches (also read by the background task) */
export type NotificationCache = {
  /** revision of `value` (ms) */
  ts: number;
  /** changed here and not yet saved on the server */
  dirty: boolean;
  /** the synced JSON string */
  value: string;
  /** channel id -> server id, so a closed app can tell a muted server's channels */
  servers: Record<string, string>;
  /** server id -> its default level */
  serverDefaults: Record<string, ServerNotificationLevel>;
};

export function emptyCache(): NotificationCache {
  return { ts: 0, dirty: false, value: "", servers: {}, serverDefaults: {} };
}

function stringMap<T extends string>(input: unknown, allowed?: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" && (!allowed || allowed.includes(v as T))) out[k] = v as T;
  }
  return out;
}

export function readCache(raw: string | null | undefined): NotificationCache {
  if (!raw) return emptyCache();
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationCache>;
    return {
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
      dirty: parsed.dirty === true,
      value: typeof parsed.value === "string" ? parsed.value : "",
      servers: stringMap(parsed.servers),
      serverDefaults: stringMap<ServerNotificationLevel>(parsed.serverDefaults, ["All", "Mentions"]),
    };
  } catch {
    return emptyCache();
  }
}

/** `POST /sync/settings/fetch` answers `{ key: [timestamp, value] }` */
export function remoteEntry(answer: unknown): { ts: number; value: string } | undefined {
  const entry = (answer as Record<string, unknown> | null | undefined)?.[SYNC_KEY];
  if (Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "string") {
    return { ts: entry[0], value: entry[1] };
  }
  return undefined;
}

/**
 * What to do after fetching: take the server's value, send ours, or keep
 * ours as it is (same revision).
 */
export function mergeDecision(local: Pick<NotificationCache, "ts" | "dirty">, remote: { ts: number } | undefined): "take" | "send" | "keep" {
  if (!remote) return local.dirty ? "send" : "keep";
  if (local.dirty && local.ts > remote.ts) return "send";
  if (remote.ts > local.ts || (!local.dirty && remote.ts !== local.ts)) return "take";
  return "keep";
}
