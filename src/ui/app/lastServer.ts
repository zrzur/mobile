import { secureStorage } from "@/lib/secureStorage";

/** The server opened last, so "Servers" goes back to it (web: getLastActiveServerPath) */
let current: string | undefined;
const KEY = "zrzur.lastServer";

secureStorage.get(KEY).then((value) => {
  if (value && !current) current = value;
});

export const lastServer = {
  get: () => current,
  set(id: string) {
    if (current === id) return;
    current = id;
    void secureStorage.set(KEY, id);
  },
};
