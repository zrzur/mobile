import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { Message } from "@zrzur/sdk/solid";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatToast } from "@/chat/ChatOverlays";
import { ComposerInfo, type ComposerMode, dismissComposerPanel } from "@/chat/Composer";
import { countNewer } from "@/chat/history";
import { InteractionModalHost, InteractionRow, useInteractionEntries, useInteractions } from "@/chat/interactions";
import { chatKeyboardDismissMode } from "@/chat/keyboardPin";
import { MessageRow } from "@/chat/MessageRow";
import { OutboxRow } from "@/chat/outbox/OutboxRow";
import { extraRows, type ExtraRow } from "@/chat/outbox/rows";
import { visibleEntries } from "@/chat/outbox/rules";
import { useOutbox, useOutboxFlush } from "@/chat/outbox/store";
import { afterSheet, MessageSheet } from "@/chat/MessageSheet";
import { showToast } from "@/chat/overlays";
import { RemindSheet } from "@/chat/RemindSheet";
import { RichComposer } from "@/chat/RichComposer";
import { buildRows, type ChatRow, type MessageMeta } from "@/chat/rows";
import { BULK_DELETE_MAX, pickAll, splitByAge, toggleSelected, ulidTime } from "@/chat/selection";
import { longDate, messageTime } from "@/chat/time";
import { useHistory } from "@/chat/useHistory";
import { useClient } from "@/client/ClientProvider";
import { createVisibleRows, RowIdProvider, useAppActive, VisibleRowsProvider } from "@/media/hooks";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { CountBadge, HeaderButton, ScreenHeader } from "@/ui/app/parts";
import { ChannelMenu } from "@/ui/app/ChannelMenu";
import { channelIcon } from "@/ui/app/ServerPanel";
import { AText } from "@/ui/auth/parts";
import { presenceColour } from "@/ui/Avatar";
import { EmojiPicker, entryReaction } from "@/ui/emoji/EmojiPicker";
import { ConnectionBanner } from "@/ui/ConnectionBanner";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";
import { AgeGate } from "@/ui/onboarding/AgeGate";
import { RulesGate, useMustAcceptRules } from "@/ui/onboarding/RulesGate";
import { ConfirmDialog } from "@/ui/settings/parts";
import { ChannelHeaderActions } from "@/ui/threads/ChannelHeaderActions";
import { TicketBar } from "@/ui/server/tickets/TicketBar";
import { OfficialBanner } from "@/ui/threads/OfficialBanner";
import { startCall } from "@/voice";

/** "New" divider where the reader left off (web: MessageDivider unread) */
function UnreadDivider() {
  const { palette } = useTheme();
  return (
    <View testID="unread-divider" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginHorizontal: 16, marginBottom: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: palette.accent }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {/* web: FlockDots, three birds in a shallow V */}
        <View aria-hidden style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 6 }}>
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: palette.accentText }} />
          <View style={{ width: 3, height: 3, borderRadius: 2, marginBottom: 3, backgroundColor: palette.accentText }} />
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: palette.accentText }} />
        </View>
        <AText size={12} line={16} weight="semibold" color={palette.accentText}>
          <Trans>New</Trans>
        </AText>
      </View>
    </View>
  );
}

/** The strip under the header that leads to the first unread message (web: bars/NewMessages) */
function NewMessagesBar({ lastId, onJump, onDismiss }: { lastId: string; onJump: () => void; onDismiss: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const at = ulidTime(lastId);
  return (
    <View testID="new-messages-bar" style={{ flexDirection: "row", alignItems: "stretch", backgroundColor: palette.accent }}>
      <Pressable
        testID="new-messages-jump"
        accessibilityRole="button"
        onPress={onJump}
        style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingStart: 12, paddingEnd: 4, opacity: pressed ? 0.85 : 1 })}
      >
        <AText size={13} line={18} weight="semibold" color={palette.onAccent} numberOfLines={1} style={{ flex: 1 }}>
          {Number.isFinite(at) ? t`New messages since ${messageTime(i18n, new Date(at))}` : t`New`}
        </AText>
        <AText size={13} line={18} weight="semibold" color={palette.onAccent} numberOfLines={1}>
          {t`Jump to the beginning`}
        </AText>
      </Pressable>
      <Pressable testID="new-messages-dismiss" accessibilityRole="button" accessibilityLabel={t`Dismiss`} onPress={onDismiss} style={{ minWidth: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="x" size={16} color={palette.onAccent} />
      </Pressable>
    </View>
  );
}

/** Selection mode bar in place of the message box (web: MessageSelectionBar) */
function SelectionBar({ count, full, onAll, onCancel, onDelete }: { count: number; full: boolean; onAll: () => void; onCancel: () => void; onDelete: () => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View testID="selection-bar" style={{ margin: 12, marginTop: 0, padding: 8, borderRadius: 14, backgroundColor: palette.field, gap: 4 }}>
      {/* count on its own line; long words (de, ru) wrap the buttons instead of pushing Delete off the screen */}
      <AText size={14} line={20} weight="semibold" color={palette.fg} style={{ paddingStart: 4, paddingTop: 4 }} accessibilityLiveRegion="polite">
        <Plural value={count} one="# selected" other="# selected" />
      </AText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
        <Button testID="selection-all" variant="ghost" label={t`Select all`} onPress={onAll} />
        <Button testID="selection-cancel" variant="ghost" label={t`Cancel`} onPress={onCancel} />
        <Button testID="selection-delete" variant="danger" label={t`Delete`} onPress={onDelete} disabled={count === 0} />
      </View>
      {full ? (
        <AText size={12} line={16} color={palette.muted} style={{ paddingStart: 4 }}>
          <Trans>Up to {BULK_DELETE_MAX} messages at a time.</Trans>
        </AText>
      ) : null}
    </View>
  );
}

type ListRow = ChatRow | ExtraRow<ReturnType<typeof useInteractionEntries>[number]>;

/** A channel or conversation (web: TextChannel on a phone) */
export default function ChannelScreen() {
  // `message` is the app's jump parameter; `jump` is accepted too (older links)
  const { id, message, jump: jumpParam } = useLocalSearchParams<{ id: string; message?: string; jump?: string }>();
  const linked = message || jumpParam || undefined;
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const channel = useChannel(id);
  const head = useFields(channel, (c) => ({
    type: c.type,
    name: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : c.type === "SavedMessages" ? "" : c.name,
    icon: channelIcon(c),
    presence: c.recipient?.presence,
    canSend: c.type === "SavedMessages" || c.type === "DirectMessage" || c.type === "Group" || c.havePermission("SendMessage"),
    canManage: c.type === "SavedMessages" || c.havePermission("ManageMessages"),
    canReact: c.type === "SavedMessages" || c.type === "DirectMessage" || c.type === "Group" || c.havePermission("React"),
    serverId: c.serverId,
    official: c.type === "DirectMessage" && !!c.recipient?.official,
  }));
  const history = useHistory(channel, linked);
  const { ids, atStart, atEnd, loading, error, loadOlder, loadNewer, jumpTo, present } = history;
  const [mode, setMode] = useState<ComposerMode>(null);
  const [sheet, setSheet] = useState<Message | null>(null);
  const [reactTo, setReactTo] = useState<Message | null>(null);
  const [remind, setRemind] = useState<Message | null>(null);
  const [away, setAway] = useState(false);
  const [seen, setSeen] = useState<string>();
  const [highlight, setHighlight] = useState<string>();
  const [selection, setSelection] = useState<{ ids: Set<string>; full: boolean } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<number | null>(null);
  const [bell, setBell] = useState(false);
  const list = useRef<FlashListRef<ListRow>>(null);
  // the reader is at the very bottom: the list stays there while the keyboard moves it
  const pinned = useRef(true);
  const scrollTarget = useRef<string | undefined>(undefined);
  // which message rows are on screen: media in rows that left it pauses
  const [visibleRows] = useState(createVisibleRows);
  const appActive = useAppActive();
  useOutboxFlush();
  useInteractions(client);
  const outbox = useOutbox(id);
  const interactions = useInteractionEntries(id);

  // where the reader left off: read once, when the unread state is known
  const unreadNow = useSolid(
    useCallback(() => {
      if (!client.channelUnreads.loaded) return null;
      const c = client.channels.get(id);
      return c?.unread ? (client.channelUnreads.get(id)?.lastMessageId ?? "") : "";
    }, [client, id]),
  );
  const [lastRead, setLastRead] = useState<{ id?: string; known: boolean }>({ known: false });
  if (!lastRead.known && unreadNow !== null) setLastRead({ id: unreadNow || undefined, known: true });

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
    const built: ListRow[] = buildRows(metas, atStart, lastRead.id && ids.length && ids[ids.length - 1] > lastRead.id ? lastRead.id : undefined);
    if (!atEnd) return built;
    // messages on their way and the bots' private answers come after the newest
    const last = metas[metas.length - 1];
    const pending = visibleEntries(outbox, new Set(ids));
    return [...built, ...extraRows(pending, interactions, last ? { authorId: last.authorId, at: last.createdAt } : undefined, selfId)];
  }, [ids, atStart, atEnd, client, lastRead.id, outbox, interactions, selfId]);

  // mark as read while the newest messages are on screen
  const lastId = ids[ids.length - 1];
  // only while the app is in front: a locked screen or the app switcher keeps the socket open, but nobody reads
  useEffect(() => {
    if (channel && lastId && !away && atEnd && appActive) void channel.ack(lastId).catch(() => {});
  }, [channel, lastId, away, atEnd, appActive]);

  // land on the message a link or jump asked for, then let the mark fade
  const landed = history.landed;
  useEffect(() => {
    if (landed) scrollTarget.current = landed;
  }, [landed]);
  useEffect(() => {
    const target = scrollTarget.current;
    if (!target) return;
    const index = rows.findIndex((r) => r.kind === "message" && r.id === target);
    if (index < 0) return;
    scrollTarget.current = undefined;
    requestAnimationFrame(() => list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: false }));
  }, [rows]);
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

  const jump = useCallback(
    async (target: string) => {
      const landing = await jumpTo(target);
      if (!landing) return;
      scrollTarget.current = landing;
      setHighlight(landing);
      // already loaded: the rows don't change, so scroll now
      const index = rows.findIndex((r) => r.kind === "message" && r.id === landing);
      if (index >= 0) {
        scrollTarget.current = undefined;
        list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true });
      }
    },
    [jumpTo, rows],
  );

  const toPresent = useCallback(async () => {
    if (!atEnd) await present();
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }, [atEnd, present]);

  const canSend = !!head?.canSend;
  const canReact = !!head?.canReact;
  const mustAcceptRules = useMustAcceptRules(head?.serverId || undefined);
  const callable = head?.type === "DirectMessage" || head?.type === "Group";
  // web ChannelHeader: under 360 px the video call moves into the More sheet, so the name keeps its room
  const narrow = useWindowDimensions().width < 360;
  const onLongPress = useCallback((m: Message) => setSheet(m), []);
  const onReply = useCallback((m: Message) => setMode({ kind: "reply", message: m, mention: true }), []);
  const onSelect = useCallback((mid: string) => setSelection((s) => (s ? toggleSelected(s.ids, mid) : s)), []);

  const title = head?.type === "SavedMessages" ? t`Saved notes` : (head?.name ?? "");
  const placeholder = head?.type === "SavedMessages" ? t`Save to your notes` : t`Message ${head ? head.name : ""}`;
  const unseen = away ? countNewer(ids, seen) : 0;
  const selecting = !!selection;

  const extraData = useMemo(() => ({ highlight, selection, selecting }), [highlight, selection, selecting]);

  const bulk = selection && confirmBulk ? splitByAge([...selection.ids], confirmBulk) : { deletable: [] as string[], tooOld: [] as string[] };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
        {/* no keyboard-avoiding view: the composer keeps the keyboard's space itself, frame by frame */}
        <View style={{ flex: 1 }}>
          <ScreenHeader back>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/channel-details/[id]", params: { id } })}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
            >
              {head && head.type === "TextChannel" ? <Icon name={head.icon} size={18} color={palette.iconMuted} /> : null}
              <AText autoDir size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }} testID="chat-title">
                {title}
              </AText>
              {head?.type === "DirectMessage" ? (
                // web: the presence mark after the name (a ring while offline)
                <View
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: presenceColour(palette, head.presence ?? "Invisible"),
                    backgroundColor: head.presence && head.presence !== "Invisible" ? presenceColour(palette, head.presence) : "transparent",
                  }}
                />
              ) : null}
            </Pressable>
            {callable && channel ? (
              <>
                <HeaderButton testID="header-call" icon="phone" label={t`Start a call`} onPress={() => startCall(channel)} />
                {narrow ? null : <HeaderButton testID="header-video-call" icon="video-camera" label={t`Start a video call`} onPress={() => startCall(channel, true)} />}
              </>
            ) : null}
            <ChannelHeaderActions
              channelId={id}
              onNotifications={head && head.type !== "SavedMessages" ? () => afterSheet(() => setBell(true)) : undefined}
              videoCall={callable && channel && narrow ? () => afterSheet(() => startCall(channel, true)) : undefined}
            />
          </ScreenHeader>
          <TicketBar channelId={id} />
          <ConnectionBanner />
          <AgeGate channelId={id}>
          {lastRead.id && !selecting ? (
            <NewMessagesBar lastId={lastRead.id} onJump={() => void jump(lastRead.id!)} onDismiss={() => setLastRead({ known: true })} />
          ) : null}

          <VisibleRowsProvider rows={visibleRows}>
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
                <Pressable accessibilityRole="button" onPress={() => void history.reload()} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
                  <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                    {t`Try again`}
                  </AText>
                </Pressable>
              </View>
            ) : (
              <FlashList
                ref={list}
                testID="message-list"
                data={rows}
                extraData={extraData}
                onViewableItemsChanged={({ viewableItems }) =>
                  visibleRows.set(viewableItems.flatMap((v) => (v.item && v.item.kind === "message" ? [v.item.id] : [])))
                }
                keyExtractor={(row) => (row.kind === "message" ? row.id : row.kind === "date" || row.kind === "outbox" || row.kind === "interaction" ? row.key : row.kind)}
                getItemType={(row) => (row.kind === "message" ? (row.tail ? "tail" : "head") : row.kind)}
                onLayout={() => {
                  // the keyboard (or the "+" panel) changed the list's height: keep the newest in view
                  if (pinned.current && atEnd) list.current?.scrollToEnd({ animated: false });
                }}
                onScrollBeginDrag={dismissComposerPanel}
                maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: atEnd ? 0.2 : undefined }}
                onStartReached={loadOlder}
                onStartReachedThreshold={0.5}
                onEndReached={atEnd ? undefined : loadNewer}
                onEndReachedThreshold={0.5}
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
                        <AText size={22} line={29} weight="bold" color={palette.header}>
                          {title}
                        </AText>
                        <AText size={14} line={20} color={palette.muted}>
                          {head?.type === "SavedMessages" ? t`This is the start of your notes.` : t`This is the start of your conversation.`}
                        </AText>
                      </View>
                    );
                  }
                  if (item.kind === "unread") return <UnreadDivider />;
                  if (item.kind === "outbox") return channel ? <OutboxRow entry={item.entry} channel={channel} tail={item.tail} /> : null;
                  if (item.kind === "interaction") return <InteractionRow entry={item.entry} serverId={head?.serverId || undefined} />;
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
                  return (
                    <RowIdProvider id={item.id}>
                    <MessageRow
                      id={item.id}
                      tail={item.tail}
                      selfId={selfId}
                      serverId={head?.serverId}
                      onLongPress={onLongPress}
                      onReply={canSend ? onReply : undefined}
                      onJump={jump}
                      highlighted={highlight === item.id}
                      selecting={selecting}
                      selected={selection?.ids.has(item.id)}
                      onSelect={onSelect}
                      onAddReaction={canReact ? setReactTo : undefined}
                    />
                    </RowIdProvider>
                  );
                }}
              />
            )}
            {away || !atEnd ? (
              <Pressable
                testID="jump-to-present"
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
          </VisibleRowsProvider>

          {selection ? (
            <SelectionBar
              count={selection.ids.size}
              full={selection.full}
              onAll={() => setSelection(pickAll(ids, Date.now()))}
              onCancel={() => setSelection(null)}
              onDelete={() => setConfirmBulk(Date.now())}
            />
          ) : (
            <>
              {head?.official ? null : <ComposerInfo channel={channel} onToast={showToast} />}
              {channel && head?.official ? (
                <OfficialBanner channel={channel} />
              ) : channel && head?.serverId && mustAcceptRules ? (
                <RulesGate serverId={head.serverId} />
              ) : channel ? (
                <RichComposer
                  key={mode?.kind === "edit" ? `edit-${mode.message.id}` : `compose-${id}`}
                  channel={channel}
                  placeholder={placeholder}
                  mode={mode}
                  onClearMode={() => setMode(null)}
                  onToggleMention={() => setMode((m) => (m?.kind === "reply" ? { ...m, mention: !m.mention } : m))}
                  onSent={() => {
                    setLastRead({ known: true });
                    pinned.current = true;
                    void toPresent();
                  }}
                />
              ) : null}
            </>
          )}
          </AgeGate>
        </View>

        <MessageSheet
          message={sheet}
          selfId={selfId}
          onClose={() => setSheet(null)}
          onReply={(m) => canSend && setMode({ kind: "reply", message: m, mention: true })}
          onEdit={(m) => setMode({ kind: "edit", message: m })}
          onReactMore={(m) => afterSheet(() => setReactTo(m))}
          onForward={(m) => router.push({ pathname: "/forward/[messageId]", params: { messageId: m.id, channel: m.channelId } })}
          onRemind={(m) => afterSheet(() => setRemind(m))}
          onMarkUnread={(m) => {
            m.ack(true, false, true);
            setLastRead({ id: m.id, known: true });
          }}
          onSelect={(m) => setSelection({ ids: new Set([m.id]), full: false })}
          onToast={showToast}
        />
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
        {remind ? <RemindSheet message={remind} onClose={() => setRemind(null)} onToast={showToast} /> : null}
        {confirmBulk && selection && channel ? (
          <ConfirmDialog
            visible
            title={t`Delete selected messages`}
            confirm={t`Delete`}
            disabled={bulk.deletable.length === 0}
            onClose={() => setConfirmBulk(null)}
            onConfirm={async () => {
              await channel.deleteMessages(bulk.deletable);
              setSelection(null);
            }}
          >
            <AText size={15} line={22} color={palette.fg2}>
              <Plural
                value={bulk.deletable.length}
                one="# message will be deleted for everyone. This cannot be undone."
                other="# messages will be deleted for everyone. This cannot be undone."
              />
            </AText>
            {bulk.tooOld.length ? (
              <AText size={14} line={20} color={palette.muted}>
                <Plural
                  value={bulk.tooOld.length}
                  one="# message is older than 7 days and stays; delete it on its own."
                  other="# messages are older than 7 days and stay; delete them one by one."
                />
              </AText>
            ) : null}
          </ConfirmDialog>
        ) : null}
        {bell ? <ChannelMenu channelId={id} visible startPage="level" onClose={() => setBell(false)} /> : null}
        <InteractionModalHost channelId={id} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
