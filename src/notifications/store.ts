/**
 * The member's notification levels and mutes for one signed-in client
 * (web: stores/NotificationOptions.ts). Kept in a Solid signal, so the SDK's
 * `channel.muted` / `channel.unread` and React (through `useSolid`) follow
 * every change; saved to the account (`/sync/settings`, key `notifications`)
 * and to a file on this device that the background task reads while the app
 * is closed.
 */
import type { Channel, Client } from "@zrzur/sdk/solid";
import { File, Paths } from "expo-file-system";
import { type Accessor, createSignal } from "solid-js";

import {
  type MuteMinutes,
  type MuteState,
  type NotificationOptions,
  type NotificationState,
  type ServerNotificationLevel,
  type SuppressKind,
  channelMuted,
  defaultOptions,
  muteActive,
  muteFor,
  parseOptions,
  withEntry,
} from "./levels";
import { type NotificationCache, SYNC_KEY, emptyCache, mergeDecision, readCache, remoteEntry } from "./sync";

const CACHE_FILE = "notification-options.json";
const SAVE_DELAY = 800;

function cacheFile() {
  return new File(Paths.document, CACHE_FILE);
}

/** The cache as saved on this device (empty when there is none) */
export async function loadCache(): Promise<NotificationCache> {
  try {
    const file = cacheFile();
    if (!file.exists) return emptyCache();
    return readCache(await file.text());
  } catch {
    return emptyCache();
  }
}

async function writeCache(cache: NotificationCache) {
  try {
    await cacheFile().write(JSON.stringify(cache));
  } catch {
    // a full disk only loses the closed-app filter; the account keeps the value
  }
}

/** Forget this device's copy (sign out) */
export function clearCache() {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {
    // nothing kept
  }
}

type SyncApi = {
  post(path: string, body: unknown, options?: unknown): Promise<unknown>;
};

type SettingsEvents = {
  on(event: "userSettingsUpdate", listener: (id: string, update: Record<string, [number, string]>) => void): unknown;
  off(event: "userSettingsUpdate", listener: (id: string, update: Record<string, [number, string]>) => void): unknown;
};

type MuteOptions = {
  channelIsMuted: (channel: Channel) => boolean;
  channelExclusiveMuted: (channel: Channel) => boolean;
};

export class NotificationStore {
  readonly options: Accessor<NotificationOptions>;
  /** the time, a minute at a time, so timed mutes run out on screen */
  readonly now: Accessor<number>;
  #setOptions: (value: NotificationOptions) => void;
  #setNow: (value: number) => void;
  #client: Client;
  #cache: NotificationCache = emptyCache();
  #tick: ReturnType<typeof setInterval> | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #started = false;

  constructor(client: Client) {
    this.#client = client;
    const [options, setOptions] = createSignal<NotificationOptions>(defaultOptions(), { equals: false });
    const [now, setNow] = createSignal(Date.now());
    this.options = options;
    this.now = now;
    this.#setOptions = setOptions;
    this.#setNow = setNow;
  }

  /** Load this device's copy, then the account's; mute rules go to the SDK */
  start() {
    if (this.#started) return;
    this.#started = true;
    const mutes = this.#client.options as unknown as MuteOptions;
    mutes.channelIsMuted = (channel) => channelMuted(this.options(), channel.id, channel.serverId || undefined, this.now());
    mutes.channelExclusiveMuted = (channel) => muteActive(this.options().channel_mutes[channel.id], this.now());
    this.#tick = setInterval(() => this.#setNow(Date.now()), 60_000);
    (this.#client as unknown as SettingsEvents).on("userSettingsUpdate", this.#onRemote);
    void loadCache().then((cache) => {
      if (!this.#started) return;
      // a value that came from the server meanwhile is newer than the file
      if (cache.ts > this.#cache.ts) {
        this.#cache = { ...cache };
        this.#setOptions(parseOptions(cache.value, Date.now()));
      }
      void this.fetch();
    });
  }

  stop() {
    this.#started = false;
    if (this.#tick) clearInterval(this.#tick);
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    (this.#client as unknown as SettingsEvents).off("userSettingsUpdate", this.#onRemote);
  }

  /** Fetch the account's value and settle with ours */
  async fetch() {
    let answer: unknown;
    try {
      answer = await (this.#client.api as unknown as SyncApi).post("/sync/settings/fetch", { keys: [SYNC_KEY] });
    } catch {
      return; // offline: this device's copy stays, the next start fetches again
    }
    const remote = remoteEntry(answer);
    const decision = mergeDecision(this.#cache, remote);
    if (decision === "take" && remote) this.#take(remote.ts, remote.value);
    else if (decision === "send") void this.#save();
  }

  #onRemote = (_id: string, update: Record<string, [number, string]>) => {
    const entry = update?.[SYNC_KEY];
    if (!Array.isArray(entry) || typeof entry[0] !== "number" || typeof entry[1] !== "string") return;
    if (entry[0] <= this.#cache.ts) return;
    this.#take(entry[0], entry[1]);
  };

  #take(ts: number, value: string) {
    this.#cache = { ...this.#cache, ts, value, dirty: false };
    this.#setOptions(parseOptions(value, Date.now()));
    this.#writeMap();
  }

  /** Channel -> server and server defaults for the closed-app filter */
  #writeMap() {
    const servers: Record<string, string> = {};
    const serverDefaults: Record<string, ServerNotificationLevel> = {};
    try {
      for (const channel of this.#client.channels.toList()) {
        if (channel.serverId) servers[channel.id] = channel.serverId;
      }
      for (const server of this.#client.servers.toList()) {
        if (server.defaultNotifications) serverDefaults[server.id] = server.defaultNotifications;
      }
    } catch {
      // the lists are not there yet: keep the last ones
    }
    if (Object.keys(servers).length) this.#cache = { ...this.#cache, servers, serverDefaults };
    void writeCache(this.#cache);
  }

  /** Refresh the closed-app map (called once the client is ready) */
  rememberChannels() {
    this.#writeMap();
  }

  #change(next: NotificationOptions) {
    const ts = Date.now();
    this.#cache = { ...this.#cache, ts, dirty: true, value: JSON.stringify(next) };
    this.#setOptions(next);
    void writeCache(this.#cache);
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => void this.#save(), SAVE_DELAY);
  }

  async #save() {
    const { ts, value } = this.#cache;
    try {
      await (this.#client.api as unknown as SyncApi).post("/sync/settings/set", { [SYNC_KEY]: value }, { query: { timestamp: ts } });
      // a newer change may have come in while this one was sent
      if (this.#cache.ts === ts) {
        this.#cache = { ...this.#cache, dirty: false };
        this.#writeMap();
      }
    } catch {
      // stays dirty: sent with the next change or the next start
    }
  }

  setServer(serverId: string, state: NotificationState | undefined) {
    this.#change(withEntry(this.options(), "server", serverId, state));
  }

  setChannel(channelId: string, state: NotificationState | undefined) {
    this.#change(withEntry(this.options(), "channel", channelId, state));
  }

  setServerMute(serverId: string, minutes: MuteMinutes | null) {
    const mute: MuteState | undefined = minutes === null ? undefined : muteFor(minutes, Date.now());
    this.#change(withEntry(this.options(), "server_mutes", serverId, mute));
  }

  setChannelMute(channelId: string, minutes: MuteMinutes | null) {
    const mute: MuteState | undefined = minutes === null ? undefined : muteFor(minutes, Date.now());
    this.#change(withEntry(this.options(), "channel_mutes", channelId, mute));
  }

  setSuppress(kind: SuppressKind, id: string, value: boolean | undefined) {
    this.#change(withEntry(this.options(), `suppress_${kind}`, id, value));
  }
}

const stores = new WeakMap<Client, NotificationStore>();

/** The store of a client, started on first use */
export function notificationStore(client: Client): NotificationStore {
  let store = stores.get(client);
  if (!store) {
    store = new NotificationStore(client);
    stores.set(client, store);
  }
  store.start();
  return store;
}

/** Stop a client's store (its client is gone) */
export function dropNotificationStore(client: Client) {
  stores.get(client)?.stop();
  stores.delete(client);
}
