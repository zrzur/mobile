/**
 * The places a person visited on this phone, newest first (web:
 * keybinds/recentPlaces.ts): "Go to" lists them first. Kept per account in
 * a small file in the app's own folder; read once, written after a pause.
 */
import { jsonFile } from "@/chat/persist";

const MAX = 12;
const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The place an address stands for: a channel (chat, thread, forum, voice) or a server */
export function placeFromPath(pathname: string): string | undefined {
  const match = /^\/(channel|thread|forum|voice|server)\/([0-9A-HJKMNP-TV-Z]{26})\/?$/.exec(pathname);
  return match?.[2];
}

type Store = Record<string, string[]>;

/** Only well-formed ids survive a read */
export function cleanPlaces(raw: unknown): Store {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Store = {};
  for (const [user, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID.test(user) || !Array.isArray(list)) continue;
    out[user] = list.filter((id): id is string => typeof id === "string" && ID.test(id)).slice(0, MAX);
  }
  return out;
}

/** The list after a visit: the place in front, once, at most MAX */
export function withVisit(list: string[], id: string): string[] {
  return [id, ...list.filter((other) => other !== id)].slice(0, MAX);
}

const file = jsonFile<Store>("recent-places.json", cleanPlaces);
let cache: Store | undefined;
let loading: Promise<Store> | undefined;

function load(): Promise<Store> {
  if (cache) return Promise.resolve(cache);
  loading ??= file.read().then((value) => (cache = value));
  return loading;
}

/** Ids of places this account visited on this phone, most recent first */
export async function recentPlaces(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];
  return (await load())[userId] ?? [];
}

/** Remember a visit (the app calls this on every page change) */
export async function notePlace(pathname: string, userId: string | undefined) {
  const id = placeFromPath(pathname);
  if (!id || !userId) return;
  const store = await load();
  const before = store[userId] ?? [];
  if (before[0] === id) return;
  cache = { ...store, [userId]: withVisit(before, id) };
  file.write(cache);
}

/** Signing out: every account's recent places go */
export function forgetRecentPlaces() {
  cache = {};
  file.write(cache, 0);
}
