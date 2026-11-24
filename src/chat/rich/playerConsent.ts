import { useSyncExternalStore } from "react";

import { secureStorage } from "@/lib/secureStorage";

/**
 * "Always load media players from other sites" and the players the reader
 * loaded once (web `embedSettings.ts`). Off by default: a YouTube or Twitch
 * player contacts that company, so each site waits for one press. Kept on
 * this phone only.
 */
const KEY = "zrzur.always-load-media-players";
const ALLOWED_KEY = "zrzur.allowed-media-players";

type State = { always: boolean; allowed: readonly string[] };

let state: State = { always: false, allowed: [] };
const listeners = new Set<() => void>();
let loaded = false;

function emit(next: State) {
  state = next;
  for (const listener of [...listeners]) listener();
}

function load() {
  if (loaded) return;
  loaded = true;
  Promise.all([secureStorage.get(KEY), secureStorage.get(ALLOWED_KEY)])
    .then(([always, allowed]) => {
      let list: string[] = [];
      try {
        const parsed: unknown = JSON.parse(allowed ?? "[]");
        if (Array.isArray(parsed)) list = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        // a broken value counts as none allowed
      }
      emit({ always: always === "1" || state.always, allowed: [...new Set([...list, ...state.allowed])] });
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

/** The reader's player choices, live */
export function usePlayerConsent(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function allowMediaPlayer(key?: string) {
  if (!key || state.allowed.includes(key)) return;
  const allowed = [...state.allowed, key];
  emit({ ...state, allowed });
  void secureStorage.set(ALLOWED_KEY, JSON.stringify(allowed)).catch(() => {});
}

export function forgetMediaPlayers() {
  emit({ ...state, allowed: [] });
  void secureStorage.set(ALLOWED_KEY, "[]").catch(() => {});
}

/** For the settings screen ("Always load media players from other sites") */
export function setAlwaysLoadMediaPlayers(value: boolean) {
  emit({ ...state, always: value });
  void secureStorage.set(KEY, value ? "1" : "0").catch(() => {});
}

export const isPlayerAllowed = (consent: State, key?: string) => consent.always || (!!key && consent.allowed.includes(key));
