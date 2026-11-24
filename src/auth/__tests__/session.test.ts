import type { KeyValueStore } from "@/lib/secureStorage";

import {
  clearSession,
  loadSession,
  saveSession,
} from "../session";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const SESSION = { id: "S1", token: "tok", userId: "U1", apiUrl: "https://api.zrzur.com" };

describe("kept session", () => {
  it("saves, loads and clears the session", async () => {
    const store = memoryStore();
    expect(await loadSession(store)).toBeNull();
    await saveSession(store, SESSION);
    expect(await loadSession(store)).toEqual(SESSION);
    await clearSession(store);
    expect(await loadSession(store)).toBeNull();
  });

  it("treats a damaged entry as no session", async () => {
    const store = memoryStore();
    store.data.set("zrzur.session", "{not json");
    expect(await loadSession(store)).toBeNull();
    store.data.set("zrzur.session", JSON.stringify({ ...SESSION, token: "" }));
    expect(await loadSession(store)).toBeNull();
    store.data.set("zrzur.session", JSON.stringify({ id: "S1" }));
    expect(await loadSession(store)).toBeNull();
  });

});
