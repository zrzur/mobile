/** The parts of a channel that decide which screen opens it */
export type RoutableChannel = { id: string; isForum?: boolean; isThread?: boolean };

export type ChannelHref =
  | { pathname: "/forum/[id]"; params: { id: string } }
  | { pathname: "/thread/[id]"; params: { id: string; message?: string } }
  | { pathname: "/channel/[id]"; params: { id: string; message?: string } };

/**
 * Where a tap on a channel goes: a forum opens its post list, a thread (or
 * forum post) its own chat screen, anything else the chat screen. `message`
 * is a message to scroll to (search results, pins, media); the chat and
 * thread screens also accept the older `jump` name.
 */
export function channelRoute(channel: RoutableChannel, message?: string): ChannelHref {
  if (channel.isForum) return { pathname: "/forum/[id]", params: { id: channel.id } };
  const params = message ? { id: channel.id, message } : { id: channel.id };
  if (channel.isThread) return { pathname: "/thread/[id]", params };
  return { pathname: "/channel/[id]", params };
}

/** Like `channelRoute`, and a voice channel opens its voice page (channel mentions, lobby, events) */
export function anyChannelRoute(channel: RoutableChannel & { isVoice?: boolean }, message?: string): ChannelHref | { pathname: "/voice/[id]"; params: { id: string } } {
  if (channel.isVoice) return { pathname: "/voice/[id]", params: { id: channel.id } };
  return channelRoute(channel, message);
}
