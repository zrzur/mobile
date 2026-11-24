/**
 * What a notification this app shows says: from a Firebase data message
 * (Android, app closed: pushd sends data only, no title) and from a message
 * that arrives over the gateway while the app is open (web:
 * NotificationsWorker titles). Pure, so it is unit tested.
 */
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { pushTarget } from "./links";

/** Android notification channels (Settings > Apps > Zrzur > Notifications) */
export const ANDROID_CHANNELS = {
  messages: "messages",
  friends: "friends",
  calls: "calls",
} as const;
export type AndroidChannel = (typeof ANDROID_CHANNELS)[keyof typeof ANDROID_CHANNELS];

export type LocalContent = {
  /** one notification per channel: a newer message replaces the older (web: tag) */
  identifier: string;
  title: string;
  body?: string;
  androidChannel: AndroidChannel;
  data: { href: string; channelId?: string };
};

const FRIEND_REQUEST = (name: string) => msg`${name} sent you a friend request`;
const FRIEND_ACCEPTED = (name: string) => msg`${name} accepted your friend request`;
const INCOMING_CALL = msg`Incoming call`;
const NEW_MESSAGE = msg`New message`;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Firebase data from pushd (outbound/fcm.rs) as a notification; undefined = show nothing */
export function fcmContent(i18n: I18n, data: Record<string, unknown>): LocalContent | undefined {
  const target = pushTarget(data);
  if (!target) return undefined;
  switch (data.type) {
    case "push.message": {
      const channel = text(data.channel);
      if (!channel) return undefined;
      return {
        identifier: `channel-${channel}`,
        title: text(data.author_name) ?? i18n._(NEW_MESSAGE),
        body: text(data.body),
        androidChannel: ANDROID_CHANNELS.messages,
        data: target,
      };
    }
    case "push.fr.received":
    case "push.fr.accepted": {
      const name = text(data.username) ?? "";
      return {
        identifier: `friend-${text(data.id) ?? name}`,
        title: i18n._(data.type === "push.fr.received" ? FRIEND_REQUEST(name) : FRIEND_ACCEPTED(name)),
        androidChannel: ANDROID_CHANNELS.friends,
        data: target,
      };
    }
    case "push.generic": {
      const title = text(data.title);
      if (!title) return undefined;
      return { identifier: `generic-${title}`, title, body: text(data.body), androidChannel: ANDROID_CHANNELS.messages, data: target };
    }
    case "push.dm.call": {
      // ringing only; an ended call takes the ringing notice away
      if (data.ended === true || data.ended === "true") return undefined;
      const channel = text(data.channel_id);
      if (!channel) return undefined;
      return { identifier: `call-${channel}`, title: i18n._(INCOMING_CALL), androidChannel: ANDROID_CHANNELS.calls, data: target };
    }
    default:
      return undefined;
  }
}

/**
 * The Firebase data out of a background-task payload. Android hands the
 * task either the message's data map or the whole serialized message
 * (`{ data: {...}, messageId, ... }`); both are read here.
 */
export function taskData(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const outer = (payload as Record<string, unknown>).data;
  if (!outer || typeof outer !== "object") return undefined;
  const inner = (outer as Record<string, unknown>).data;
  const data = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : (outer as Record<string, unknown>);
  return typeof data.type === "string" ? data : undefined;
}

/** The notification id an ended call removes */
export function endedCallId(data: Record<string, unknown>): string | undefined {
  if (data.type !== "push.dm.call" || !(data.ended === true || data.ended === "true")) return undefined;
  const channel = text(data.channel_id);
  return channel ? `call-${channel}` : undefined;
}

/** Title of a message notification (web: NotificationsWorker) */
export function messageTitle(input: {
  channelType: string;
  username: string;
  channelName?: string;
  serverName?: string;
  systemAuthor: boolean;
}): string | undefined {
  switch (input.channelType) {
    case "DirectMessage":
      return `@${input.username}`;
    case "Group":
      return input.systemAuthor ? input.channelName : `@${input.username} - ${input.channelName}`;
    case "TextChannel":
      return `@${input.username} (#${input.channelName}, ${input.serverName})`;
    default:
      return undefined;
  }
}

/** Body of a message notification: its text, else the attachment count */
export function messageBody(i18n: I18n, input: { content?: string; attachments: number; hidePreview?: boolean }): string | undefined {
  if (input.hidePreview) return i18n._(NEW_MESSAGE);
  if (text(input.content)) return input.content;
  // same words as the web (msgid "Sent {0} attachments")
  if (input.attachments > 0) return i18n._(msg`Sent ${input.attachments} attachments`);
  return undefined;
}
