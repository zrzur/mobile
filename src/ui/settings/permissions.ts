import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Permission } from "@zrzur/sdk";

/** Permission groups in the web's order (settings/server/permissions) */
export type PermissionKey = keyof typeof Permission;

export type PermissionItem = { key: PermissionKey; title: string; text: string; powerful?: boolean };
export type PermissionGroup = { title: string; items: PermissionItem[] };

const POWERFUL: PermissionKey[] = ["Administrator", "ManageServer", "ManagePermissions", "ManageRole", "BanMembers", "KickMembers", "ManageChannel"];

export function permissionGroups(i18n: I18n): PermissionGroup[] {
  const _ = (d: MessageDescriptor) => i18n._(d);
  const item = (key: PermissionKey, title: string, text: string): PermissionItem => ({ key, title, text, powerful: POWERFUL.includes(key) });
  return [
    {
      title: _(msg`Admin`),
      items: [
        item("Administrator", _(msg`Administrator`), _(msg`Every right in every channel, private ones too, whatever their settings say. Only an administrator or the owner can give it.`)),
        item("ManageChannel", _(msg`Manage channel`), _(msg`Edit and delete channel`)),
        item("ManageServer", _(msg`Manage server`), _(msg`Edit the server's information and settings`)),
        item("ManagePermissions", _(msg`Manage permissions`), _(msg`Edit any permissions on the server`)),
        item("ManageRole", _(msg`Manage roles`), _(msg`Create and edit server roles`)),
        item("ManageCustomisation", _(msg`Manage customisation`), _(msg`Create server emoji`)),
      ],
    },
    {
      title: _(msg`Members`),
      items: [
        item("KickMembers", _(msg`Kick members`), _(msg`Kick lower-ranking members from the server`)),
        item("BanMembers", _(msg`Ban members`), _(msg`Ban lower-ranking members from the server`)),
        item("TimeoutMembers", _(msg`Timeout members`), _(msg`Temporarily prevent lower-ranking members from interacting`)),
        item("AssignRoles", _(msg`Assign roles`), _(msg`Assign lower-ranked roles to lower-ranking members`)),
        item("ManageJoinRequests", _(msg`Manage join requests`), _(msg`Approve or reject people who ask to join a private server`)),
        item("ViewAuditLogs", _(msg`View audit log`), _(msg`See who changed what on the server`)),
        item("ChangeNickname", _(msg`Change nickname`), _(msg`Change own nickname`)),
        item("ManageNicknames", _(msg`Manage nicknames`), _(msg`Change other members' nicknames`)),
        item("ChangeAvatar", _(msg`Change avatar`), _(msg`Change own avatar`)),
        item("RemoveAvatars", _(msg`Remove avatars`), _(msg`Remove other members' avatars`)),
      ],
    },
    {
      title: _(msg`Channels`),
      items: [
        item("ViewChannel", _(msg`View channel`), _(msg`Able to access channels on this server`)),
        item("ReadMessageHistory", _(msg`Read message history`), _(msg`Read past messages sent in channels`)),
        item("SendMessage", _(msg`Send messages`), _(msg`Send messages in channels`)),
        item("ManageMessages", _(msg`Manage messages`), _(msg`Delete and pin messages sent by other members`)),
        item("ManageWebhooks", _(msg`Manage webhooks`), _(msg`Create and edit webhooks`)),
        item("InviteOthers", _(msg`Invite others`), _(msg`Create invites for others to use`)),
      ],
    },
    {
      title: _(msg`Messaging`),
      items: [
        item("SendEmbeds", _(msg`Send embeds`), _(msg`Send embedded content such as link embeds or custom embeds`)),
        item("UploadFiles", _(msg`Upload files`), _(msg`Send attachments to chat`)),
        item("Masquerade", _(msg`Masquerade`), _(msg`Allow members to change name and avatar per-message`)),
        item("React", _(msg`React`), _(msg`React to messages with emoji`)),
        item("UseExternalEmojis", _(msg`Use emojis from other servers`), _(msg`Send and react with custom emojis from other servers`)),
        item("BypassSlowmode", _(msg`Bypass slowmode`), _(msg`Bypasses slowmode in channels`)),
      ],
    },
    {
      title: _(msg`Threads and forums`),
      items: [
        item("CreateThreads", _(msg`Create threads`), _(msg`Start threads in the text channels of this server`)),
        item("SendMessageInThreads", _(msg`Send messages in threads`), _(msg`Write in the threads and forum posts of this server`)),
        item("CreateForumPosts", _(msg`Create forum posts`), _(msg`Start posts in the forums of this server`)),
      ],
    },
    {
      title: _(msg`Voice`),
      items: [
        item("Connect", _(msg`Connect`), _(msg`Connect to voice channel`)),
        item("Speak", _(msg`Speak`), _(msg`Able to speak in voice call`)),
        item("Video", _(msg`Video`), _(msg`Share camera or screen in voice call`)),
        item("MuteMembers", _(msg`Mute members`), _(msg`Mute lower-ranking members in voice call`)),
        item("DeafenMembers", _(msg`Deafen members`), _(msg`Deafen lower-ranking members in voice call`)),
        item("MoveMembers", _(msg`Move members`), _(msg`Move members between voice channels`)),
        item("Listen", _(msg`Listen`), _(msg`Hear other people and see their video`)),
        item("UseSoundboard", _(msg`Use soundboard`), _(msg`Play the server's sounds in a voice call`)),
        item("ManageSoundboard", _(msg`Manage soundboard`), _(msg`Add and remove the server's sounds`)),
      ],
    },
    {
      title: _(msg`Mentions`),
      items: [
        item("MentionEveryone", _(msg`Mention everyone`), _(msg`Mention everyone and online members inside the server`)),
        item("MentionRoles", _(msg`Mention roles`), _(msg`Mention specific roles`)),
      ],
    },
  ];
}

export type TriState = "allow" | "inherit" | "deny";

/** Reads one permission out of an allow/deny pair */
export function stateOf(key: PermissionKey, allow: bigint, deny: bigint): TriState {
  const bit = Permission[key];
  if ((allow & bit) === bit) return "allow";
  if ((deny & bit) === bit) return "deny";
  return "inherit";
}

/** Sets one permission in an allow/deny pair */
export function withState(key: PermissionKey, state: TriState, allow: bigint, deny: bigint): [bigint, bigint] {
  const bit = Permission[key];
  const a = state === "allow" ? allow | bit : allow & ~bit;
  const d = state === "deny" ? deny | bit : deny & ~bit;
  return [a, d];
}
