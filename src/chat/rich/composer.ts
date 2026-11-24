/**
 * What the composer may offer in a channel, as the web's Composition
 * decides it (the "+" panel on phones: GIF picker, voice message, poll)
 */
import { pollsEnabled } from "./poll";

type ChannelLike = { havePermission(permission: "UploadFiles" | "SendEmbeds" | "SendMessage"): boolean };
type ClientLike = Parameters<typeof pollsEnabled>[0];

/** "GIF picker": only where files may be sent and links embed */
export const canSendGifs = (channel: ChannelLike) => channel.havePermission("UploadFiles") && channel.havePermission("SendEmbeds");

/** "Voice message": a recording is an upload */
export const canRecordVoice = (channel: ChannelLike) => channel.havePermission("UploadFiles");

/**
 * "Create poll": polls on for this server, and the person may post rich
 * content here. The caller adds the web's other two rules: not timed out,
 * and not an announcement channel without Manage Messages.
 */
export const canCreatePoll = (channel: ChannelLike, client: ClientLike) =>
  pollsEnabled(client) && channel.havePermission("SendMessage") && channel.havePermission("SendEmbeds");
