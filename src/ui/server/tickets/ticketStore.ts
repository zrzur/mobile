/**
 * Ticket requests, on the same routes as the web (sdk-js beta Server
 * openTicket, Channel claim/unclaim/close/reopen). The installed SDK keeps
 * neither a channel's ticket nor a server's ticket settings, so both are
 * read from the raw API objects and kept here for the session.
 */
import type { Client } from "@zrzur/sdk/solid";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

import { readServerTickets, readTicket, type ServerTickets, type TicketInfo, transcriptFile, transcriptLine, transcriptText } from "./ticketLogic";

type Api = {
  get: (path: string, query?: unknown) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body?: unknown) => Promise<unknown>;
  delete: (path: string, body?: unknown) => Promise<unknown>;
};
const api = (client: Client) => client.api as unknown as Api;

const settings = new Map<string, ServerTickets>();

/** A server's ticket settings (cached for the session; `fresh` asks again) */
export async function serverTickets(client: Client, serverId: string, fresh = false): Promise<ServerTickets> {
  const known = settings.get(serverId);
  if (known && !fresh) return known;
  const value = readServerTickets(await api(client).get(`/servers/${serverId}`));
  settings.set(serverId, value);
  return value;
}

/** What is known without a request */
export const cachedServerTickets = (serverId: string) => settings.get(serverId);

/** A channel's ticket state, undefined when it is not a ticket */
export async function channelTicket(client: Client, channelId: string): Promise<TicketInfo | undefined> {
  return readTicket(await api(client).get(`/channels/${channelId}`));
}

/** Open a ticket, or get the one already open (the server hands it back) */
export async function openTicket(client: Client, serverId: string, subject?: string, kind?: string): Promise<string> {
  const channel = (await api(client).post(`/servers/${serverId}/tickets`, { ...(subject ? { subject } : {}), ...(kind ? { kind } : {}) })) as { _id: string };
  client.channels.getOrCreate(channel._id, channel as never);
  return channel._id;
}

const route = (serverId: string, channelId: string) => `/servers/${serverId}/tickets/${channelId}`;

export const claimTicket = (client: Client, serverId: string, channelId: string) => api(client).put(`${route(serverId, channelId)}/claim`);
export const unclaimTicket = (client: Client, serverId: string, channelId: string) => api(client).delete(`${route(serverId, channelId)}/claim`);
export const closeTicket = (client: Client, serverId: string, channelId: string) => api(client).post(`${route(serverId, channelId)}/close`, {});
export const reopenTicket = (client: Client, serverId: string, channelId: string) => api(client).post(`${route(serverId, channelId)}/reopen`);

/**
 * The ticket's messages as plain text, oldest first (at most 1000; web:
 * ticketTranscript), handed to the share sheet as a .txt file.
 */
export async function saveTranscript(client: Client, channelId: string, kind?: string): Promise<void> {
  const channel = client.channels.get(channelId);
  if (!channel) return;
  const lines: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const messages = await channel.fetchMessages({ limit: 100, before } as never);
    for (const message of messages) {
      lines.push(
        transcriptLine(
          message.createdAt,
          message.author?.displayName ?? message.username ?? message.authorId ?? "?",
          // the server's first words are a system message: its text is not in `content`
          message.content || (message.systemMessage as { content?: string } | undefined)?.content || "",
          message.attachments?.length ?? 0,
        ),
      );
    }
    if (messages.length < 100) break;
    before = messages[messages.length - 1].id;
  }
  const text = transcriptText(channel.name ?? "", kind, channel.description ?? undefined, lines);
  const file = new File(Paths.cache, transcriptFile(channel.name ?? ""));
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "text/plain", UTI: "public.plain-text" });
      return;
    }
  } catch {
    // no file sharing here: the text itself
  }
  await Share.share({ message: text }).catch(() => {});
}
