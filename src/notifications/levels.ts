/**
 * Notification levels and mutes, the same rules as the web app
 * (stores/NotificationOptions.ts, stores/notificationLevels.ts and
 * NotificationsWorker.tsx). Pure: no React, no SDK objects, no storage, so
 * the store, the menus, the background task and the tests share one rule.
 *
 * The value is the synced account setting `notifications`, so a choice made
 * on the phone shows on the web and the other way round.
 */

/** What a member is notified about in a server or channel */
export type NotificationState = "all" | "mention" | "none";

/** A server's default level, as the API sends it */
export type ServerNotificationLevel = "All" | "Mentions";

/** A mute: no `until` means "until I turn it back on" */
export type MuteState = { until?: number };

/** What a suppress option hides from notifications */
export type SuppressKind = "everyone" | "roles";

/** The synced `notifications` setting (web: TypeNotificationOptions) */
export type NotificationOptions = {
  server: Record<string, NotificationState | undefined>;
  channel: Record<string, NotificationState | undefined>;
  server_mutes: Record<string, MuteState | undefined>;
  channel_mutes: Record<string, MuteState | undefined>;
  suppress_everyone: Record<string, boolean | undefined>;
  suppress_roles: Record<string, boolean | undefined>;
};

export type ChannelType = "SavedMessages" | "DirectMessage" | "Group" | "TextChannel";

const STATES: NotificationState[] = ["all", "mention", "none"];

/** Message flag bits as the server sends them (bit positions 2 and 3) */
export const MENTIONS_EVERYONE = 1 << 2;
export const MENTIONS_ONLINE = 1 << 3;

/** Mute lengths in minutes offered by the menus; undefined = until turned back on */
export const MUTE_MINUTES = [15, 60, 180, 480, 1440, undefined] as const;
export type MuteMinutes = (typeof MUTE_MINUTES)[number];

export function defaultOptions(): NotificationOptions {
  return { server: {}, channel: {}, server_mutes: {}, channel_mutes: {}, suppress_everyone: {}, suppress_roles: {} };
}

function cleanStates(
  input: unknown,
  mutes: Record<string, MuteState | undefined>,
): Record<string, NotificationState | undefined> {
  const out: Record<string, NotificationState | undefined> = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, entry] of Object.entries(input as Record<string, unknown>)) {
    // legacy "muted" level moves to the mute map
    if (entry === "muted") mutes[id] = {};
    if (STATES.includes(entry as NotificationState)) out[id] = entry as NotificationState;
  }
  return out;
}

function cleanMutes(input: unknown, now: number, out: Record<string, MuteState | undefined>) {
  if (!input || typeof input !== "object") return;
  for (const [id, entry] of Object.entries(input as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const until = (entry as MuteState).until;
    if (until === undefined || (typeof until === "number" && until > now)) out[id] = until === undefined ? {} : { until };
  }
}

function cleanFlags(input: unknown): Record<string, boolean | undefined> {
  const out: Record<string, boolean | undefined> = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, entry] of Object.entries(input as Record<string, unknown>)) {
    if (typeof entry === "boolean") out[id] = entry;
  }
  return out;
}

/** Keep only valid entries; drops mutes that have run out (web: clean) */
export function cleanOptions(input: unknown, now: number): NotificationOptions {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const server_mutes: Record<string, MuteState | undefined> = {};
  const channel_mutes: Record<string, MuteState | undefined> = {};
  const server = cleanStates(raw.server, server_mutes);
  const channel = cleanStates(raw.channel, channel_mutes);
  cleanMutes(raw.server_mutes, now, server_mutes);
  cleanMutes(raw.channel_mutes, now, channel_mutes);
  return {
    server,
    channel,
    server_mutes,
    channel_mutes,
    suppress_everyone: cleanFlags(raw.suppress_everyone),
    suppress_roles: cleanFlags(raw.suppress_roles),
  };
}

/** Read the synced string; a broken value means the defaults */
export function parseOptions(raw: string | null | undefined, now: number): NotificationOptions {
  if (!raw) return defaultOptions();
  try {
    return cleanOptions(JSON.parse(raw), now);
  } catch {
    return defaultOptions();
  }
}

type MapKey = keyof NotificationOptions;

/** A copy with one entry set (undefined removes it), as the web's `set` */
export function withEntry<K extends MapKey>(
  options: NotificationOptions,
  key: K,
  id: string,
  value: NotificationOptions[K][string],
): NotificationOptions {
  const map = { ...options[key] } as Record<string, unknown>;
  if (value === undefined) delete map[id];
  else map[id] = value;
  return { ...options, [key]: map };
}

/** The level for a server: own choice, else the server's default, else mentions only */
export function effectiveServerState(
  own: NotificationState | undefined,
  serverDefault: ServerNotificationLevel | undefined,
): NotificationState {
  if (own) return own;
  return serverDefault === "All" ? "all" : "mention";
}

/** Whether a suppress option is on: the channel's own choice, else the server's, else off */
export function effectiveSuppress(channel: boolean | undefined, server: boolean | undefined): boolean {
  return channel ?? server ?? false;
}

/** The level for a channel (web: computeForChannel) */
export function channelState(
  options: NotificationOptions,
  channel: { id: string; type: ChannelType; serverId?: string; serverDefault?: ServerNotificationLevel },
): NotificationState {
  const own = options.channel[channel.id];
  if (own) return own;
  if (channel.serverId) return effectiveServerState(options.server[channel.serverId], channel.serverDefault);
  return "all";
}

/** Whether a mute is in force now */
export function muteActive(mute: MuteState | undefined, now: number): boolean {
  return !!mute && (mute.until === undefined || mute.until > now);
}

/** A channel is muted on its own or through its server (web: isMuted) */
export function channelMuted(options: NotificationOptions, channelId: string, serverId: string | undefined, now: number): boolean {
  if (serverId && muteActive(options.server_mutes[serverId], now)) return true;
  return muteActive(options.channel_mutes[channelId], now);
}

/** The mute a menu choice stands for */
export function muteFor(minutes: MuteMinutes, now: number): MuteState {
  return minutes === undefined ? {} : { until: now + minutes * 60_000 };
}

/** Whether a message mentions the reader for notifications, after the suppress options */
export function mentionsForNotification(input: {
  selfId: string | undefined;
  mentionIds: string[] | undefined;
  flags: number;
  mentionsMyRole: boolean;
  suppressEveryone: boolean;
  suppressRoles: boolean;
}): boolean {
  if (input.selfId && input.mentionIds?.includes(input.selfId)) return true;
  if (!input.suppressEveryone && (input.flags & (MENTIONS_EVERYONE | MENTIONS_ONLINE)) !== 0) return true;
  return !input.suppressRoles && input.mentionsMyRole;
}

/**
 * Whether a push for a channel may show while the app is closed. The server
 * only pushes direct messages, groups and mentions, so a push in a server
 * channel is a mention; what is left to check here is mutes and "None".
 */
export function pushAllowed(input: {
  options: NotificationOptions;
  channelId: string;
  serverId?: string;
  serverDefault?: ServerNotificationLevel;
  now: number;
}): boolean {
  if (channelMuted(input.options, input.channelId, input.serverId, input.now)) return false;
  const state = channelState(input.options, {
    id: input.channelId,
    type: input.serverId ? "TextChannel" : "DirectMessage",
    serverId: input.serverId,
    serverDefault: input.serverDefault,
  });
  return state !== "none";
}

/**
 * Whether a message that arrives while the app is open raises a
 * notification (web: NotificationsWorker.onMessage, step by step).
 */
export function shouldNotify(input: {
  selfId: string | undefined;
  authorId: string | undefined;
  authorBlocked: boolean;
  channelId: string;
  channelType: ChannelType;
  serverId?: string;
  serverDefault?: ServerNotificationLevel;
  /** channel open on screen while the app is in front */
  viewingChannelId: string | undefined;
  appActive: boolean;
  mentioned: boolean;
  presence: string | undefined;
  options: NotificationOptions;
  now: number;
}): boolean {
  // own messages, from this or another device
  if (input.selfId && input.authorId === input.selfId) return false;
  // reading this channel right now
  if (input.appActive && input.viewingChannelId === input.channelId) return false;
  if (input.authorBlocked) return false;
  if (input.channelType === "SavedMessages") return false;
  if (channelMuted(input.options, input.channelId, input.serverId, input.now)) return false;
  const state = channelState(input.options, {
    id: input.channelId,
    type: input.channelType,
    serverId: input.serverId,
    serverDefault: input.serverDefault,
  });
  if (state === "none") return false;
  if (state === "mention" && !input.mentioned) return false;
  if (input.presence === "Busy") return false;
  if (input.presence === "Focus" && !input.mentioned) return false;
  return true;
}
