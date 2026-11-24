import { useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { Channel, User } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { listTime } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useConversationIds, useFields, useSelfId } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { useNotificationOptions } from "@/notifications/hooks";
import { muteActive } from "@/notifications/levels";
import { foldText } from "@/ui/find/fold";
import { nextUnread } from "@/ui/find/switcher";
import { channelRoute } from "@/ui/forum/channelRoute";
import { FirstScreen, useFirstRun } from "@/ui/home/FirstScreen";

import { Avatar } from "../Avatar";
import { AText } from "../kit/Text";
import { MENU_DELAY } from "../kit/ContextMenu";
import { PressableRow, PressScale } from "../kit/Press";
import { usePullRefresh } from "../kit/PullRefresh";
import { useScrollToTop } from "../kit/scrollToTop";
import { SkeletonRows } from "../kit/Skeleton";
import { closeSwipeRows, type SwipeAction, swipeA11y, SwipeRow } from "../kit/SwipeRow";
import { ChannelMenu } from "./ChannelMenu";
import { CountBadge, HeaderButton, SearchField, ToolButton } from "./parts";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/**
 * Arabic-aware match text (web: arabicFold foldText): case, accents,
 * tashkeel, tatweel, alef and ya forms, ta marbuta, Arabic-Indic digits and
 * invisible marks folded. Kept under this name for the screens that use it.
 */
export const foldSearch = foldText;

function conversationName(c: Channel) {
  return c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : c.name;
}

const OnlineFriend = memo(function OnlineFriend({ user }: { user: User }) {
  const { palette } = useTheme();
  const fields = useFields(user, (u) => ({ name: u.displayName ?? u.username, url: u.avatarURL, presence: u.presence }));
  if (!fields) return null;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={fields.name}
      scale={0.97}
      onPress={async () => {
        const dm = await user.openDM();
        router.push({ pathname: "/channel/[id]", params: { id: dm.id } });
      }}
      style={({ pressed }) => ({
        // 8 px inside the tile: the name never touches the tile's edge
        width: 80,
        alignItems: "center",
        gap: 4,
        paddingTop: 12,
        paddingHorizontal: 8,
        paddingBottom: 8,
        borderRadius: 14,
        backgroundColor: pressed ? palette.navSelected : palette.field,
      })}
    >
      <Avatar url={fields.url} name={fields.name} size={44} presence={fields.presence as never} />
      <AText autoDir size={12} line={16} color={palette.fg2} numberOfLines={1}>
        {fields.name}
      </AText>
    </PressScale>
  );
});

const ConversationRow = memo(function ConversationRow({ id, selfId, onMenu }: { id: string; selfId?: string; onMenu: (id: string, page?: "mute" | "close") => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(id);
  const { store, options, now } = useNotificationOptions();
  const muted = muteActive(options.channel_mutes[id], now);
  const fields = useFields(channel, (c) => {
    const last = c.lastMessage;
    const plain = last?.contentPlain?.trim();
    const text = plain || (last?.attachments?.length ? t`Sent an attachment` : "");
    const user = c.recipient;
    return {
      dm: c.type === "DirectMessage",
      closable: c.type === "DirectMessage" || c.type === "Group",
      name: conversationName(c),
      icon: c.type === "DirectMessage" ? user?.avatarURL : c.iconURL,
      presence: user?.presence,
      status: user?.status?.text,
      members: c.recipientIds?.size ?? 0,
      preview: text ? (last?.authorId === selfId ? t`You: ${text}` : text) : "",
      time: (c.lastMessageAt ?? c.createdAt).getTime(),
      unread: c.unread,
      mentions: c.mentions?.size ?? 0,
    };
  }, [selfId, i18n.locale]);
  if (!fields) return null;
  const presenceWord: Record<string, string> = {
    Online: t`Online`,
    Busy: t`Busy`,
    Focus: t`Focus`,
    Idle: t`Idle`,
  };
  const secondLine =
    fields.preview ||
    (fields.dm
      ? (fields.status ?? presenceWord[fields.presence ?? ""] ?? t`Offline`)
      : fields.members === 1
        ? t`${fields.members} member`
        : t`${fields.members} members`);
  const strong = fields.unread;
  // swipe actions: the same work as the conversation's menu (ChannelMenu)
  const markRead: SwipeAction | undefined =
    fields.unread || fields.mentions > 0
      ? { key: "read", label: t`Mark as read`, icon: "check-circle", color: palette.accent, ink: palette.onAccent, onPress: () => void channel?.ack(), testID: `conversation-swipe-read-${id}` }
      : undefined;
  const closeAction: SwipeAction[] = fields.closable
    ? [
        {
          key: "close",
          label: fields.dm ? t`Close` : t`Leave`,
          icon: fields.dm ? "x-circle" : "sign-out",
          color: palette.dangerFill,
          ink: palette.onAccent,
          onPress: () => onMenu(id, "close"),
          testID: `conversation-swipe-close-${id}`,
        },
      ]
    : [];
  const trailing: SwipeAction[] = [
    ...closeAction,
    muted
      ? { key: "unmute", label: t`Unmute`, icon: "bell", color: palette.tonal, ink: palette.fg, onPress: () => store.setChannelMute(id, null), testID: `conversation-swipe-unmute-${id}` }
      : { key: "mute", label: t`Mute`, icon: "bell-slash", color: palette.tonal, ink: palette.fg, onPress: () => onMenu(id, "mute"), testID: `conversation-swipe-mute-${id}` },
  ];
  const leading = markRead ? [markRead] : [];
  return (
    // keyed by id: a recycled list cell never comes back with its buttons open
    <SwipeRow key={id} start={leading} end={trailing} fullStart={!!markRead}>
    <PressableRow
      testID={`conversation-${id}`}
      accessibilityRole="button"
      accessibilityLabel={fields.name}
      highlight={palette.field}
      onPress={() => router.push({ pathname: "/channel/[id]", params: { id } })}
      // web ChannelContextMenu: a long press lifts the row and opens the conversation's menu
      onLongPress={() => onMenu(id)}
      delayLongPress={MENU_DELAY}
      {...swipeA11y([...leading, ...trailing], [{ name: "longpress" }], (name) => name === "longpress" && onMenu(id))}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 60,
        marginHorizontal: 8,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 14,
      }}
    >
      <Avatar url={fields.icon} name={fields.name} size={44} square={!fields.dm} presence={fields.dm ? (fields.presence as never) : undefined} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AText autoDir size={16} line={22} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flex: 1 }}>
            {fields.name}
          </AText>
          <AText size={12} line={16} color={palette.muted}>
            {listTime(i18n, new Date(fields.time))}
          </AText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20 }}>
          <AText autoDir autoAlign size={14} line={20} color={strong ? palette.fg : palette.muted} numberOfLines={1} style={{ flex: 1 }}>
            {secondLine}
          </AText>
          {fields.unread ? (
            fields.mentions > 0 ? (
              <CountBadge count={fields.mentions} />
            ) : (
              <View accessibilityLabel={t`Unread`} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.mentionBadge }} />
            )
          ) : null}
        </View>
      </View>
    </PressableRow>
    </SwipeRow>
  );
});

/** Friends online now, first twelve */
function useOnlineFriends() {
  const client = useClient();
  const ids = useSolid(
    useCallback(
      () =>
        client.users
          .filter((u) => u.relationship === "Friend" && u.online)
          .slice(0, 12)
          .map((u) => u.id)
          .join(","),
      [client],
    ),
  );
  return useMemo(() => (ids ? ids.split(",").map((id) => client.users.get(id)!).filter(Boolean) : []), [ids, client]);
}

/** The Messages list on the menu side (web: HomeSidebarPhone) */
export function ConversationList({ onAddFriend, onCreateGroup }: { onAddFriend: () => void; onCreateGroup: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const ids = useConversationIds();
  const online = useOnlineFriends();
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<{ id: string; page?: "mute" | "close" }>();
  const openMenu = useCallback((id: string, page?: "mute" | "close") => setMenuFor({ id, page }), []);
  const list = useRef<FlashListRef<string>>(null);
  useScrollToTop("messages", list);
  const ready = useSolid(useCallback(() => client.ready(), [client]));
  const firstRun = useFirstRun();
  // "Next unread channel" (web: Alt+Shift+Down): a conversation or channel with something new
  const unreadIds = useSolid(
    useCallback(() => {
      const parts: string[] = [];
      for (const c of client.channels.values()) {
        const mentions = c.mentions?.size ?? 0;
        if (c.unread || mentions) parts.push(`${c.id}:${c.unread ? 1 : 0}:${mentions}`);
      }
      return parts.join(",");
    }, [client]),
  );
  const openNextUnread = () => {
    const list = unreadIds
      ? unreadIds.split(",").map((part) => {
          const [id, unread, mentions] = part.split(":");
          return { id, unread: unread === "1", mentions: Number(mentions) };
        })
      : [];
    const next = nextUnread(list, undefined);
    const channel = next ? client.channels.get(next.id) : undefined;
    if (channel) router.push(channelRoute({ id: channel.id, isThread: channel.isThread, isForum: channel.isForum }));
  };
  // pull to refresh: fetch the conversation list again (a new group or DM shows up)
  const pull = usePullRefresh(async () => {
    const before = client.channels.size;
    const dms = await client.api.get("/users/dms");
    for (const c of dms) client.channels.getOrCreate(c._id, c);
    return client.channels.size !== before;
  });

  const shown = useMemo(() => {
    const q = foldSearch(query.trim());
    if (!q) return ids;
    return ids.filter((id) => {
      const c = client.channels.get(id);
      return c ? foldSearch(conversationName(c)).includes(q) : false;
    });
  }, [ids, query, client]);

  const header = (
    <View>
      {/* 24 px above the title as before; the 44 px header buttons sit beside it */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 16, paddingStart: 16, paddingEnd: 8, gap: 4 }}>
        <AText size={22} line={29} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Messages`}
        </AText>
        {unreadIds ? <HeaderButton icon="chat-circle-dots" label={t`Next unread channel`} onPress={openNextUnread} testID="conversations-next-unread" /> : null}
        <HeaderButton icon="magnifying-glass" label={t`Go to`} onPress={() => router.push("/find")} testID="conversations-find" />
      </View>
      {/* web: 36 px search and tools, 12/16 padding; each keeps a 44 px tap box */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
        <SearchField compact value={query} onChange={setQuery} placeholder={t`Search conversations`} testID="search-conversations" />
        <ToolButton icon="user-plus" label={t`Add friend`} onPress={onAddFriend} testID="conversations-add-friend" />
        <ToolButton icon="plus" label={t`Create a new group`} onPress={onCreateGroup} primary testID="conversations-new-group" />
      </View>
      {!query && firstRun ? <FirstScreen onAddFriend={onAddFriend} /> : null}
      {!query && online.length > 0 ? (
        <>
          <AText size={13} line={20} weight="semibold" color={palette.muted} style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 16 }}>
            {t`Online now`}
          </AText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            {online.map((user) => (
              <OnlineFriend key={user.id} user={user} />
            ))}
          </ScrollView>
        </>
      ) : null}
      <AText size={13} line={20} weight="semibold" color={palette.muted} style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 16 }}>
        {t`Conversations`}
      </AText>
      {shown.length === 0 && !(firstRun && !query) ? (
        <AText size={14} line={24} color={palette.muted} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          {query
            ? t`No conversation matches your search.`
            : t`Your conversations will appear here. Start a group or find a friend to begin.`}
        </AText>
      ) : null}
    </View>
  );

  return (
    <>
      <FlashList
        ref={list}
        testID="conversation-list"
        data={shown}
        keyExtractor={(id) => id}
        renderItem={({ item }) => <ConversationRow id={item} selfId={selfId} onMenu={openMenu} />}
        ListHeaderComponent={header}
        ListEmptyComponent={!ready ? <SkeletonRows count={8} testID="conversation-list-loading" /> : null}
        contentContainerStyle={{ paddingBottom: 96 }}
        {...keyboardScrollProps}
        refreshControl={pull.control}
        onScroll={pull.onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={closeSwipeRows}
      />
      {menuFor ? <ChannelMenu key={`${menuFor.id}:${menuFor.page ?? "main"}`} channelId={menuFor.id} startPage={menuFor.page} visible onClose={() => setMenuFor(undefined)} /> : null}
    </>
  );
}
