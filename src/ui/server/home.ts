import type { Client, Server } from "@zrzur/sdk/solid";

/** The Lobby row shows only once a manager turns the lobby on (web: lobbyRowShown) */
export const lobbyShown = (server: Pick<Server, "lobby"> | undefined) => server?.lobby?.enabled === true;

/** Whether this Zrzur node has scheduled events switched on (web: eventsEnabled) */
export const eventsEnabled = (client: Client | undefined) => (client?.configuration?.features as { server_events?: boolean } | undefined)?.server_events === true;

/** Events show only when the node has them and a manager turned them on (web: serverEventsOn) */
export const serverEventsOn = (client: Client | undefined, server: Pick<Server, "eventsEnabled"> | undefined) => eventsEnabled(client) && server?.eventsEnabled === true;

/**
 * Where a server opens (web: ServerHome): a server with a lobby opens on
 * it; otherwise undefined, and the phone stays on the channel list.
 */
export function serverHomeRoute(server: Pick<Server, "id" | "lobby"> | undefined) {
  if (!server || !lobbyShown(server)) return undefined;
  return { pathname: "/lobby/[id]" as const, params: { id: server.id } };
}

/**
 * Who opens a member's profile from the lobby and the events. The profile
 * screen belongs to another part of the app, which registers itself here.
 */
let profileOpener: ((userId: string, serverId?: string) => void) | undefined;

export function setProfileOpener(open: ((userId: string, serverId?: string) => void) | undefined) {
  profileOpener = open;
}

export function openProfile(userId: string, serverId?: string) {
  profileOpener?.(userId, serverId);
}
