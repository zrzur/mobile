import { useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { Channel } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useCallback, useMemo, useState, useRef } from "react";
import { Pressable, View } from "react-native";

import { useChannel, useFields, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { useClient } from "@/client/ClientProvider";
import { channelRoute } from "@/ui/forum/channelRoute";
import { CategoryMenu, CreateChannelSheet } from "@/ui/server/CreateSheets";
import { PinnedRows } from "@/ui/server/PinnedRows";
import { ServerStats } from "@/ui/server/ServerStats";
import { Button } from "@/ui/kit/Button";

import { AText } from "../auth/parts";
import { isRTL } from "../kit/direction";
import { Icon, type IconName } from "../Icon";
import { ChannelMenu } from "./ChannelMenu";
import { MENU_DELAY } from "../kit/ContextMenu";
import { haptics } from "../kit/haptics";
import { PressableRow } from "../kit/Press";
import { usePullRefresh } from "../kit/PullRefresh";
import { useScrollToTop } from "../kit/scrollToTop";
import { SkeletonRows } from "../kit/Skeleton";
import { foldSearch } from "./ConversationList";
import { CountBadge, SearchField, ToolButton } from "./parts";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/** The glyph for a channel row (web: SidebarIcon) */
export function channelIcon(c: Channel, rulesId?: string): IconName {
  if (c.id === rulesId) return "book-check";
  if (c.announcement && !c.isVoice) return "megaphone";
  if (c.isStage) return "waveform";
  if (c.isVoice) return "speaker-high";
  if (c.isForum) return "note-pencil";
  return "hash";
}

const ChannelRow = memo(function ChannelRow({ id, rulesId, selected, onMenu }: { id: string; rulesId?: string; selected?: boolean; onMenu?: (id: string) => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const channel = useChannel(id);
  const fields = useFields(channel, (c) => ({
    name: c.name,
    icon: channelIcon(c, rulesId),
    custom: c.iconURL,
    unread: c.unread && !c.muted,
    muted: c.muted,
    mentions: c.mentions?.size ?? 0,
    voice: c.isVoice,
    forum: c.isForum,
    thread: c.isThread,
    // visible but closed to you: read-only text, or a voice room you can't join (web ServerSidebar)
    locked: c.isVoice ? !c.havePermission("Connect") : !c.havePermission("SendMessage"),
  }));
  if (!fields) return null;
  const state = selected ? "selected" : fields.unread ? "active" : fields.muted ? "muted" : "normal";
  const text = state === "selected" || state === "active" ? palette.fg : state === "muted" ? palette.muted : palette.fg2;
  return (
    // the highlight is drawn on the inner pill (delayed, so a scroll never flashes it); a long press lifts the row
    <PressableRow
      highlight="transparent"
      testID={`channel-${id}`}
      accessibilityRole="button"
      accessibilityLabel={fields.name}
      accessibilityState={{ selected: !!selected }}
      onPress={() => router.push(fields.voice ? { pathname: "/voice/[id]", params: { id } } : channelRoute({ id, isForum: fields.forum, isThread: fields.thread }))}
      onLongPress={onMenu ? () => onMenu(id) : undefined}
      delayLongPress={MENU_DELAY}
      accessibilityActions={onMenu ? [{ name: "longpress" }] : undefined}
      onAccessibilityAction={onMenu ? (e) => e.nativeEvent.actionName === "longpress" && onMenu(id) : undefined}
      style={{ marginHorizontal: 8, minHeight: 44, paddingVertical: 4 }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 36,
            borderRadius: 10,
            paddingStart: 12,
            paddingEnd: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: selected ? palette.navSelected : pressed ? palette.navHover : "transparent",
          }}
        >
          {selected ? (
            <View style={{ position: "absolute", start: 2, width: 3, height: 16, borderRadius: 999, backgroundColor: palette.accent }} />
          ) : null}
          <View>
            {fields.custom ? (
              <Image source={{ uri: fields.custom }} style={{ width: 20, height: 20, borderRadius: 4 }} cachePolicy="memory-disk" />
            ) : (
              <Icon name={fields.icon} size={20} color={selected ? palette.iconHover : palette.iconMuted} />
            )}
            {fields.locked ? (
              // web lockBadge: a small lock cut out of the row on the icon's bottom corner
              <View
                accessibilityRole="image"
                accessibilityLabel={fields.voice ? t`You can't join this voice channel` : t`You can read this channel but not send messages`}
                style={{
                  position: "absolute",
                  bottom: -3,
                  end: -4,
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? palette.navSelected : palette.frame,
                }}
              >
                <Icon name="lock-simple" size={10} color={palette.muted} />
              </View>
            ) : null}
          </View>
          <AText autoDir size={15} line={20} weight={selected ? "semibold" : "medium"} color={text} numberOfLines={1} style={{ flex: 1 }}>
            {fields.name}
          </AText>
          {!selected && fields.mentions > 0 ? (
            <CountBadge count={fields.mentions} />
          ) : !selected && fields.unread ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.unread }} />
          ) : null}
        </View>
      )}
    </PressableRow>
  );
});

type Row = { kind: "category"; id: string; title: string; open: boolean } | { kind: "channel"; id: string };

/** Open/closed categories, kept for the session */
const closedSections = new Set<string>();

/** The server's channel list on the menu side (web: ServerSidebar + ServerPhoneTools) */
export function ServerPanel({ serverId, onServerMenu, onInvite }: { serverId: string; onServerMenu: () => void; onInvite: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const [query, setQuery] = useState("");
  const [, setVersion] = useState(0);
  // the channel or category whose long-press menu is open (one at a time)
  const [menuFor, setMenuFor] = useState<string>();
  const [category, setCategory] = useState<string>();
  const client = useClient();
  const list = useRef<FlashListRef<Row>>(null);
  useScrollToTop("servers", list);
  // pull to refresh: ask the server for its channels again
  const pull = usePullRefresh(async () => {
    const before = client.channels.size;
    const data = (await client.api.get(`/servers/${serverId as ""}` as never, { include_channels: true } as never)) as { channels?: unknown[] };
    for (const c of data.channels ?? []) if (c && typeof c === "object") client.channels.getOrCreate((c as { _id: string })._id, c as never);
    return client.channels.size !== before;
  });

  const head = useFields(server, (s) => ({
    name: s.name,
    banner: s.bannerURL,
    rules: (s as unknown as { rulesChannelId?: string }).rulesChannelId,
    canInvite: s.channels.some((c) => !c.isVoice && c.havePermission("InviteOthers")),
    canCreate: s.havePermission("ManageChannel"),
  }));
  const [creating, setCreating] = useState(false);

  const sections = useSolid(
    useCallback(() => {
      if (!server) return "[]";
      return JSON.stringify(
        server.orderedChannels.map((cat) => ({
          id: cat.id,
          title: cat.title,
          channels: cat.channels.filter(Boolean).map((c) => ({ id: c.id, name: c.name, voice: c.isVoice })),
        })),
      );
    }, [server]),
  );

  const rows = useMemo<Row[]>(() => {
    const q = foldSearch(query.trim());
    const out: Row[] = [];
    const parsed = JSON.parse(sections) as { id: string; title: string; channels: { id: string; name: string; voice: boolean }[] }[];
    const push = (id: string, title: string, list: { id: string; name: string }[]) => {
      const visible = q ? list.filter((c) => foldSearch(c.name).includes(q)) : list;
      if (!visible.length) return;
      const open = q ? true : !closedSections.has(`${serverId}:${id}`);
      out.push({ kind: "category", id, title, open });
      if (open) for (const c of visible) out.push({ kind: "channel", id: c.id });
    };
    for (const cat of parsed) {
      if (cat.id === "default") {
        push("default-text", t`Text channels`, cat.channels.filter((c) => !c.voice));
        push("default-voice", t`Voice channels`, cat.channels.filter((c) => c.voice));
      } else {
        push(cat.id, cat.title, cat.channels);
      }
    }
    return out;
  }, [sections, query, serverId, t]);

  // the server is still loading: rows shaped like channels
  if (!head) return <SkeletonRows count={10} avatar={20} lines={1} gap={4} testID="channel-list-loading" />;

  const header = (
    <View>
      <Pressable
        testID="server-header"
        accessibilityRole="button"
        accessibilityLabel={t`Server menu`}
        onPress={onServerMenu}
        style={{ borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}
      >
        {head.banner ? (
          <View style={{ aspectRatio: 16 / 9, justifyContent: "flex-end", padding: 8 }}>
            <Image source={{ uri: head.banner }} style={{ position: "absolute", inset: 0 }} contentFit="cover" cachePolicy="memory-disk" />
            <View style={{ position: "absolute", inset: 0, backgroundColor: palette.overlayShade }} />
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 8 }}>
              <AText autoDir size={15} line={20} weight="semibold" color={palette.onOverlay} numberOfLines={1} style={{ flex: 1, textShadowColor: palette.overlayTextShadow, textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>
                {head.name}
              </AText>
              <Icon name="caret-down" size={18} color={palette.onOverlay} />
            </View>
          </View>
        ) : (
          <View style={{ height: 64, paddingTop: 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "center" }}>
            <AText autoDir size={15} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
              {head.name}
            </AText>
            <View style={{ width: 44, height: 44, marginEnd: -8, alignItems: "center", justifyContent: "center" }}>
              <Icon name="caret-down" size={18} color={palette.iconNeutral} />
            </View>
          </View>
        )}
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          // web: 8 + 36 + 8; the 44 px tap boxes overhang the 36 px drawing by 4
          paddingVertical: 4,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: palette.borderSubtle,
          marginBottom: 4,
        }}
      >
        {/* web ServerPhoneTools: the compact field and the invite tool (the
            member list is in the channel header menu and in Server info) */}
        <SearchField compact value={query} onChange={setQuery} placeholder={t`Search channels`} testID="search-channels" />
        {head.canInvite ? <ToolButton icon="user-plus" label={t`Create invite`} onPress={onInvite} /> : null}
      </View>
      <ServerStats serverId={serverId} />
      <PinnedRows serverId={serverId} />
    </View>
  );

  // a server without a channel you can see (web: ServerHome empty state)
  const empty =
    !query.trim() && !rows.length ? (
      <View testID="server-no-channels" style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: "center", gap: 12 }}>
        <Icon name="chats-circle" size={32} color={palette.muted} />
        <AText size={16} line={22} weight="semibold" color={palette.header} style={{ textAlign: "center" }} accessibilityRole="header">
          {t`This server has no channels yet`}
        </AText>
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
          {head.canCreate ? t`Create a channel so members have a place to talk.` : t`Channels you can see will show up here once they are added.`}
        </AText>
        {head.canCreate ? <Button label={t`Create channel`} icon="plus" onPress={() => setCreating(true)} testID="server-create-first-channel" /> : null}
      </View>
    ) : null;

  return (
    <>
    <FlashList
      ref={list}
      testID="channel-list"
      data={rows}
      refreshControl={pull.control}
      onScroll={pull.onScroll}
      scrollEventThrottle={16}
      keyExtractor={(row) => `${row.kind}-${row.id}`}
      getItemType={(row) => row.kind}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingBottom: 96 }}
      {...keyboardScrollProps}
      renderItem={({ item }) =>
        item.kind === "category" ? (
          <PressableRow
            highlight={palette.navHover}
            accessibilityRole="button"
            accessibilityState={{ expanded: item.open }}
            onPress={() => {
              haptics.selection();
              const key = `${serverId}:${item.id}`;
              if (closedSections.has(key)) closedSections.delete(key);
              else closedSections.add(key);
              setVersion((v) => v + 1);
            }}
            onLongPress={() => setCategory(item.id)}
            delayLongPress={MENU_DELAY}
            accessibilityActions={[{ name: "longpress" }]}
            onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && setCategory(item.id)}
            style={{ minHeight: 44, paddingStart: 16, paddingEnd: 8, flexDirection: "row", alignItems: "center", gap: 2, paddingTop: 4 }}
          >
            {/* the caret is mirrored in RTL (points left), so it turns the other way to point down */}
            <View style={{ transform: [{ rotate: item.open ? (isRTL() ? "-90deg" : "90deg") : "0deg" }] }}>
              <Icon name="caret-right" size={12} color={palette.muted} />
            </View>
            <AText autoDir size={12} line={16} weight="semibold" color={palette.muted} numberOfLines={1}>
              {item.title}
            </AText>
          </PressableRow>
        ) : (
          <ChannelRow id={item.id} rulesId={head.rules} onMenu={setMenuFor} />
        )
      }
    />
    {menuFor ? <ChannelMenu channelId={menuFor} visible onClose={() => setMenuFor(undefined)} /> : null}
    {creating ? <CreateChannelSheet serverId={serverId} onClose={() => setCreating(false)} /> : null}
    {category ? <CategoryMenu serverId={serverId} categoryId={category.startsWith("default-") ? "default" : category} onClose={() => setCategory(undefined)} /> : null}
    </>
  );
}
