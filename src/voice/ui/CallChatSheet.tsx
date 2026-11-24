import { useLingui } from "@lingui/react/macro";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { Message } from "@zrzur/sdk/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { type PanGesture, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { ChatToast } from "@/chat/ChatOverlays";
import { ComposerInfo, type ComposerMode, dismissComposerPanel } from "@/chat/Composer";
import { chatKeyboardDismissMode } from "@/chat/keyboardPin";
import { afterSheet, MessageSheet } from "@/chat/MessageSheet";
import { MessageRow } from "@/chat/MessageRow";
import { OutboxRow } from "@/chat/outbox/OutboxRow";
import { extraRows, type ExtraRow } from "@/chat/outbox/rows";
import { visibleEntries } from "@/chat/outbox/rules";
import { useOutbox, useOutboxFlush } from "@/chat/outbox/store";
import { showToast } from "@/chat/overlays";
import { RichComposer } from "@/chat/RichComposer";
import { longDate } from "@/chat/time";
import { buildRows, type ChatRow, type MessageMeta } from "@/chat/rows";
import { useHistory } from "@/chat/useHistory";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { createVisibleRows, RowIdProvider, useAppActive, VisibleRowsProvider } from "@/media/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { EmojiPicker, entryReaction } from "@/ui/emoji/EmojiPicker";
import { Icon } from "@/ui/Icon";
import { haptics } from "@/ui/kit/haptics";
import { FADE_MS, SHEET_SPRING, useReduceMotion } from "@/ui/kit/motion";
import { PressScale } from "@/ui/kit/Press";

type ListRow = ChatRow | ExtraRow<never>;

/** The sheet's height on a phone (share of the space under the status bar) */
const PHONE_SHARE = 0.86;

/**
 * The conversation over the call (the bar's chat button): a sheet with a
 * grabber and a close X over the call, holding the real message list and
 * composer (+, image, emoji, microphone). Swipe down on its top, tap the
 * dimmed call above it, X or Android Back closes it; the call goes on
 * underneath. On an iPad it is a centred card.
 *
 * Keyboard: the composer keeps the keyboard's space itself (chat/Composer,
 * as on the chat page), so the sheet reaches the screen bottom and adds the
 * home-indicator space only; no KeyboardSafeScreen around it (that would
 * lift it twice).
 */
export function CallChatSheet({ channelId, visible, onClose }: { channelId: string | undefined; visible: boolean; onClose: () => void }) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tablet = width >= 768;
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const panelHeight = Math.round(tablet ? Math.min(height * 0.8, 820) : (height - insets.top) * PHONE_SHARE);
  const closed = panelHeight + 40;
  const y = useSharedValue(closed);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      if (reduce) {
        y.set(0);
        fade.set(withTiming(1, { duration: FADE_MS }));
      } else {
        fade.set(1);
        y.set(withSpring(0, SHEET_SPRING));
      }
      return;
    }
    if (reduce) fade.set(withTiming(0, { duration: FADE_MS }));
    else y.set(withTiming(closed, { duration: 240, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => setMounted(false), (reduce ? FADE_MS : 240) + 40);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);

  // Android Back closes the sheet before anything else
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const dismiss = () => {
    haptics.soft();
    onClose();
  };
  const pan: PanGesture = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      "worklet";
      y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.2);
    },
    onDeactivate: (e) => {
      "worklet";
      if (e.translationY > panelHeight * 0.3 || e.velocityY > 800) {
        y.set(withTiming(closed, { duration: 200, easing: Easing.out(Easing.cubic) }));
        scheduleOnRN(dismiss);
        return;
      }
      y.set(withSpring(0, { ...SHEET_SPRING, velocity: e.velocityY }));
    },
  });

  const scrim = useAnimatedStyle(() => ({ opacity: fade.get() * interpolate(y.get(), [0, closed], [1, 0], Extrapolation.CLAMP) }));
  const panel = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateY: y.get() }] }));

  if (!mounted || !channelId) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.sheetScrim }, scrim]}>
        <Pressable testID="call-chat-scrim" style={{ flex: 1 }} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      </Animated.View>
      <Animated.View
        testID="call-chat-sheet"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[
          {
            position: "absolute",
            bottom: tablet ? Math.max(24, (height - panelHeight) / 2) : 0,
            height: panelHeight,
            start: 0,
            end: 0,
            backgroundColor: palette.frame,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: "hidden",
            paddingBottom: tablet ? 0 : insets.bottom,
          },
          tablet ? { start: Math.max(24, (width - 600) / 2), end: Math.max(24, (width - 600) / 2), borderRadius: 20, borderWidth: 1, borderColor: palette.popoverBorder } : null,
          panel,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View>
            <SheetHead channelId={channelId} onClose={onClose} />
          </View>
        </GestureDetector>
        <CallChat channelId={channelId} />
      </Animated.View>
    </View>
  );
}

/** Grabber, the conversation's name and the close X */
function SheetHead({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(channelId);
  const name = useFields(channel, (c) => (c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? ""))) ?? "";
  return (
    <View style={{ paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: palette.divider }}>
      <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingStart: 16, paddingEnd: 8, minHeight: 48 }}>
        <Icon name="chat-circle" size={18} color={palette.iconMuted} />
        <AText autoDir size={16} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {name}
        </AText>
        <PressScale
          testID="call-chat-close"
          accessibilityRole="button"
          accessibilityLabel={t`Close`}
          onPress={onClose}
          haptic="selection"
          scale={0.94}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 }}
        >
          <Icon name="x" size={20} color={palette.fg} />
        </PressScale>
      </View>
    </View>
  );
}

/**
 * The conversation itself, as on the chat page: the history, messages on
 * their way, long-press for the message sheet, the full composer.
 */
function CallChat({ channelId }: { channelId: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const channel = useChannel(channelId);
  const head = useFields(channel, (c) => ({
    name: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? ""),
    canSend: c.type === "DirectMessage" || c.type === "Group" || c.havePermission("SendMessage"),
    canReact: c.type === "DirectMessage" || c.type === "Group" || c.havePermission("React"),
    serverId: c.serverId,
  }));
  const history = useHistory(channel);
  const { ids, atStart, atEnd, loading, error, loadOlder, loadNewer, present } = history;
  const [mode, setMode] = useState<ComposerMode>(null);
  const [sheet, setSheet] = useState<Message | null>(null);
  const [reactTo, setReactTo] = useState<Message | null>(null);
  const list = useRef<FlashListRef<ListRow>>(null);
  const pinned = useRef(true);
  const [visibleRows] = useState(createVisibleRows);
  const appActive = useAppActive();
  useOutboxFlush();
  const outbox = useOutbox(channelId);

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
    return [...built, ...extraRows(visibleEntries(outbox, new Set(ids)), [], last ? { authorId: last.authorId, at: last.createdAt } : undefined, selfId)];
  }, [ids, atStart, atEnd, client, outbox, selfId]);

  // read while it is on screen, as on the chat page
  const lastId = ids[ids.length - 1];
  useEffect(() => {
    if (channel && lastId && atEnd && appActive) void channel.ack(lastId).catch(() => {});
  }, [channel, lastId, atEnd, appActive]);

  const toPresent = async () => {
    if (!atEnd) await present();
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  };
  const canSend = !!head?.canSend;

  return (
    <View testID="call-chat" style={{ flex: 1 }}>
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
              testID="call-chat-list"
              data={rows}
              onViewableItemsChanged={({ viewableItems }) => visibleRows.set(viewableItems.flatMap((v) => (v.item && v.item.kind === "message" ? [v.item.id] : [])))}
              keyExtractor={(row) => (row.kind === "message" ? row.id : row.kind === "date" || row.kind === "outbox" || row.kind === "interaction" ? row.key : row.kind)}
              getItemType={(row) => (row.kind === "message" ? (row.tail ? "tail" : "head") : row.kind)}
              onLayout={() => {
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
                pinned.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
              }}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={chatKeyboardDismissMode}
              renderItem={({ item }) => {
                if (item.kind === "start") {
                  return (
                    <View style={{ paddingVertical: 24, gap: 8 }}>
                      <AText autoDir size={22} line={29} weight="bold" color={palette.header}>
                        {head?.name ?? ""}
                      </AText>
                      <AText size={14} line={20} color={palette.muted}>
                        {t`This is the start of your conversation.`}
                      </AText>
                    </View>
                  );
                }
                if (item.kind === "unread") return null;
                if (item.kind === "outbox") return channel ? <OutboxRow entry={item.entry} channel={channel} tail={item.tail} /> : null;
                if (item.kind === "interaction") return null;
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
                      onLongPress={setSheet}
                      onReply={canSend ? (m: Message) => setMode({ kind: "reply", message: m, mention: true }) : undefined}
                      onAddReaction={head?.canReact ? setReactTo : undefined}
                    />
                  </RowIdProvider>
                );
              }}
            />
          )}
          <ChatToast />
        </View>
      </VisibleRowsProvider>
      <ComposerInfo channel={channel} onToast={showToast} />
      {channel ? (
        <RichComposer
          key={mode?.kind === "edit" ? `edit-${mode.message.id}` : `compose-${channelId}`}
          channel={channel}
          placeholder={t`Message ${head ? head.name : ""}`}
          mode={mode}
          onClearMode={() => setMode(null)}
          onToggleMention={() => setMode((m) => (m?.kind === "reply" ? { ...m, mention: !m.mention } : m))}
          onSent={() => {
            pinned.current = true;
            void toPresent();
          }}
        />
      ) : null}
      <MessageSheet
        message={sheet}
        selfId={selfId}
        onClose={() => setSheet(null)}
        onReply={(m) => canSend && setMode({ kind: "reply", message: m, mention: true })}
        onEdit={(m) => setMode({ kind: "edit", message: m })}
        onReactMore={(m) => afterSheet(() => setReactTo(m))}
        onToast={showToast}
      />
      <EmojiPicker
        visible={!!reactTo}
        testID="call-chat-reaction-picker"
        onClose={() => setReactTo(null)}
        onPick={(entry) => {
          const target = reactTo;
          setReactTo(null);
          if (target) void target.react(entryReaction(entry));
        }}
      />
    </View>
  );
}
