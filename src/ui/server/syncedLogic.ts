/**
 * Pure logic of the account settings the server menu and the rail share
 * with the web (web: state/stores NotificationOptions, ServerFolders,
 * Ordering). They are synced under the same keys and shapes, so a change
 * on the phone shows on the computer and back.
 */

export type NotificationState = "all" | "mention" | "none";
const STATES: NotificationState[] = ["all", "mention", "none"];

export type MuteState = { until?: number };

export type NotificationOptions = {
  server: Record<string, NotificationState | undefined>;
  channel: Record<string, NotificationState | undefined>;
  server_mutes: Record<string, MuteState | undefined>;
  channel_mutes: Record<string, MuteState | undefined>;
  suppress_everyone: Record<string, boolean | undefined>;
  suppress_roles: Record<string, boolean | undefined>;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function flags(input: unknown): Record<string, boolean | undefined> {
  const out: Record<string, boolean | undefined> = {};
  for (const [k, v] of Object.entries(record(input))) if (typeof v === "boolean") out[k] = v;
  return out;
}

/** A stored `notifications` value made valid; expired mutes dropped (web: clean) */
export function cleanNotifications(input: unknown, now: number): NotificationOptions {
  const raw = record(input);
  const server: NotificationOptions["server"] = {};
  const channel: NotificationOptions["channel"] = {};
  const server_mutes: NotificationOptions["server_mutes"] = {};
  const channel_mutes: NotificationOptions["channel_mutes"] = {};
  const levels = (from: unknown, to: Record<string, NotificationState | undefined>, mutes: Record<string, MuteState | undefined>) => {
    for (const [id, entry] of Object.entries(record(from))) {
      if (entry === "muted") mutes[id] = {};
      if (STATES.includes(entry as NotificationState)) to[id] = entry as NotificationState;
    }
  };
  levels(raw.server, server, server_mutes);
  levels(raw.channel, channel, channel_mutes);
  const mutes = (from: unknown, to: Record<string, MuteState | undefined>) => {
    for (const [id, entry] of Object.entries(record(from))) {
      const until = record(entry).until;
      if (entry && typeof entry === "object" && (until === undefined || (typeof until === "number" && until > now))) to[id] = { until: until as number | undefined };
    }
  };
  mutes(raw.server_mutes, server_mutes);
  mutes(raw.channel_mutes, channel_mutes);
  return { server, channel, server_mutes, channel_mutes, suppress_everyone: flags(raw.suppress_everyone), suppress_roles: flags(raw.suppress_roles) };
}

/** Whether a mute holds right now */
export const muteActive = (mute: MuteState | undefined, now: number) => !!mute && (mute.until === undefined || mute.until > now);

/** Mute for some minutes, or until turned back on (undefined) */
export function withServerMute(options: NotificationOptions, serverId: string, minutes: number | undefined, now: number): NotificationOptions {
  return { ...options, server_mutes: { ...options.server_mutes, [serverId]: { until: minutes ? now + minutes * 60_000 : undefined } } };
}

export function withoutServerMute(options: NotificationOptions, serverId: string): NotificationOptions {
  const server_mutes = { ...options.server_mutes };
  delete server_mutes[serverId];
  return { ...options, server_mutes };
}

/** Set the server's level; undefined goes back to the server default */
export function withServerLevel(options: NotificationOptions, serverId: string, level: NotificationState | undefined): NotificationOptions {
  const server = { ...options.server };
  if (level) server[serverId] = level;
  else delete server[serverId];
  return { ...options, server };
}

/** The JSON stored value without the empty `until` keys of forever mutes */
export const notificationsValue = (options: NotificationOptions) => JSON.stringify(options);

/** Mute choices in minutes (web: ServerContextMenu); undefined = until turned back on */
export const MUTE_CHOICES: (number | undefined)[] = [15, 60, 180, 480, 1440, undefined];

// ---- Folders ----

export type ServerFolder = { id: string; name: string; colour?: string; collapsed?: boolean; servers: string[] };

/** A stored `server-folders` value made valid: one folder per server (web: clean) */
export function cleanFolders(input: unknown): ServerFolder[] {
  const folders: ServerFolder[] = [];
  const seenFolders = new Set<string>();
  const seenServers = new Set<string>();
  const list = record(input).folders;
  for (const entry of Array.isArray(list) ? list : []) {
    const e = record(entry);
    if (typeof e.id !== "string" || !e.id || seenFolders.has(e.id)) continue;
    seenFolders.add(e.id);
    const servers: string[] = [];
    for (const id of Array.isArray(e.servers) ? e.servers : []) {
      if (typeof id === "string" && !seenServers.has(id)) {
        seenServers.add(id);
        servers.push(id);
      }
    }
    const folder: ServerFolder = { id: e.id, name: typeof e.name === "string" ? e.name : "", servers };
    if (typeof e.colour === "string") folder.colour = e.colour;
    if (e.collapsed === true) folder.collapsed = true;
    folders.push(folder);
  }
  return folders;
}

/** A stored `ordering` value: the sidebar order, or the plain server order */
export function cleanOrdering(input: unknown): string[] {
  const raw = record(input);
  const source = Array.isArray(raw.serverSidebar) ? raw.serverSidebar : raw.servers;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(source) ? source : []) {
    const ids = typeof entry === "string" ? [entry] : Array.isArray(record(entry).servers) ? (record(entry).servers as unknown[]) : [];
    for (const id of ids) {
      if (typeof id === "string" && id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export type RailEntry = { type: "server"; id: string } | { type: "folder"; id: string; folder: ServerFolder; servers: string[] };

/** The rail: servers and folders in the synced order, new servers at the end (web: orderedEntries) */
export function railEntries(known: string[], order: string[], folders: ServerFolder[]): RailEntry[] {
  const left = new Set(known);
  const byId = new Map<string, ServerFolder>();
  const folderOf = new Map<string, ServerFolder>();
  for (const folder of folders) {
    byId.set(folder.id, folder);
    for (const id of folder.servers) if (!folderOf.has(id)) folderOf.set(id, folder);
  }
  const out: RailEntry[] = [];
  const drawn = new Set<string>();
  const take = (id: string) => {
    const folder = byId.get(id) ?? folderOf.get(id);
    if (folder) {
      if (drawn.has(folder.id)) return;
      drawn.add(folder.id);
      const servers = folder.servers.filter((s) => left.delete(s));
      if (servers.length) out.push({ type: "folder", id: folder.id, folder, servers });
      return;
    }
    if (left.delete(id)) out.push({ type: "server", id });
  };
  order.forEach(take);
  [...left].forEach(take);
  return out;
}

/** A folder id that never collides with a server id */
export const newFolderId = (now: number, random: number) => `folder-${now.toString(36)}${Math.floor(random * 1e8).toString(36)}`;

export function createFolder(folders: ServerFolder[], id: string, name: string, serverIds: string[]): ServerFolder[] {
  const taken = new Set(serverIds);
  return [...folders.map((f) => ({ ...f, servers: f.servers.filter((s) => !taken.has(s)) })), { id, name, servers: [...serverIds] }];
}

export function addToFolder(folders: ServerFolder[], folderId: string, serverId: string): ServerFolder[] {
  return folders.map((f) => (f.id === folderId ? { ...f, servers: [...f.servers.filter((s) => s !== serverId), serverId] } : { ...f, servers: f.servers.filter((s) => s !== serverId) }));
}

/** Out of its folder; a folder left empty is removed */
export function removeFromFolder(folders: ServerFolder[], serverId: string): ServerFolder[] {
  return folders.map((f) => ({ ...f, servers: f.servers.filter((s) => s !== serverId) })).filter((f) => f.servers.length > 0);
}

export const editFolder = (folders: ServerFolder[], id: string, changes: { name?: string; colour?: string }): ServerFolder[] =>
  folders.map((f) => {
    if (f.id !== id) return f;
    const next: ServerFolder = { ...f, ...(changes.name !== undefined ? { name: changes.name } : {}) };
    if (changes.colour) next.colour = changes.colour;
    else delete next.colour;
    return next;
  });

export const deleteFolder = (folders: ServerFolder[], id: string) => folders.filter((f) => f.id !== id);

export const toggleFolder = (folders: ServerFolder[], id: string): ServerFolder[] => folders.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f));

export const folderOf = (folders: ServerFolder[], serverId: string) => folders.find((f) => f.servers.includes(serverId));

/** Folder colours offered (web: ColourPicker COLOUR_PALETTE, three rows of eleven) */
export const FOLDER_COLOURS = [
  ["#fca5a5", "#fdba74", "#fcd34d", "#86efac", "#6ee7b7", "#67e8f9", "#93c5fd", "#c4b5fd", "#f0abfc", "#f9a8d4", "#cbd5e1"],
  ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899", "#64748b"],
  ["#991b1b", "#9a3412", "#854d0e", "#166534", "#065f46", "#155e75", "#1e40af", "#5b21b6", "#86198f", "#9d174d", "#334155"],
] as const;
