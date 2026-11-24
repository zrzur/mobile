import { useEffect, useSyncExternalStore } from "react";

import { secureStorage } from "@/lib/secureStorage";

/**
 * Settings kept on this device only (web: local stores, not synced):
 * streamer mode and the media-player consent. Read once from storage,
 * then shared live by every screen that uses them.
 */
type Prefs = {
  /** web `privacy:streamer_mode` */
  streamerMode: boolean;
  /** web: always load media players from other sites */
  alwaysLoadPlayers: boolean;
  /** providers the user allowed one by one (e.g. "YouTube") */
  allowedPlayers: string[];
};

const KEY = "zrzur.local_prefs";
const DEFAULTS: Prefs = { streamerMode: false, alwaysLoadPlayers: false, allowedPlayers: [] };

let prefs: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function load() {
  if (loaded) return;
  loaded = true;
  secureStorage
    .get(KEY)
    .then((saved) => {
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<Prefs>;
      prefs = {
        streamerMode: parsed.streamerMode === true,
        alwaysLoadPlayers: parsed.alwaysLoadPlayers === true,
        allowedPlayers: Array.isArray(parsed.allowedPlayers) ? parsed.allowedPlayers.filter((p) => typeof p === "string") : [],
      };
      emit();
    })
    .catch(() => {});
}

/** Change some local settings and save them on the device */
export function setLocalPrefs(change: Partial<Prefs>) {
  prefs = { ...prefs, ...change };
  emit();
  void secureStorage.set(KEY, JSON.stringify(prefs)).catch(() => {});
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The local settings, live */
export function useLocalPrefs(): Prefs {
  useEffect(load, []);
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

/** Whether streamer mode is on (hides email, tag, invite codes) */
export function useStreamerMode(): boolean {
  return useLocalPrefs().streamerMode;
}
