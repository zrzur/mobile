import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { IconName } from "@/ui/Icon";

/** Audit log sentences (web: audit/AuditLog.tsx) */
export type Action = { type: string; [key: string]: unknown };
export type Entry = { _id: string; server: string; user: string; target?: string; reason?: string; action: Action };
export type ApiUser = { _id: string; username: string; display_name?: string; avatar?: { _id: string; tag?: string }; bot?: unknown };
export type Kind = "create" | "edit" | "delete";

export const ACTION_TYPES: Record<string, string[]> = {
  members: ["MemberEdit", "MemberKick", "BanCreate", "BanDelete", "BotAdd", "BotRemove", "AutoModAction"],
  messages: ["MessageDelete", "MessageBulkDelete", "MessagePin", "MessageUnpin"],
  channels: ["ChannelCreate", "ChannelEdit", "ChannelRolePermissionsEdit", "ChannelMemberPermissionsEdit", "ChannelDelete", "StageEnd"],
  roles: ["RoleCreate", "RoleEdit", "RoleDelete", "RolesReorder"],
  server: ["ServerEdit"],
  invites: ["InviteCreate", "InviteDelete", "WebhookCreate", "WebhookUpdate", "WebhookTokenReset", "WebhookDelete"],
  emojis: ["EmojiCreate", "EmojiUpdate", "EmojiDelete", "SoundboardSoundCreate", "SoundboardSoundDelete"],
  apps: ["BotAdd", "BotRemove", "CommandPermissionsUpdate"],
};

/** Names used inside the sentences (web: AuditLog names) */
export type Names = { user: (id?: string) => string; channel: (id?: string, fallback?: string) => string; role: (id?: string, fallback?: string) => string };

/** The sentence after the actor's name, its kind and icon (web: AuditLog) */
export function describeEntry(i18n: I18n, a: Action, n: Names): { text: string; kind: Kind; icon: IconName } {
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const before = (a.before ?? {}) as Record<string, unknown>;
  const after = (a.after ?? {}) as Record<string, unknown>;
  const user = n.user(s(a.user) || undefined);
  const bot = n.user(s(a.bot) || undefined);
  const author = n.user(s(a.author) || undefined);
  const channel = n.channel(s(a.channel) || undefined);
  const name = s(a.name);
  switch (a.type) {
    case "BotAdd":
      return { text: i18n._(msg`added the bot ${bot}`), kind: "create", icon: "robot" };
    case "BotRemove":
      return { text: i18n._(msg`removed the bot ${bot}`), kind: "delete", icon: "robot" };
    case "AutoModAction": {
      const rule = s(a.rule);
      return { text: i18n._(msg`was stopped by the AutoMod rule ${rule} in ${channel}`), kind: "edit", icon: "shield-check" };
    }
    case "CommandPermissionsUpdate":
      return { text: a.command ? i18n._(msg`changed who can use a command of ${bot}`) : i18n._(msg`changed who can use the commands of ${bot}`), kind: "edit", icon: "robot" };
    case "MessageDelete":
      return { text: i18n._(msg`deleted a message by ${author} in ${channel}`), kind: "delete", icon: "trash" };
    case "MessageBulkDelete": {
      const count = s(a.count);
      return { text: i18n._(msg`deleted ${count} messages in ${channel}`), kind: "delete", icon: "trash" };
    }
    case "MessagePin":
      return { text: i18n._(msg`pinned a message by ${author} in ${channel}`), kind: "edit", icon: "push-pin" };
    case "MessageUnpin":
      return { text: i18n._(msg`unpinned a message by ${author} in ${channel}`), kind: "edit", icon: "push-pin" };
    case "BanCreate":
      return { text: i18n._(msg`banned ${user}`), kind: "delete", icon: "gavel" };
    case "BanDelete":
      return { text: i18n._(msg`unbanned ${user}`), kind: "create", icon: "gavel" };
    case "MemberKick":
      return { text: i18n._(msg`removed ${user} from the server`), kind: "delete", icon: "user-minus" };
    case "MemberEdit":
      if (after.timeout) return { text: i18n._(msg`timed out ${user}`), kind: "delete", icon: "clock" };
      if (before.timeout && !after.timeout) return { text: i18n._(msg`ended ${user}'s timeout`), kind: "create", icon: "clock" };
      if ("roles" in before || "roles" in after) return { text: i18n._(msg`changed ${user}'s roles`), kind: "edit", icon: "shield-check" };
      if ("nickname" in before || "nickname" in after) return { text: i18n._(msg`changed ${user}'s nickname`), kind: "edit", icon: "pencil-simple" };
      return { text: i18n._(msg`updated ${user}`), kind: "edit", icon: "user" };
    case "ChannelCreate": {
      const created = n.channel(s(a.channel) || undefined, name || undefined);
      return { text: i18n._(msg`created ${created}`), kind: "create", icon: "hash" };
    }
    case "ChannelEdit":
      return { text: i18n._(msg`edited ${channel}`), kind: "edit", icon: "hash" };
    case "ChannelRolePermissionsEdit": {
      const role = n.role(s(a.role) || undefined);
      return { text: i18n._(msg`changed ${role} permissions in ${channel}`), kind: "edit", icon: "lock-simple" };
    }
    case "ChannelMemberPermissionsEdit": {
      const member = n.user(s(a.member) || undefined);
      return { text: i18n._(msg`changed permissions of ${member} in ${channel}`), kind: "edit", icon: "lock-simple" };
    }
    case "ChannelDelete": {
      const deleted = n.channel(undefined, name || undefined);
      return { text: i18n._(msg`deleted ${deleted}`), kind: "delete", icon: "hash" };
    }
    case "RoleCreate": {
      const role = n.role(s(a.role) || undefined, name || undefined);
      return { text: i18n._(msg`created role ${role}`), kind: "create", icon: "shield-check" };
    }
    case "RoleEdit": {
      const role = n.role(s(a.role) || undefined);
      return { text: i18n._(msg`edited role ${role}`), kind: "edit", icon: "shield-check" };
    }
    case "RoleDelete":
      return { text: i18n._(msg`deleted role ${name}`), kind: "delete", icon: "shield-check" };
    case "RolesReorder":
      return { text: i18n._(msg`reordered the roles`), kind: "edit", icon: "shield-check" };
    case "ServerEdit":
      return { text: i18n._(msg`updated the server settings`), kind: "edit", icon: "gear-six" };
    case "InviteCreate": {
      const invite = s(a.invite);
      return { text: i18n._(msg`created invite ${invite} for ${channel}`), kind: "create", icon: "link" };
    }
    case "InviteDelete": {
      const invite = s(a.invite);
      return { text: i18n._(msg`deleted invite ${invite}`), kind: "delete", icon: "link" };
    }
    case "WebhookCreate":
      return { text: i18n._(msg`created webhook ${name} in ${channel}`), kind: "create", icon: "webhooks-logo" };
    case "WebhookUpdate":
      return { text: i18n._(msg`edited webhook ${name}`), kind: "edit", icon: "webhooks-logo" };
    case "WebhookTokenReset":
      return { text: i18n._(msg`made a new address for webhook ${name}`), kind: "edit", icon: "webhooks-logo" };
    case "WebhookDelete":
      return { text: i18n._(msg`deleted webhook ${name}`), kind: "delete", icon: "webhooks-logo" };
    case "EmojiCreate":
      return { text: i18n._(msg`added emoji :${name}:`), kind: "create", icon: "smiley" };
    case "EmojiUpdate":
      return { text: i18n._(msg`edited an emoji`), kind: "edit", icon: "smiley" };
    case "EmojiDelete":
      return { text: i18n._(msg`deleted emoji :${name}:`), kind: "delete", icon: "smiley" };
    case "SoundboardSoundCreate":
      return { text: i18n._(msg`added the sound ${name}`), kind: "create", icon: "music-note" };
    case "SoundboardSoundDelete":
      return { text: i18n._(msg`removed the sound ${name}`), kind: "delete", icon: "music-note" };
    case "StageEnd":
      return { text: i18n._(msg`closed the stage ${channel}`), kind: "delete", icon: "waveform" };
    default:
      return { text: a.type, kind: "edit", icon: "info" };
  }
}
