import type { KeyValueStore } from "@/lib/secureStorage";

/** A signed-in session as the app keeps it */
export type Session = {
  /** Session id (to sign out this device only) */
  id: string;
  /** Session token, sent as `X-Session-Token` */
  token: string;
  userId: string;
  /** The API this session belongs to */
  apiUrl: string;
};

const SESSION_KEY = "zrzur.session";

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.token === "string" &&
    v.token.length > 0 &&
    typeof v.userId === "string" &&
    typeof v.apiUrl === "string"
  );
}

/** Read the kept session; a damaged entry counts as none */
export async function loadSession(
  store: KeyValueStore,
): Promise<Session | null> {
  const raw = await store.get(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(store: KeyValueStore, session: Session) {
  return store.set(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(store: KeyValueStore) {
  return store.remove(SESSION_KEY);
}

