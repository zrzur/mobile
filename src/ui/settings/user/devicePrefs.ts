import { useCallback, useEffect, useState } from "react";

import { secureStorage } from "@/lib/secureStorage";

import { readPrefs } from "./userPrefs";

/**
 * A small preference object kept on this device only (the web keeps these
 * in local stores). Loads once, then every change is written back at once.
 */
export function useDevicePrefs<T extends Record<string, unknown>>(key: string, defaults: T): [T, (patch: Partial<T>) => void, boolean] {
  const [state, setState] = useState<{ prefs: T; ready: boolean }>({ prefs: defaults, ready: false });
  useEffect(() => {
    let live = true;
    secureStorage
      .get(key)
      .catch(() => null)
      .then((raw) => {
        if (live) setState({ prefs: readPrefs(raw, defaults), ready: true });
      });
    return () => {
      live = false;
    };
    // defaults are module constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (patch: Partial<T>) => {
      setState((s) => {
        const prefs = { ...s.prefs, ...patch };
        void secureStorage.set(key, JSON.stringify(prefs)).catch(() => {});
        return { prefs, ready: true };
      });
    },
    [key],
  );
  return [state.prefs, update, state.ready];
}
