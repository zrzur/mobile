import type { Channel, Client } from "@zrzur/sdk/solid";

import { foldSearch } from "@/ui/app/ConversationList";

import type { SearchResolver } from "./searchSyntax";

export type SearchPerson = { id: string; name: string; username?: string; avatar?: string };

/** The people a search can name: the server's members, or a conversation's people (web: searchPeople) */
export function searchPeople(channel: Channel, client: Client): SearchPerson[] {
  if (channel.serverId) {
    return client.serverMembers
      .filter((member) => member.id.server === channel.serverId)
      .map((member) => ({
        id: member.id.user,
        name: member.displayName ?? member.user?.username ?? "",
        username: member.user?.username,
        avatar: member.avatarURL,
      }));
  }
  return (channel.recipients ?? []).map((user) => ({ id: user.id, name: user.displayName ?? user.username, username: user.username, avatar: user.avatarURL }));
}

/** Text channels of the server that can hold messages (web: searchChannels) */
export function searchChannels(channel: Channel): Channel[] {
  return (channel.server?.channels ?? []).filter((c) => c.type === "TextChannel" && !c.isVoice && c.havePermission("ViewChannel"));
}

/** Finds people and channels by the name typed, for `toSearchRequest` */
export function searchResolver(channel: Channel, client: Client): SearchResolver {
  return {
    user(name) {
      const wanted = name.toLowerCase();
      const people = searchPeople(channel, client);
      return (people.find((p) => p.username?.toLowerCase() === wanted) ?? people.find((p) => p.name.toLowerCase() === wanted))?.id;
    },
    channel(name) {
      const wanted = name.toLowerCase();
      return searchChannels(channel).find((c) => (c.name ?? "").toLowerCase() === wanted)?.id;
    },
    inServer: !!channel.server,
  };
}

/** Whether any of the texts matches what is typed (Arabic letters folded) */
export function anyMatches(texts: (string | undefined)[], wanted: string) {
  const w = foldSearch(wanted.trim());
  return !w || texts.some((text) => !!text && foldSearch(text).includes(w));
}
