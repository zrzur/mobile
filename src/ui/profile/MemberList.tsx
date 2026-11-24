import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import type { ServerMember, User } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { type ReactElement, memo, useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useClient, useConnection } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { decorationUrl, userStyleOf } from "@/ui/designs/style";
import { Icon } from "@/ui/Icon";
import { useCdn } from "@/ui/invite/media";
import { Button } from "@/ui/kit/Button";
import { MENU_DELAY } from "@/ui/kit/ContextMenu";
import { isRTL } from "@/ui/kit/direction";
import { PressableRow } from "@/ui/kit/Press";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { nameFontStyle } from "@/ui/settings/user/profile-look";

import { type ListMember, type MemberListRow, compareNames, groupMembers, statusLine } from "./logic";
import { MemberPlate } from "./MemberPlate";
import { BadgeMark, BotLabel, ProfileAvatar } from "./parts";
import { MEMBER_ROW, memberRowBox, plateInk, plateSource } from "./plate";
import { openProfile, openUserMenu } from "./store";

const HEX = /^#[0-9a-f]{6}$/i;

/** What one row shows, whoever it is (a server member or a group's person) */
type Person = {
  id: string;
  server?: string;
  name: string;
  avatar?: string;
  decoration?: string;
  /** a creator's decoration, as a picture */
  decorationUri?: string;
  plate?: string;
  font?: string;
  /** the person's own first name colour (no role colour) */
  ownColour?: string;
  presence?: string;
  status: string;
  colour?: string;
  bot: boolean;
  officialBot: boolean;
  verifiedBot: boolean;
  timedOut: boolean;
  owner: boolean;
};

/**
 * One person (web MemberSidebar Member): avatar with decoration and presence,
 * name in role colour, status; their nameplate behind the row, fading in
 * from the start. The row is 44 px, its painted box 36.
 */
function PersonRow({ p, online, canModerate, boxed }: { p: Person; online: boolean; canModerate: boolean; boxed: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const box = memberRowBox(boxed);
  const presenceText: Record<string, string> = { Online: t`Online`, Busy: t`Busy`, Focus: t`Focus`, Idle: t`Idle` };
  const status = p.status || (online && p.presence ? (presenceText[p.presence] ?? t`Offline`) : t`Offline`);
  // web attention: active rows in the primary ink, offline ones muted with a faded picture
  const base = online ? palette.fg : palette.muted;
  const ink = p.plate ? plateInk(palette.dark, palette.fg) : undefined;
  const halo = ink ? { textShadowColor: ink.halo, textShadowRadius: ink.radius, textShadowOffset: { width: 0, height: 1 } } : undefined;
  const name = ink?.color ?? (online && p.colour && HEX.test(p.colour) ? p.colour : online && p.ownColour ? p.ownColour : base);
  const menu = () => openUserMenu(p.id, p.server);
  return (
    <View style={{ height: MEMBER_ROW }}>
      {p.plate ? <MemberPlate uri={p.plate} ground={boxed ? palette.field : palette.frame} /> : null}
      {/* long press: the row lifts with a medium tap, then the user menu */}
      <PressableRow
        testID="member-row"
        accessibilityRole="button"
        accessibilityLabel={p.name}
        accessibilityHint={status}
        highlight={palette.navSelected}
        onPress={() => openProfile(p.id, p.server)}
        onLongPress={menu}
        delayLongPress={MENU_DELAY}
        accessibilityActions={[{ name: "longpress" }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && menu()}
        // the 4 px above and under take the touch but are not painted
        hitSlop={{ top: box.inset, bottom: box.inset }}
        style={{
          height: MEMBER_ROW - box.inset * 2,
          marginVertical: box.inset,
          marginHorizontal: box.margin,
          paddingStart: box.padStart,
          paddingEnd: box.padEnd,
          borderRadius: box.radius,
          flexDirection: "row",
          alignItems: "center",
          gap: box.gap,
        }}
      >
        <View style={{ opacity: p.timedOut && canModerate ? 0.5 : online ? 1 : 0.3 }}>
          <ProfileAvatar url={p.avatar} name={p.name} size={32} decoration={p.decoration} decorationUri={p.decorationUri} presence={online ? p.presence : undefined} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <AText autoDir size={14} line={20} weight="medium" color={name} numberOfLines={1} style={[{ flexShrink: 1, letterSpacing: 0.1 }, nameFontStyle(p.font), halo]}>
              {p.name}
            </AText>
            {p.bot ? <BotLabel official={p.officialBot} verified={p.verifiedBot} /> : null}
            {p.owner ? (
              <View accessible accessibilityRole="image" accessibilityLabel={t`Server owner`}>
                <BadgeMark id="server_owner" size={16} />
              </View>
            ) : null}
            {p.timedOut && canModerate ? (
              <View accessible accessibilityRole="image" accessibilityLabel={t`Timed out`}>
                <Icon name="timer" size={14} color={palette.muted} />
              </View>
            ) : null}
          </View>
          <AText autoDir size={12} line={16} color={ink?.color ?? base} numberOfLines={1} style={halo}>
            {status}
          </AText>
        </View>
      </PressableRow>
    </View>
  );
}

/** The parts of a user every row needs */
function personOf(user: User | undefined, cdn: string | undefined, rtl: boolean, dark: boolean) {
  const style = userStyleOf(user);
  const own = style.name_colour?.[0];
  return {
    plate: plateSource(style, cdn, rtl),
    decoration: style.decoration,
    decorationUri: decorationUrl(style, cdn, false),
    font: style.name_font,
    // a name in its own colours: its first colour on dark themes (light themes keep the ink, which always reads)
    ownColour: dark && own && HEX.test(own) ? own : undefined,
    presence: user?.presence as string | undefined,
    status: statusLine(user?.statusEmoji, user?.status?.text),
    bot: !!user?.bot,
    officialBot: !!user?.officialBot,
    verifiedBot: !!user?.verifiedBot,
  };
}

const ServerMemberRow = memo(function ServerMemberRow({ member, online, canModerate, boxed }: { member: ServerMember; online: boolean; canModerate: boolean; boxed: boolean }) {
  const cdn = useCdn();
  const { palette } = useTheme();
  const rtl = isRTL();
  const p = useFields(
    member,
    (m): Person => ({
      ...personOf(m.user, cdn, rtl, palette.dark),
      id: m.id.user,
      server: m.id.server,
      name: m.displayName ?? m.user?.displayName ?? "",
      avatar: m.animatedAvatarURL ?? m.user?.animatedAvatarURL,
      colour: m.roleColour ?? undefined,
      timedOut: !!m.timeout && m.timeout.getTime() > Date.now(),
      owner: !!m.server?.ownerId && m.server.ownerId === m.id.user,
    }),
    [cdn, rtl, palette.dark],
  );
  return p ? <PersonRow p={p} online={online} canModerate={canModerate} boxed={boxed} /> : <View style={{ height: MEMBER_ROW }} />;
});

const GroupUserRow = memo(function GroupUserRow({ userId, boxed }: { userId: string; boxed: boolean }) {
  const client = useClient();
  const cdn = useCdn();
  const { palette } = useTheme();
  const rtl = isRTL();
  const user = useSolid(useCallback(() => client.users.get(userId), [client, userId]));
  const p = useFields(
    user,
    (u): Person & { online: boolean } => ({
      ...personOf(u, cdn, rtl, palette.dark),
      id: u.id,
      name: u.displayName ?? u.username,
      avatar: u.animatedAvatarURL,
      timedOut: false,
      owner: false,
      online: !!u.online,
    }),
    [cdn, rtl, palette.dark],
  );
  return p ? <PersonRow p={p} online={p.online} canModerate={false} boxed={boxed} /> : <View style={{ height: MEMBER_ROW }} />;
});

/** A group's title: "Online – 3" (web CategoryTitle), with the role's icon */
function Title({ name, count, icon, boxed }: { name: string; count: number; icon?: string; boxed: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={{ height: MEMBER_ROW, flexDirection: "row", alignItems: "flex-end", gap: 4, paddingBottom: 6, paddingStart: boxed ? 14 : 16, paddingEnd: boxed ? 14 : 8 }}
    >
      {icon ? <Image source={{ uri: icon }} style={{ width: 16, height: 16, borderRadius: 4, marginBottom: 1 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      <AText autoDir size={boxed ? 13 : 12} line={18} weight="semibold" color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {`${name} – ${count}`}
      </AText>
    </View>
  );
}

/**
 * In the channel details the list sits in one filled box (web
 * ChannelDetailsPhone `Members`: radius 14, the box fill, 8 px under the last
 * person), 12 px in from the screen's sides. The box is drawn a row at a time
 * so the list stays virtual.
 */
function BoxPart({ boxed, first, last, children }: { boxed: boolean; first: boolean; last: boolean; children: ReactElement }) {
  const { palette } = useTheme();
  if (!boxed) return children;
  return (
    <View
      style={{
        marginHorizontal: 12,
        backgroundColor: palette.field,
        borderTopStartRadius: first ? 14 : 0,
        borderTopEndRadius: first ? 14 : 0,
        borderBottomStartRadius: last ? 14 : 0,
        borderBottomEndRadius: last ? 14 : 0,
        paddingBottom: last ? 8 : 0,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

type ListProps = {
  /** drawn above the list and scrolled with it (the channel details' head, tabs and invite row) */
  header?: ReactElement;
  /** the channel details' filled box (web ChannelDetailsPhone); the member page draws the plain sidebar list */
  boxed?: boolean;
};

/**
 * The members of a server on a phone (web MemberSidebar): online members
 * under their highest hoisted role, then Online, then Offline. Only members
 * who can see the channel when one is given. A tap opens the profile, a
 * long press the user menu.
 */
export function MemberList({ serverId, channelId, header, boxed = false }: { serverId: string; channelId?: string } & ListProps) {
  const { t } = useLingui();
  const client = useClient();
  const server = useServer(serverId);
  // opened from a link before the first connection: the server is not known yet, not gone
  const { everConnected } = useConnection();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [tick, setTick] = useState(0);
  // pull to refresh: fetch the member list again
  const pull = usePullRefresh(async () => {
    const before = client.serverMembers.size;
    await server?.fetchMembers();
    return client.serverMembers.size !== before;
  });

  useEffect(() => {
    if (!server) return;
    let alive = true;
    server
      .fetchMembers()
      .then(() => alive && setState("ready"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [server, tick]);

  const snapshot = useSolid(
    useCallback(() => {
      const s = client.servers.get(serverId);
      if (!s) return "[]";
      const channel = channelId ? client.channels.get(channelId) : undefined;
      const restricted = !!channel?.potentiallyRestrictedChannel;
      const members: ListMember[] = client.serverMembers
        .filter((m) => m.id.server === serverId && (!restricted || m.hasPermission(channel!, "ViewChannel")))
        .map((m) => ({ id: m.id.user, name: m.nickname ?? m.user?.displayName ?? "", online: !!m.user?.online, roles: m.roles }));
      const roles = s.orderedRoles.map((r) => ({ id: r.id, name: r.name, hoist: r.hoist, icon: r.icon?.previewUrl }));
      return JSON.stringify({ members, roles, mod: !!s.member?.hasPermission(s, "TimeoutMembers") });
    }, [client, serverId, channelId]),
  );
  const { rows, mod } = useMemo(() => {
    const data = JSON.parse(snapshot) as { members?: ListMember[]; roles?: { id: string; name: string; hoist: boolean; icon?: string }[]; mod?: boolean };
    return { rows: groupMembers(data.members ?? [], data.roles ?? [], { online: t`Online`, offline: t`Offline` }), mod: !!data.mod };
  }, [snapshot, t]);

  const empty = !server && everConnected ? (
    <CenterNote icon="users">{t`This server isn't available.`}</CenterNote>
  ) : state === "loading" ? (
    <View style={{ paddingTop: 16 }} accessible accessibilityLabel={t`Loading members…`} accessibilityLiveRegion="polite">
      <SkeletonRows count={10} avatar={32} gap={4} label={false} testID="member-list-loading" />
    </View>
  ) : state === "error" ? (
    <View testID="member-list-error" style={{ alignItems: "center", paddingBottom: 24 }}>
      <CenterNote icon="warning-circle">{t`Members couldn't be loaded`}</CenterNote>
      <Button testID="member-list-retry" variant="tonal" label={t`Try again`} onPress={() => setTick((n) => n + 1)} />
    </View>
  ) : (
    <CenterNote icon="users">{t`No member matches`}</CenterNote>
  );
  return (
    <FlashList<MemberListRow>
      testID="member-list"
      data={server ? rows : []}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <BoxPart boxed={boxed} first={index === 0} last={index === rows.length - 1}>
          {item.kind === "title" ? (
            <Title name={item.name} count={item.count} icon={item.icon} boxed={boxed} />
          ) : (
            <MemberById serverId={serverId} userId={item.id} online={item.online} canModerate={mod} boxed={boxed} />
          )}
        </BoxPart>
      )}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={pull.control}
      onScroll={pull.onScroll}
      scrollEventThrottle={16}
      ListEmptyComponent={empty}
    />
  );
}

function MemberById({ serverId, userId, online, canModerate, boxed }: { serverId: string; userId: string; online: boolean; canModerate: boolean; boxed: boolean }) {
  const client = useClient();
  const member = useSolid(useCallback(() => client.serverMembers.getByKey({ server: serverId, user: userId }), [client, serverId, userId]));
  return member ? <ServerMemberRow member={member} online={online} canModerate={canModerate} boxed={boxed} /> : <View style={{ height: MEMBER_ROW }} />;
}

type GroupRow = { kind: "title"; key: string; count: number } | { kind: "person"; key: string; id: string };

/**
 * The people of a group (web GroupMemberSidebar): "3 members", then everyone
 * by name, each row like a server member's (nameplate, decoration,
 * presence). A tap opens the profile, a long press the user menu.
 */
export function GroupMemberList({ channelId, header, boxed = false }: { channelId: string } & ListProps) {
  const { t } = useLingui();
  const client = useClient();
  const { palette } = useTheme();
  const snapshot = useSolid(
    useCallback(() => {
      const channel = client.channels.get(channelId);
      if (!channel) return "";
      return JSON.stringify((channel.recipients ?? []).map((u) => ({ id: u.id, name: u.displayName ?? u.username ?? "" })));
    }, [client, channelId]),
  );
  const rows = useMemo<GroupRow[]>(() => {
    if (!snapshot) return [];
    const people = (JSON.parse(snapshot) as { id: string; name: string }[]).sort((a, b) => compareNames(a.name, b.name));
    if (!people.length) return [];
    return [{ kind: "title", key: "title", count: people.length }, ...people.map((p) => ({ kind: "person" as const, key: p.id, id: p.id }))];
  }, [snapshot]);
  return (
    <FlashList<GroupRow>
      testID="member-list"
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <BoxPart boxed={boxed} first={index === 0} last={index === rows.length - 1}>
          {item.kind === "title" ? (
            // web MemberTitle: 12 px above, 16 in, 13/600 muted
            <View accessibilityRole="header" style={{ paddingTop: 12, paddingStart: 16, paddingEnd: 16, paddingBottom: 4 }}>
              <AText size={13} line={18} weight="semibold" color={palette.muted}>
                {t`${plural(item.count, { one: "# member", other: "# members" })}`}
              </AText>
            </View>
          ) : (
            <GroupUserRow userId={item.id} boxed={boxed} />
          )}
        </BoxPart>
      )}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListEmptyComponent={snapshot ? <CenterNote icon="users">{t`Nobody here yet.`}</CenterNote> : null}
    />
  );
}
