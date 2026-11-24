import type { KeyValueStore } from "./secureStorage";

export type { KeyValueStore } from "./secureStorage";

/**
 * Web preview only (design checks in a browser). The phone builds use the
 * keychain; a browser has nothing better than localStorage.
 */
export const secureStorage: KeyValueStore = {
  get: async (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // private mode: the session lasts until the tab closes
    }
  },
  remove: async (key) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // nothing kept
    }
  },
};
