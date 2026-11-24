import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Server } from "@zrzur/sdk/solid";

import type { IconName } from "@/ui/Icon";

/** Server settings pages, grouped like the web (ServerSettings.tsx) */
export type SectionId = "overview" | "insights" | "channels" | "emoji" | "soundboard" | "members" | "roles" | "bans" | "joining" | "safety" | "log" | "apps" | "wings";

export type Section = { id: SectionId; title: string; icon: IconName; category: string };

const ANY_ACCESS = [
  "ManageServer",
  "ManageChannel",
  "ManageRole",
  "ManagePermissions",
  "ManageCustomisation",
  "KickMembers",
  "BanMembers",
  "TimeoutMembers",
  "AssignRoles",
  "ManageNicknames",
  "ViewAuditLogs",
] as const;

const SEE_MEMBERS = ["ManageServer", "KickMembers", "BanMembers", "TimeoutMembers", "AssignRoles", "ManageNicknames"] as const;

/** Whether the person may open server settings at all */
export function canOpenServerSettings(server: Server, selfId?: string) {
  return server.ownerId === selfId || server.orPermission(...ANY_ACCESS);
}

export function serverSections(i18n: I18n, server: Server, selfId?: string): Section[] {
  const owner = server.ownerId === selfId;
  const any = owner || server.orPermission(...ANY_ACCESS);
  const manage = server.havePermission("ManageServer");
  const general = i18n._(msg`General`);
  const community = i18n._(msg`Community`);
  const safety = i18n._(msg({ message: "Safety", context: "server-settings" }));
  const members = i18n._(msg`Members`);
  const out: Section[] = [];
  if (any) {
    out.push({ id: "overview", title: i18n._(msg`Overview`), icon: "identification-card", category: general });
    if (manage) out.push({ id: "insights", title: i18n._(msg({ message: "Insights", context: "server insights" })), icon: "waveform", category: general });
    out.push({ id: "channels", title: i18n._(msg`Channels`), icon: "hash", category: general });
    out.push({ id: "joining", title: i18n._(msg`Joining`), icon: "sign-in", category: community });
    out.push({ id: "emoji", title: i18n._(msg`Emoji`), icon: "smiley", category: community });
    out.push({ id: "soundboard", title: i18n._(msg`Soundboard`), icon: "music-note", category: community });
  }
  if (manage) out.push({ id: "safety", title: i18n._(msg({ message: "Safety", context: "server-settings" })), icon: "shield-check", category: safety });
  if (server.havePermission("ViewAuditLogs")) out.push({ id: "log", title: i18n._(msg`Audit log`), icon: "clock-counter-clockwise", category: safety });
  if (any && (server.orPermission(...SEE_MEMBERS) || manage)) out.push({ id: "members", title: members, icon: "users", category: members });
  if (any) out.push({ id: "roles", title: i18n._(msg`Roles`), icon: "key", category: members });
  if (server.havePermission("BanMembers")) out.push({ id: "bans", title: i18n._(msg`Bans`), icon: "gavel", category: members });
  if (manage || server.orPermission("KickMembers", "ManageWebhooks")) out.push({ id: "apps", title: i18n._(msg`Apps`), icon: "robot", category: i18n._(msg`Apps`) });
  // Wings shows only where billing is on (the page checks the plans and says so otherwise)
  if (manage) out.push({ id: "wings", title: i18n._(msg({ message: "Wings", context: "server-settings" })), icon: "lightning", category: i18n._(msg`Extras`) });
  return out;
}
