/**
 * Synced account settings shared with the web (`server-folders`,
 * `ordering`): fetched once per session, kept in one
 * module cache, written back whole like the web's Sync store (one revision
 * stamp per write). Every screen reading a key re-renders only when it
 * changes.
 *
 * `notifications` is NOT kept here: the notification store
 * (src/notifications/store.ts) owns that key. Each store writes only its
 * own keys (`/sync/settings/set` replaces just the keys it is sent), so the
 * two never overwrite each other.
 */
import type { Client } from "@zrzur/sdk/solid";
import { useEffect, useSyncExternalStore } from "react";

import { useClient } from "@/client/ClientProvider";

export type SyncedKey = "server-folders" | "ordering";

type Entry = { value: unknown; loaded: boolean; loading?: Promise<void> };

const cache = new Map<SyncedKey, Entry>();
const listeners = new Set<() => void>();
let owner: Client | undefined;

function emit() {
  for (const listener of [...listeners]) listener();
}

function entry(key: SyncedKey): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { value: undefined, loaded: false };
    cache.set(key, e);
  }
  return e;
}

type Api = { post: (path: string, body: unknown, options?: unknown) => Promise<unknown> };

/** Load the keys not loaded yet (one request) */
function load(client: Client, keys: SyncedKey[]) {
  if (owner !== client) {
    // another account signed in: forget the old values
    cache.clear();
    owner = client;
  }
  const wanted = keys.filter((k) => !entry(k).loaded && !entry(k).loading);
  if (!wanted.length) return;
  const request = (client.api as unknown as Api)
    .post("/sync/settings/fetch", { keys: wanted })
    .then((answer) => {
      for (const key of wanted) {
        const raw = (answer as Record<string, unknown> | null)?.[key];
        let value: unknown;
        if (Array.isArray(raw) && typeof raw[1] === "string") {
          try {
            value = JSON.parse(raw[1]);
          } catch {
            value = undefined;
          }
        }
        const e = entry(key);
        e.value = value;
        e.loaded = true;
        e.loading = undefined;
      }
      emit();
    })
    .catch(() => {
      for (const key of wanted) entry(key).loading = undefined;
    });
  for (const key of wanted) entry(key).loading = request;
}

/** Save one key (optimistic; reverted when the server refuses) */
export async function saveSynced(client: Client, key: SyncedKey, value: unknown): Promise<void> {
  const e = entry(key);
  const before = e.value;
  e.value = value;
  e.loaded = true;
  emit();
  try {
    await (client.api as unknown as Api).post("/sync/settings/set", { [key]: JSON.stringify(value) }, { query: { timestamp: Date.now() } });
  } catch (err) {
    e.value = before;
    emit();
    throw err;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The raw stored value of a key (undefined until loaded or when never saved) */
export function useSynced(key: SyncedKey): { value: unknown; loaded: boolean } {
  const client = useClient();
  useEffect(() => {
    load(client, [key]);
  }, [client, key]);
  const value = useSyncExternalStore(
    subscribe,
    () => entry(key).value,
    () => entry(key).value,
  );
  const loaded = useSyncExternalStore(
    subscribe,
    () => entry(key).loaded,
    () => entry(key).loaded,
  );
  return { value, loaded };
}

/** The current value outside React (for writes built on it) */
export const syncedNow = (key: SyncedKey) => entry(key).value;
