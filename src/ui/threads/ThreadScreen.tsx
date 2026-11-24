import { useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { Message } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatToast } from "@/chat/ChatOverlays";
import { ComposerInfo, type ComposerMode, dismissComposerPanel } from "@/chat/Composer";
import { countNewer } from "@/chat/history";
import { InteractionModalHost, InteractionRow, useInteractionEntries, useInteractions } from "@/chat/interactions";
import { MessageRow } from "@/chat/MessageRow";
import { OutboxRow } from "@/chat/outbox/OutboxRow";
import { type ExtraRow, extraRows } from "@/chat/outbox/rows";
import { visibleEntries } from "@/chat/outbox/rules";
import { useOutbox, useOutboxFlush } from "@/chat/outbox/store";
import { chatKeyboardDismissMode } from "@/chat/keyboardPin";
import { afterSheet, MessageSheet } from "@/chat/MessageSheet";
import { showToast } from "@/chat/overlays";
import { RichComposer } from "@/chat/RichComposer";
import { buildRows, type ChatRow, type MessageMeta } from "@/chat/rows";
import { longDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useHistory } from "@/chat/useHistory";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { CountBadge, ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { ConnectionBanner } from "@/ui/ConnectionBanner";
import { EmojiPicker, entryReaction } from "@/ui/emoji/EmojiPicker";
import { TextButton } from "@/ui/search/parts";
import { Icon } from "@/ui/Icon";
import { ChannelHeaderActions } from "@/ui/threads/ChannelHeaderActions";

import { writeAccess } from "./threadAccess";

/** The quiet line under the messages of an archived, locked or read-only thread (web: ThreadNotice) */
function ThreadNotice({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View testID="thread-notice" accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 12, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
      <Icon name="chat-circle" size={20} color={palette.fg2} />
      <AText size={14} line={20} color={palette.fg2} style={{ flex: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/**
 * A thread or forum post as its own chat screen (web: TextChannel for a
 * thread): the messages, a composer when one may write, and the notices for
 * archived, locked and switched-off threads.
 */
type ListRow = ChatRow | ExtraRow<ReturnType<typeof useInteractionEntries>[number]>;

export function ThreadScreen({ id, jump }: { id: string; jump?: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const channel = useChannel(id);
  const head = useFields(channel, (c) => ({
    name: c.name ?? "",
    parentName: c.parent?.name ?? "",
    parentId: c.parentId,
    serverId: c.serverId || undefined,
    forum: !!c.parent?.isForum,
    archived: !!c.thread?.archived,
    locked: !!c.thread?.locked,
    moderator: c.havePermission("ManageMessages"),
    access: writeAccess(c),
  }));
  // the page around a searched or pinned message (loaded when it is not), older and
  // newer pages on demand, and what the closed gateway missed after a reconnect
  const history = useHistory(channel, jump);
  const { ids, loading, atStart, atEnd, error, loadOlder, loadNewer, present } = history;
  const [mode, setMode] = useState<ComposerMode>(null);
  const [sheet, setSheet] = useState<Message | null>(null);
  const [away, setAway] = useState(false);
  const [seen, setSeen] = useState<string>();
  const [highlight, setHighlight] = useState<string>();
  const list = useRef<FlashListRef<ListRow>>(null);
  const pinned = useRef(true);
  useOutboxFlush();
  useInteractions(client);
  const outbox = useOutbox(id);
  const interactions = useInteractionEntries(id);

  const rows = useMemo(() => {
    const metas: MessageMeta[] = [];
    for (const mid of ids) {
      const m = client.messages.get(mid);
      if (!m) continue;
      metas.push({
        id: m.id,
        authorId: m.authorId,
        createdAt: m.createdAt.getTime(),
        masquerade: m.masquerade ? `${m.masquerade.name}|${m.masquerade.avatar}` : undefined,
        system: !!m.systemMessage,
        reply: !!m.replyIds?.length,
        interaction: !!m.interaction,
      });
    }
    const built: ListRow[] = buildRows(metas, atStart);
    if (!atEnd) return built;
    const last = metas[metas.length - 1];
    return [...built, ...extraRows(visibleEntries(outbox, new Set(ids)), interactions, last ? { authorId: last.authorId, at: last.createdAt } : undefined, selfId)];
  }, [ids, atStart, atEnd, client, outbox, interactions, selfId]);

  // mark as read while the newest messages are on screen
  const lastId = ids[ids.length - 1];
  useEffect(() => {
    if (channel && lastId && !away && atEnd) void channel.ack(lastId).catch(() => {});
  }, [channel, lastId, away, atEnd]);

  // a search result or a pin: the history loads the page around it; scroll there and mark it
  const landed = history.landed;
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    const target = landed;
    if (!target || jumped.current === target) return;
    const index = rows.findIndex((row) => row.kind === "message" && row.id === target);
    if (index < 0) return;
    jumped.current = target;
    requestAnimationFrame(() => list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }));
  }, [landed, rows]);
  const [landedShown, setLandedShown] = useState<string>();
  if (landed && landed !== landedShown) {
    setLandedShown(landed);
    setHighlight(landed);
  }
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(undefined), 2400);
    return () => clearTimeout(timer);
  }, [highlight]);
  const toPresent = useCallback(async () => {
    if (!atEnd) await present();
    pinned.current = true;
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }, [atEnd, present]);
  const unseen = away ? countNewer(ids, seen) : 0;

  const onLongPress = useCallback((m: Message) => setSheet(m), []);
  const onReply = useCallback((m: Message) => setMode({ kind: "reply", message: m, mention: true }), []);
  const [reactTo, setReactTo] = useState<Message | null>(null);

  const canWrite = !!head && head.access === "allowed" && (!head.locked || head.moderator);
  let notice: string | null = null;
  if (head) {
    if (head.locked && !head.moderator) notice = t`This thread is locked. Only moderators can write.`;
    else if (head.access === "switched-off") notice = head.forum ? t`Forums are off in this server. This post can only be read.` : t`Threads are off in this server. This thread can only be read.`;
    else if (head.access === "no-permission") notice = t`You can't write in this thread.`;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      {/* no keyboard-avoiding view: the composer keeps the keyboard's space itself, frame by frame */}
      <View style={{ flex: 1 }}>
        <ScreenHeader back>
          <Pressable
            testID="thread-title"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/channel-details/[id]", params: { id } })}
            style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name={head?.locked ? "lock-simple" : "chat-circle"} size={18} color={palette.iconMuted} />
              <AText autoDir size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }}>
                {head?.name ?? ""}
              </AText>
            </View>
            {head?.parentName ? (
              <AText autoDir size={12} line={16} color={palette.muted} numberOfLines={1}>
                {`${head.forum ? "" : "#"}${head.parentName}`}
              </AText>
            ) : null}
          </Pressable>
          <ChannelHeaderActions channelId={id} />
        </ScreenHeader>
        <ConnectionBanner />

        <View style={{ flex: 1 }}>
          {loading && ids.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : error && ids.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <AText size={14} line={20} color={palette.muted}>
                {t`Couldn't load messages.`}
              </AText>
              <TextButton label={t`Try again`} onPress={() => history.reload()} />
            </View>
          ) : (
            <FlashList
              ref={list}
              testID="thread-message-list"
              data={rows}
              extraData={highlight}
              keyExtractor={(row) => (row.kind === "message" ? row.id : row.kind === "date" || row.kind === "outbox" || row.kind === "interaction" ? row.key : row.kind)}
              getItemType={(row) => (row.kind === "message" ? (row.tail ? "tail" : "head") : row.kind)}
              maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: atEnd ? 0.2 : undefined }}
              onStartReached={loadOlder}
              onStartReachedThreshold={0.5}
              onEndReached={atEnd ? undefined : loadNewer}
              onEndReachedThreshold={0.5}
              onLayout={() => {
                // the keyboard (or the "+" panel) changed the list's height: keep the newest in view
                if (pinned.current && atEnd) list.current?.scrollToEnd({ animated: false });
              }}
              onScrollBeginDrag={dismissComposerPanel}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const gap = contentSize.height - contentOffset.y - layoutMeasurement.height;
                pinned.current = gap < 48;
                const far = gap > 600;
                if (far !== away) {
                  setAway(far);
                  if (far) setSeen(ids[ids.length - 1]);
                }
              }}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={chatKeyboardDismissMode}
              renderItem={({ item }) => {
                if (item.kind === "start") {
                  return (
                    <View style={{ paddingVertical: 24, gap: 8 }}>
                      <Icon name="chat-circle" size={28} color={palette.iconMuted} />
                      <AText size={22} line={29} weight="bold" color={palette.header}>
                        {head?.name ?? ""}
                      </AText>
                    </View>
                  );
                }
                if (item.kind === "date") {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginHorizontal: 16, marginBottom: 8 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: palette.borderSoft }} />
                      <AText size={12} line={16} weight="semibold" color={palette.muted}>
                        {longDate(new Date(item.at), i18n.locale)}
                      </AText>
                      <View style={{ flex: 1, height: 1, backgroundColor: palette.borderSoft }} />
                    </View>
                  );
                }
                if (item.kind === "outbox") return channel ? <OutboxRow entry={item.entry} channel={channel} tail={item.tail} /> : null;
                if (item.kind === "interaction") return <InteractionRow entry={item.entry} serverId={head?.serverId} />;
                if (item.kind !== "message") return null;
                return (
                  <MessageRow
                    id={item.id}
                    tail={item.tail}
                    selfId={selfId}
                    serverId={head?.serverId}
                    onLongPress={onLongPress}
                    onReply={canWrite ? onReply : undefined}
                    onAddReaction={canWrite ? setReactTo : undefined}
                    highlighted={highlight === item.id}
                  />
                );
              }}
            />
          )}
          {away || !atEnd ? (
            <Pressable
              testID="thread-jump-to-present"
              accessibilityRole="button"
              accessibilityLabel={t`Jump to present`}
              onPress={() => void toPresent()}
              style={{
                position: "absolute",
                end: 12,
                bottom: 12,
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: palette.floating,
                borderWidth: 1,
                borderColor: palette.popoverBorder,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: palette.shadow,
                shadowOpacity: 0.45,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              <Icon name="caret-down" size={16} color={palette.fg} />
              {unseen > 0 ? (
                <View style={{ position: "absolute", top: -6, end: -6 }}>
                  <CountBadge count={unseen} ring />
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <ChatToast />
        </View>

        <ComposerInfo channel={channel} onToast={showToast} />
        {head?.archived && !head.locked && head.access === "allowed" ? <ThreadNotice>{t`This thread is archived. A new message reopens it.`}</ThreadNotice> : null}
        {channel && canWrite ? (
          <RichComposer
            key={mode?.kind === "edit" ? `edit-${mode.message.id}` : "compose"}
            channel={channel}
            placeholder={t`Message ${head ? head.name : ""}`}
            mode={mode}
            onClearMode={() => setMode(null)}
            onSent={() => void toPresent()}
          />
        ) : notice ? (
          <ThreadNotice>{notice}</ThreadNotice>
        ) : null}
      </View>

      <MessageSheet
        message={sheet}
        selfId={selfId}
        onClose={() => setSheet(null)}
        onReply={(m) => setMode({ kind: "reply", message: m, mention: true })}
        onEdit={(m) => setMode({ kind: "edit", message: m })}
        onReactMore={(m) => afterSheet(() => setReactTo(m))}
        onToast={showToast}
      />
      <InteractionModalHost channelId={id} />
      <EmojiPicker
        visible={!!reactTo}
        testID="reaction-picker"
        onClose={() => setReactTo(null)}
        onPick={(entry) => {
          const target = reactTo;
          setReactTo(null);
          if (target) void target.react(entryReaction(entry));
        }}
      />
    </SafeAreaView>
  );
}
