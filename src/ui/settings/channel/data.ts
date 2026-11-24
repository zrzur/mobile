import { DEFAULT_PERMISSION_DIRECT_MESSAGE, type Channel, type Server } from "@zrzur/sdk/solid";
import { useMemo } from "react";

import { useFields } from "@/client/hooks";

import { groupValue, type Pair, pair, pairText, type RawPair, type StoredCategory } from "../overrides";

type TextPair = { a: string; d: string };

const textRecord = (record?: Record<string, RawPair> | null) =>
  Object.fromEntries(Object.entries(record ?? {}).map(([id, v]) => [id, pairText(v)]));

const toPairs = (record: Record<string, TextPair>): Record<string, Pair> => Object.fromEntries(Object.entries(record).map(([id, v]) => [id, pair(v)]));

export type RoleInfo = { id: string; name: string; colour?: string; permissions: Pair };

/** The server's default permission value, owner and roles (highest first) */
export function useServerRoles(server: Server | undefined) {
  const raw = useFields(server, (s) => ({
    serverDefault: String(s.defaultPermissions),
    ownerId: s.ownerId,
    roles: s.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour ?? undefined, ...pairText(r.permissions) })),
  }));
  return useMemo(
    () =>
      raw
        ? {
            serverDefault: BigInt(raw.serverDefault),
            ownerId: raw.ownerId,
            roles: raw.roles.map((r) => ({ id: r.id, name: r.name, colour: r.colour, permissions: pair(r) })) as RoleInfo[],
          }
        : undefined,
    [raw],
  );
}

/** The category that holds a channel */
export function categoryOf(server: Server | undefined, channelId: string): StoredCategory | undefined {
  return server?.categories?.find((c) => c.channels.includes(channelId)) as StoredCategory | undefined;
}

/** Everything the channel settings read, as plain values */
export function useChannelData(channel: Channel | undefined) {
  const raw = useFields(channel, (c) => {
    const category = categoryOf(c.server, c.id);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      description: c.description ?? "",
      icon: c.iconURL,
      voice: c.isVoice && c.type === "TextChannel",
      stage: c.isStage,
      forum: c.isForum,
      parentId: c.parentId,
      parentName: c.parent?.name,
      serverId: c.serverId,
      slowmode: c.slowmode,
      announcement: c.announcement,
      maxUsers: c.voice?.maxUsers ?? 0,
      mature: c.mature,
      synced: c.permissionsSynced,
      categoryId: category?.id,
      categoryTitle: category?.title,
      everyone: pairText(c.defaultPermissions),
      roles: textRecord(c.rolePermissions),
      members: textRecord(c.memberPermissions),
      categoryEveryone: pairText(category?.default_permissions ?? undefined),
      categoryRoles: textRecord(category?.role_permissions),
      held: String(c.permission),
      groupPermissions: String(groupValue(c.permissions, DEFAULT_PERMISSION_DIRECT_MESSAGE)),
      manageChannel: c.havePermission("ManageChannel"),
      managePermissions: c.havePermission("ManagePermissions"),
      manageWebhooks: c.havePermission("ManageWebhooks"),
    };
  });
  return useMemo(() => {
    if (!raw) return undefined;
    const own = { everyone: pair(raw.everyone), roles: toPairs(raw.roles) };
    const category = { everyone: pair(raw.categoryEveryone), roles: toPairs(raw.categoryRoles) };
    return {
      ...raw,
      held: BigInt(raw.held),
      groupPermissions: BigInt(raw.groupPermissions),
      own,
      members: toPairs(raw.members),
      category,
      /** the overrides in force: the category's while the channel follows it */
      inForce: raw.synced && raw.categoryId ? category : own,
    };
  }, [raw]);
}

export type ChannelData = NonNullable<ReturnType<typeof useChannelData>>;

/** One category of a server, as plain values (undefined once it is gone) */
export function useCategoryData(server: Server | undefined, categoryId: string) {
  const raw = useFields(
    server,
    (s) => {
      const category = s.categories?.find((c) => c.id === categoryId) as StoredCategory | undefined;
      if (!category || categoryId === "default") return null;
      const known = new Map(s.channels.map((c) => [c.id, c]));
      return {
        id: category.id,
        title: category.title,
        description: category.description ?? "",
        everyone: pairText(category.default_permissions ?? undefined),
        roles: textRecord(category.role_permissions as never),
        hidden: category.channels.filter((id) => !known.has(id)).length,
        channels: category.channels
          .map((id) => known.get(id))
          .filter((c): c is Channel => !!c)
          .map((c) => ({
            id: c.id,
            name: c.name,
            voice: c.isVoice,
            synced: c.permissionsSynced,
            canSync: c.havePermission("ManagePermissions"),
            everyone: pairText(c.defaultPermissions),
            roles: textRecord(c.rolePermissions),
          })),
        manageChannel: s.havePermission("ManageChannel"),
        managePermissions: s.havePermission("ManagePermissions"),
        held: String(s.permission),
      };
    },
    [categoryId],
  );
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    return {
      ...raw,
      held: BigInt(raw.held),
      inForce: { everyone: pair(raw.everyone), roles: toPairs(raw.roles) },
      channels: raw.channels.map((c) => ({ ...c, own: { everyone: pair(c.everyone), roles: toPairs(c.roles) } })),
    };
  }, [raw]);
}

export type CategoryData = NonNullable<ReturnType<typeof useCategoryData>>;
