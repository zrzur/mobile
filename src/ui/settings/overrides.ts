import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Permission, serverChannelPermission } from "@zrzur/sdk";

import type { PermissionGroup, PermissionKey } from "./permissions";

/**
 * Channel and category permission overrides, worked out the way the API does
 * (web: settings/channel/permissions/visibility.ts, dangerous.ts and
 * settings/category/category.ts). Pure functions: tested in
 * __tests__/overrides.test.ts.
 */

/** An allow / deny pair, as bigints */
export type Pair = { a: bigint; d: bigint };

/** An allow / deny pair as the API or the store hands it (numbers, bigints or strings) */
export type RawPair = { a: number | bigint | string; d: number | bigint | string };

const VIEW = Permission.ViewChannel;
const NONE: Pair = { a: 0n, d: 0n };

export function pair(value?: RawPair | null): Pair {
  return { a: BigInt(value?.a ?? 0), d: BigInt(value?.d ?? 0) };
}

/** A pair as strings: safe inside useFields (no bigint in JSON) */
export function pairText(value?: RawPair | null): { a: string; d: string } {
  const p = pair(value);
  return { a: String(p.a), d: String(p.d) };
}

/** Every pair of a record of overrides as bigints */
export function pairs(record?: Record<string, RawPair> | null): Record<string, Pair> {
  return Object.fromEntries(Object.entries(record ?? {}).map(([id, value]) => [id, pair(value)]));
}

/** What the API expects in `{ permissions }` */
export function toOverride(value: Pair): { allow: number; deny: number } {
  return { allow: Number(value.a), deny: Number(value.d) };
}

/**
 * Whether a member holding only this role (or no role) sees the channel,
 * in the API's order
 */
export function sees(serverDefault: bigint, everyone: Pair, role?: { permissions: Pair; override?: Pair }): boolean {
  const perm = serverChannelPermission({
    serverDefault,
    channelDefault: everyone,
    serverRoles: role ? [role.permissions] : [],
    channelRoles: role?.override ? [role.override] : [],
    timedOut: false,
  });
  return (perm & VIEW) === VIEW;
}

/** Private: a member with only the server default does not see it */
export function isPrivate(serverDefault: bigint, everyone: Pair): boolean {
  return !sees(serverDefault, everyone);
}

/** The @everyone override with View denied (private) or no longer denied */
export function everyoneOverride(everyone: Pair, makePrivate: boolean): Pair {
  return makePrivate ? { a: everyone.a & ~VIEW, d: everyone.d | VIEW } : { a: everyone.a, d: everyone.d & ~VIEW };
}

/**
 * The role's override that lets it in (View allowed, not denied) or keeps it
 * out: View removed from allow, and denied when the role would still see it
 */
export function roleOverride(serverDefault: bigint, everyone: Pair, role: { permissions: Pair; override?: Pair }, see: boolean): Pair {
  const current = role.override ?? NONE;
  const next = { a: current.a & ~VIEW, d: current.d & ~VIEW };
  if (see) return { a: next.a | VIEW, d: next.d };
  if (sees(serverDefault, everyone, { permissions: role.permissions, override: next })) return { a: next.a, d: next.d | VIEW };
  return next;
}

/** One person's own override with View allowed, other bits kept */
export function memberAdd(current?: Pair): Pair {
  const value = current ?? NONE;
  return { a: value.a | VIEW, d: value.d & ~VIEW };
}

/** One person's own override without the View bits, other bits kept */
export function memberRemove(current?: Pair): Pair {
  const value = current ?? NONE;
  return { a: value.a & ~VIEW, d: value.d & ~VIEW };
}

export function hasOwnAccess(value?: Pair): boolean {
  return !!value && (value.a & VIEW) === VIEW;
}

export function isHiddenFrom(value?: Pair): boolean {
  return !!value && (value.d & VIEW) === VIEW;
}

/** Allow 0 and deny 0: the API removes such an override */
export function isEmptyOverride(value: Pair): boolean {
  return value.a === 0n && value.d === 0n;
}

/** The people the "People" list shows: let in (private) or kept out (open) */
export function listedPeople(overrides: Record<string, Pair> | undefined, privateChannel: boolean): string[] {
  return Object.entries(overrides ?? {})
    .filter(([, value]) => (privateChannel ? hasOwnAccess(value) : isHiddenFrom(value)))
    .map(([id]) => id);
}

/** Set bits of a permission value (web: countBits, the low 52 bits) */
export function countBits(value: bigint): number {
  let bits = 0;
  for (let i = 0n; i < 52n; i++) if (((1n << i) & value) === 1n << i) bits++;
  return bits;
}

/** "Grants n / denies n" of one override */
export function overrideCounts(value?: Pair): { granted: number; denied: number } {
  return { granted: countBits(value?.a ?? 0n), denied: countBits(value?.d ?? 0n) };
}

export function hasOverride(value?: Pair): boolean {
  return !!value && (countBits(value.a) > 0 || countBits(value.d) > 0);
}

/** Roles (highest first) split into those with an override and those without */
export function splitRoles<R extends { id: string }>(roles: R[], overrides: Record<string, Pair> | undefined): { withOverrides: R[]; without: R[] } {
  return {
    withOverrides: roles.filter((r) => hasOverride(overrides?.[r.id])),
    without: roles.filter((r) => !hasOverride(overrides?.[r.id])),
  };
}

/** Permissions that hand out a lot of control: the editor warns when allowed */
export const DANGEROUS: PermissionKey[] = ["Administrator", "ManageServer", "ManagePermissions", "ManageRole", "BanMembers"];

/** Every right in every channel of the server */
export function isAdministrator(allow: bigint): boolean {
  return (allow & Permission.Administrator) === Permission.Administrator;
}

/** Whether you hold this permission (rows you lack are locked in the editor) */
export function holds(held: bigint, key: PermissionKey): boolean {
  const bit = Permission[key];
  return (held & bit) === bit;
}

/** Sets one key of an override (both bits cleared first) */
export function setOne(value: Pair, key: PermissionKey, state: "allow" | "inherit" | "deny"): Pair {
  const bit = Permission[key];
  const a = value.a & ~bit;
  const d = value.d & ~bit;
  return state === "allow" ? { a: a | bit, d } : state === "deny" ? { a, d: d | bit } : { a, d };
}

/* ----------------------------- categories ----------------------------- */

/** A category as the server stores it (newer fields than the API types) */
export type StoredCategory = {
  id: string;
  title: string;
  channels: string[];
  description?: string | null;
  default_permissions?: RawPair | null;
  role_permissions?: Record<string, RawPair>;
};

export function isPrivateCategory(serverDefault: bigint, category: { default_permissions?: RawPair | null }): boolean {
  return isPrivate(serverDefault, pair(category.default_permissions));
}

/** A channel with its own permissions that people with no role can see */
export function openToEveryone(serverDefault: bigint, channelDefault?: Pair): boolean {
  return sees(serverDefault, channelDefault ?? NONE);
}

type Overrides = { everyone: Pair; roles: Record<string, Pair> };

/** Whether a role that the category keeps out still sees a channel with its own permissions */
export function seenByRoleOutside(serverDefault: bigint, category: Overrides, channel: Overrides, role: { id: string; permissions: Pair }): boolean {
  const inCategory = sees(serverDefault, category.everyone, { permissions: role.permissions, override: category.roles[role.id] });
  const inChannel = sees(serverDefault, channel.everyone, { permissions: role.permissions, override: channel.roles[role.id] });
  return !inCategory && inChannel;
}

/**
 * Whether a channel with its own permissions inside a private category is
 * still seen by people outside it (everyone, or a role kept out)
 */
export function leaksOutside(serverDefault: bigint, category: Overrides, channel: Overrides, roles: { id: string; permissions: Pair }[]): boolean {
  if (openToEveryone(serverDefault, channel.everyone)) return true;
  return roles.some((role) => seenByRoleOutside(serverDefault, category, channel, role));
}

/** The category list without one category (delete category) */
export function withoutCategory<C extends { id: string }>(categories: C[] | undefined, id: string): C[] {
  return (categories ?? []).filter((c) => c.id !== id);
}

/* ------------------------- the permission list ------------------------ */

export type PermissionVariant = "server" | "channel" | "category" | "group";
export type ChannelKind = { voice?: boolean; forum?: boolean };

/** Server-only rights: never shown for a channel or a category */
const SERVER_ONLY: PermissionKey[] = [
  "Administrator",
  "ManageServer",
  "ManageRole",
  "ManageCustomisation",
  "KickMembers",
  "BanMembers",
  "TimeoutMembers",
  "AssignRoles",
  "ManageJoinRequests",
  "ViewAuditLogs",
  "ChangeNickname",
  "ManageNicknames",
  "ChangeAvatar",
  "RemoveAvatars",
  "ManageSoundboard",
];

const THREADS: PermissionKey[] = ["CreateThreads", "SendMessageInThreads", "CreateForumPosts"];

/**
 * The permission groups for one place: the server list as it is, or the
 * channel / category list with their wording (spec §8b, §9b). Empty groups
 * are dropped; the first channel group carries no heading (title "").
 */
export function variantGroups(i18n: I18n, groups: PermissionGroup[], variant: PermissionVariant, kind: ChannelKind = {}): PermissionGroup[] {
  if (variant === "server") return groups;
  if (variant === "group") return groupPermissionGroups(i18n, groups);
  const _ = (d: MessageDescriptor) => i18n._(d);
  const channelText: Partial<Record<PermissionKey, string>> = {
    ManagePermissions: _(msg`Edit channel-specific role and default permissions`),
    ViewChannel: _(msg`Able to access this channel`),
    ReadMessageHistory: _(msg`Read past messages sent in channel`),
    SendMessage: _(msg`Send messages in channel`),
    ...(variant === "category"
      ? {
          CreateThreads: _(msg`Start threads in the text channels of this category`),
          SendMessageInThreads: _(msg`Write in the threads and forum posts of this category`),
          CreateForumPosts: _(msg`Start posts in the forums of this category`),
        }
      : {
          CreateThreads: _(msg`Start threads in this channel`),
          SendMessageInThreads: _(msg`Write in the threads and posts of this channel`),
          CreateForumPosts: _(msg`Start posts in this forum`),
        }),
  };
  const hidden = (key: PermissionKey) => {
    if (SERVER_ONLY.includes(key)) return true;
    if (variant === "channel" && THREADS.includes(key)) {
      if (kind.voice) return true;
      if (key === "CreateThreads" && kind.forum) return true;
      if (key === "CreateForumPosts" && !kind.forum) return true;
    }
    return false;
  };
  return groups
    .map((g, index) => ({
      title: index === 0 ? "" : g.title,
      items: g.items
        .filter((p) => !hidden(p.key))
        .map((p) => ({ ...p, text: channelText[p.key] ?? p.text, powerful: DANGEROUS.includes(p.key) })),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * What a group's members may do (web ChannelPermissionsEditor, type "group"):
 * only the rights with a Group or Any wording, in the server order and under
 * the same headings, with the group wording.
 */
const GROUP_KEYS: PermissionKey[] = [
  "ManageChannel",
  "ManagePermissions",
  "SendMessage",
  "ManageMessages",
  "ManageWebhooks",
  "InviteOthers",
  "SendEmbeds",
  "UploadFiles",
  "Masquerade",
  "React",
  "UseExternalEmojis",
  "MentionEveryone",
  "MentionRoles",
];

export function groupPermissionGroups(i18n: I18n, groups: PermissionGroup[]): PermissionGroup[] {
  const _ = (d: MessageDescriptor) => i18n._(d);
  const groupText: Partial<Record<PermissionKey, string>> = {
    ManageChannel: _(msg`Edit group name and description`),
    ManagePermissions: _(msg`Whether other users can edit these settings`),
    SendMessage: _(msg`Send messages in channel`),
    ManageMessages: _(msg`Delete and pin messages sent by other members`),
    ManageWebhooks: _(msg`Create and edit webhooks`),
    InviteOthers: _(msg`Add new members to the group`),
  };
  return groups
    .map((g) => ({
      title: g.title,
      items: g.items.filter((p) => GROUP_KEYS.includes(p.key)).map((p) => ({ ...p, text: groupText[p.key] ?? p.text, powerful: DANGEROUS.includes(p.key) })),
    }))
    .filter((g) => g.items.length > 0);
}

/** A group's own permission value: what every member but the owner may do */
export function groupValue(permissions: bigint | number | string | undefined | null, fallback: bigint): bigint {
  return permissions === undefined || permissions === null ? fallback : BigInt(permissions);
}

/* ------------------------------- errors ------------------------------- */

export type AccessErrorKind = "missing" | "elevated" | "give" | "gone";

/** Which plain sentence a refused access change gets (else describeError) */
export function accessErrorKind(type: string | undefined): AccessErrorKind | undefined {
  switch (type) {
    case "MissingPermission":
      return "missing";
    case "NotElevated":
      return "elevated";
    case "CannotGiveMissingPermissions":
      return "give";
    case "NotFound":
      return "gone";
    default:
      return undefined;
  }
}

/* ------------------------------ channel ------------------------------- */

/** Slowmode values offered (seconds) */
export const SLOWMODE = [0, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 21600];

/** Highest user limit of a voice channel (0 = no limit) */
export const USER_LIMIT_MAX = 50;

export function clampUserLimit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(USER_LIMIT_MAX, Math.round(n)));
}

/** Only the fields that changed, with `remove` for cleared ones (PATCH /channels/{id}) */
export function channelChanges(
  initial: { name: string; description: string; slowmode: number; announcement: boolean; maxUsers: number; roomName: string },
  next: { name: string; description: string; slowmode: number; announcement: boolean; maxUsers: number; roomName: string },
  opts: { voice: boolean; roomMaker: boolean },
): Record<string, unknown> {
  const changes: Record<string, unknown> = { remove: [] as string[] };
  const remove = changes.remove as string[];
  if (next.name.trim() !== initial.name) changes.name = next.name.trim();
  if (next.description !== initial.description) {
    if (next.description.trim()) changes.description = next.description.trim();
    else remove.push("Description");
  }
  if (opts.voice) {
    const voice: Record<string, unknown> = {};
    if (next.maxUsers !== initial.maxUsers) voice.max_users = next.maxUsers > 0 ? next.maxUsers : 0;
    if (opts.roomMaker && next.roomName.trim() !== initial.roomName) voice.room_name = next.roomName.trim();
    if (Object.keys(voice).length) changes.voice = voice;
  } else {
    if (next.slowmode !== initial.slowmode) changes.slowmode = next.slowmode;
    if (next.announcement !== initial.announcement) changes.announcement = next.announcement;
  }
  return changes;
}

/** Only the fields that changed of a category (PATCH /servers/{id}/categories/{categoryId}) */
export function categoryChanges(initial: { title: string; description: string }, next: { title: string; description: string }): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (next.title.trim() !== initial.title) changes.title = next.title.trim();
  // an empty string removes the note (web: editCategory)
  if (next.description.trim() !== initial.description) changes.description = next.description.trim();
  return changes;
}

/** A slowmode value as a localized duration ("5 seconds", "1 hour") */
export function formatDuration(seconds: number, locale: string): string {
  const unit = seconds >= 3600 ? "hour" : seconds >= 60 ? "minute" : "second";
  const value = unit === "hour" ? seconds / 3600 : unit === "minute" ? seconds / 60 : seconds;
  return new Intl.NumberFormat(locale === "zh-Hans" ? "zh-CN" : locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}

/** An upload limit as megabytes ("5 MB") */
export function formatMegabytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale === "zh-Hans" ? "zh-CN" : locale, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(bytes / 1_000_000);
}

/** Room maker fields the SDK 2.0.0 store drops: read from GET /channels/{id} */
export type RawVoice = { maker?: boolean; room_name?: string | null; temporary_for?: string | null };

export function roomMakerOf(channel: { voice?: RawVoice | null } | undefined): { maker: boolean; roomName: string; temporary: boolean } {
  return { maker: !!channel?.voice?.maker, roomName: channel?.voice?.room_name ?? "", temporary: !!channel?.voice?.temporary_for };
}
