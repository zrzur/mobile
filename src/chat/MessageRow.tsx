import { Trans, useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useState } from "react";
import { I18nManager, Pressable, Text, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { openUserMenu, useOpenProfile } from "@/ui/profile/store";
import { ThreadChip } from "@/ui/threads/ThreadChip";
import type { MessageViewerItem } from "@/ui/viewer/AttachmentViewer";
import { AudioAttachment } from "@/ui/viewer/MediaPlayers";
import { MENU_DELAY } from "@/ui/kit/ContextMenu";
import { haptics } from "@/ui/kit/haptics";
import { useReduceMotion } from "@/ui/kit/motion";
import { PressableRow } from "@/ui/kit/Press";
import { BACK_EDGE } from "@/ui/kit/swipeMath";

import { emojiUrl, MessageContent } from "./MessageContent";
import { openLink, openViewer, type ViewerItem } from "./overlays";
import { hidesContent, isAudioAttachment, MessageExtras, pollSummary } from "./rich";
import { MessageBlocks } from "./slots";
import { PULL_ARMED, PULL_START, pullDistance, rowOffset, SCROLL_SLOP } from "./swipe";
import { WhoReactedSheet } from "./reactions/WhoReactedSheet";
import { SystemLine } from "./SystemLine";
import { isolate } from "./inlineRun";
import { placedAttachments } from "./interactions/logic";
import { useInteractionState } from "./interactions/store";
import { fontFamily } from "@/theme/fonts";
import { ForwardedFrame } from "./forwarded/ForwardedFrame";
import { forwardOrigin } from "./forwarded/origin";
import { clearPressedFile, markPressedFile } from "@/media/pressedFile";
import { VideoPoster } from "@/media/poster";
import { messageTime } from "./time";
import { openExternal } from "@/ui/kit/openLink";

type Attachment = { id: string; url?: string; name?: string; kind: ViewerItem["kind"]; width?: number; height?: number; size?: string };

/** fg at a share of alpha (web: color-mix(in srgb, var(--z-fg-primary) N%, transparent)) */
function fgMix(fg: string, share: number) {
  return fg.length === 7 ? `${fg}${Math.round(share * 255).toString(16).padStart(2, "0")}` : fg;
}

/** The finger gets 44 px around a 28 px chip (web: an unseen ::before area) */
const CHIP_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

/**
 * Reactions (web: elements/Reactions): equal 28 px chips, 18 px emoji box,
 * 13/600 tabular count; yours framed in the accent. The add chip is always
 * shown on touch screens.
 */
function Reactions({ message, selfId, serverId, onAdd }: { message: Message; selfId?: string; serverId?: string; onAdd?: (message: Message) => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const client = useClient();
  const cdn = client.configuration?.features?.autumn?.url;
  const list = useFields(message, (m) =>
    [...m.reactions.entries()].filter(([, users]) => users.size > 0).map(([emoji, users]) => ({ emoji, count: users.size, mine: !!selfId && users.has(selfId) })),
  );
  const [who, setWho] = useState<string | null>(null);
  if (!list?.length) return null;
  const rest = fgMix(palette.fg, 0.07);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
      {list.map((r) => {
        const custom = /^[0-9A-Z]{26}$/.test(r.emoji);
        return (
          <Pressable
            key={r.emoji}
            testID={`reaction-${r.emoji}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.count}`}
            accessibilityState={{ selected: r.mine }}
            aria-pressed={r.mine}
            hitSlop={CHIP_SLOP}
            // hold: who reacted (web: the tooltip on hover)
            onLongPress={() => {
              haptics.medium();
              setWho(r.emoji);
            }}
            delayLongPress={MENU_DELAY}
            onPress={() => {
              // add: a tick; remove: a light tap
              if (r.mine) {
                haptics.light();
                void message.unreact(r.emoji);
              } else {
                haptics.selection();
                void message.react(r.emoji);
              }
            }}
            style={({ pressed }) => ({
              height: 28,
              borderRadius: 8,
              paddingStart: 8,
              paddingEnd: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: r.mine ? palette.accent : "transparent",
              backgroundColor: pressed ? fgMix(palette.fg, 0.12) : r.mine ? fgMix(palette.fg, 0.1) : rest,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center", overflow: "visible" }}>
              {custom ? (
                <Image source={{ uri: emojiUrl(cdn, r.emoji) }} style={{ width: 18, height: 18 }} contentFit="contain" cachePolicy="memory-disk" />
              ) : (
                <Text style={{ fontSize: 16, lineHeight: 18 }} allowFontScaling={false}>
                  {r.emoji}
                </Text>
              )}
            </View>
            <AText size={13} line={18} weight="semibold" color={r.mine ? palette.accentText : palette.fg2} style={{ fontVariant: ["tabular-nums"], minWidth: 8, textAlign: "center" }}>
              {String(r.count)}
            </AText>
          </Pressable>
        );
      })}
      {onAdd ? (
        <Pressable
          testID="reaction-add"
          accessibilityRole="button"
          accessibilityLabel={t`Add reaction`}
          hitSlop={CHIP_SLOP}
          onPress={() => onAdd(message)}
          style={({ pressed }) => ({
            width: 36,
            height: 28,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: pressed ? palette.borderStrong : "transparent",
            backgroundColor: pressed ? fgMix(palette.fg, 0.12) : rest,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Icon name="smiley" size={18} color={palette.iconMuted} />
          <AText size={11} line={12} weight="bold" color={palette.iconMuted} style={{ position: "absolute", top: 0, end: 4 }} accessibilityElementsHidden>
            +
          </AText>
        </Pressable>
      ) : null}
      {who !== null ? <WhoReactedSheet message={message} emoji={who} selfId={selfId} serverId={serverId} onClose={() => setWho(null)} /> : null}
    </View>
  );
}

/** A picture inside an embed, full screen */
function openImage(image: { url: string; width?: number; height?: number }) {
  openViewer([{ id: image.url, url: image.url, kind: "image", width: image.width, height: image.height }], 0);
}

/** The message travels with each item: the viewer's Report attachment needs it */
type Source = { messageId: string; authorId?: string; serverId?: string };

function viewerItems(files: Attachment[], source: Source): MessageViewerItem[] {
  return files.filter((f) => f.url).map((f) => ({ id: f.id, url: f.url!, name: f.name, kind: f.kind, width: f.width, height: f.height, size: f.size, ...source }));
}

function Attachments({ files, source, onHold }: { files: Attachment[]; source: Source; onHold?: (fileId: string) => void }) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const max = Math.min(420, width - 12 * 2 - 48 - 8);
  const open = (id: string) => {
    const items = viewerItems(files, source).filter((f) => f.kind === "image" || f.kind === "video");
    openViewer(items, Math.max(0, items.findIndex((f) => f.id === id)));
  };
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      {files.map((f) => {
        if ((f.kind === "image" || f.kind === "video") && f.url) {
          const w = f.width ?? max;
          const h = f.height ?? (f.kind === "video" ? Math.round(max * 0.5625) : max);
          const scale = Math.min(1, max / w, 320 / h);
          return (
            <Pressable key={f.id} testID={`attachment-${f.id}`} accessibilityRole="imagebutton" accessibilityLabel={f.name} onPress={() => open(f.id)} onLongPress={onHold ? () => onHold(f.id) : undefined} delayLongPress={MENU_DELAY}>
              {f.kind === "image" ? (
                <Image
                  source={{ uri: f.url }}
                  style={{ width: Math.round(w * scale), height: Math.round(h * scale), borderRadius: 14, backgroundColor: palette.field }}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  recyclingKey={f.id}
                />
              ) : (
                <VideoPoster uri={f.url} width={Math.round(w * scale)} height={Math.round(h * scale)} />
              )}
            </Pressable>
          );
        }
        if (f.kind === "audio" && f.url) {
          return (
            <View key={f.id} style={{ maxWidth: max }}>
              <AudioAttachment uri={f.url} name={f.name} size={f.size} />
            </View>
          );
        }
        return (
          <Pressable
            key={f.id}
            testID={`attachment-${f.id}`}
            accessibilityRole="link"
            onPress={() => f.url && void openExternal(f.url)}
            onLongPress={onHold ? () => onHold(f.id) : undefined}
            delayLongPress={MENU_DELAY}
            accessibilityLabel={f.name}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: palette.borderSubtle,
              backgroundColor: pressed ? palette.navSelected : palette.field,
              width: max,
            })}
          >
            <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="file" size={24} color={palette.iconNeutral} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AText autoDir size={14} line={18} weight="medium" color={palette.fg} numberOfLines={1}>
                {f.name ?? f.id}
              </AText>
              {f.size ? (
                <AText size={12} line={16} color={palette.muted}>
                  {f.size}
                </AText>
              ) : null}
            </View>
            <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="download-simple" size={20} color={palette.iconMuted} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "<user> used /command" above a bot's answer (web: InteractionHeader): the
 * same elbow as a reply, the person's 16 px picture and name (tap: profile,
 * hold: their menu), then "used" and the command in the link colour. User
 * and message commands (the Apps menu) are shown without a slash.
 */
function InteractionHeader({ userId, name, botId, serverId, selecting }: { userId: string; name: string; botId?: string; serverId?: string; selecting?: boolean }) {
  const { i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const openProfile = useOpenProfile();
  const user = useSolid(useCallback(() => client.users.get(userId), [client, userId]));
  const who = useFields(user, (u) => ({
    name: (serverId ? client.serverMembers.getByKey({ server: serverId, user: userId })?.nickname : undefined) ?? u.displayName ?? u.username,
    avatar: (serverId ? client.serverMembers.getByKey({ server: serverId, user: userId })?.avatarURL : undefined) ?? u.avatarURL,
  }), [serverId]);
  useEffect(() => {
    if (!user) void client.users.fetch(userId).catch(() => undefined);
  }, [client, user, userId]);
  const kind = useInteractionState((s) => (serverId ? s.commands[serverId]?.commands.find((c) => c.application_id === botId && c.name === name)?.type : undefined));
  const command = kind && kind !== "ChatInput" ? name : `/${name}`;
  const shown = who?.name ?? "…";
  return (
    <View testID="interaction-header" style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20, marginStart: 29, overflow: "hidden" }}>
      <View style={{ width: 22, height: 10, borderStartWidth: 2, borderTopWidth: 2, borderColor: palette.borderStrong, borderTopStartRadius: 4, marginTop: 8, marginEnd: 2 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown}
        disabled={selecting}
        onPress={() => openProfile(userId, serverId)}
        onLongPress={() => openUserMenu(userId, serverId)}
        delayLongPress={300}
        hitSlop={{ top: 12, bottom: 12 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}
      >
        <Avatar url={who?.avatar} name={shown} size={16} />
        <AText autoDir size={13} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
          {shown}
        </AText>
      </Pressable>
      <AText size={13} line={20} color={palette.muted} numberOfLines={1} style={{ flexShrink: 0 }}>
        <Trans>
          used <Text style={{ color: palette.link, fontFamily: fontFamily(i18n.locale, "medium"), writingDirection: "ltr" }}>{isolate(command)}</Text>
        </Trans>
      </AText>
    </View>
  );
}

function ReplyPreview({ id, onJump }: { id: string; onJump?: (id: string) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const reply = useSolid(useCallback(() => client.messages.get(id), [client, id]));
  const fields = useFields(reply, (m) => ({
    // the SDK name: masquerade, then the webhook's own name (a webhook has no author), nickname, display name, username
    name: m.username ?? "",
    avatar: m.avatarURL,
    text: m.contentPlain?.trim() || (m.poll ? pollSummary(m.poll).split(/\r?\n/)[0] : "") || (m.attachments?.length ? (m.attachments.length > 1 ? "files" : "file") : ""),
  }));
  return (
    <Pressable
      testID={`reply-jump-${id}`}
      accessibilityRole="button"
      onPress={onJump ? () => onJump(id) : undefined}
      hitSlop={{ top: 8, bottom: 8 }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 20, marginStart: 29 }}
    >
      <View style={{ width: 24, height: 10, borderStartWidth: 2, borderTopWidth: 2, borderColor: palette.borderStrong, borderTopStartRadius: 6, marginTop: 8 }} />
      {fields ? (
        <>
          <Avatar url={fields.avatar} name={fields.name} size={14} />
          <AText autoDir size={13} line={20} weight="semibold" color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
            {fields.name}
          </AText>
          <AText autoDir size={13} line={20} color={palette.fg2} numberOfLines={1} style={{ flex: 1 }}>
            {fields.text === "file" ? t`Sent an attachment` : fields.text === "files" ? t`Sent multiple attachments` : fields.text}
          </AText>
        </>
      ) : (
        <AText size={13} line={20} color={palette.muted} numberOfLines={1} style={{ flex: 1 }}>
          {t`Message not loaded, click to jump`}
        </AText>
      )}
    </Pressable>
  );
}

export type MessageRowProps = {
  id: string;
  tail: boolean;
  selfId?: string;
  serverId?: string;
  onLongPress: (message: Message) => void;
  /** Swipe to reply; off when the person cannot reply here */
  onReply?: (message: Message) => void;
  /** Tap on a reply preview */
  onJump?: (id: string) => void;
  /** Flash it: the message a jump landed on */
  highlighted?: boolean;
  /** Selection mode: a tap selects instead of opening anything */
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** The add chip after the reactions (opens the reaction picker) */
  onAddReaction?: (message: Message) => void;
};

/** Pull a row toward the start side to reply (web: swipeToReply.ts) */
function SwipeToReply({ enabled, onReply, children }: { enabled: boolean; onReply: () => void; children: React.ReactNode }) {
  const { palette } = useTheme();
  const rtl = I18nManager.isRTL;
  const offset = useSharedValue(0);
  const armed = useSharedValue(0);
  const accent = palette.accent;
  const field = palette.field;
  const reduce = useReduceMotion();
  const buzz = () => haptics.light();
  const pan = usePanGesture({
    enabled,
    // only the reply direction starts it; up and down stay a scroll
    activeOffsetX: rtl ? [-9999, PULL_START] : [-PULL_START, 9999],
    failOffsetY: [-SCROLL_SLOP, SCROLL_SLOP],
    // the first 24 px from the back-swipe edge (left in English, right in
    // Arabic) belong to the stack's swipe-back; in Arabic the reply pull
    // goes toward that same edge, so the two would fight there
    hitSlop: rtl ? { right: -BACK_EDGE } : { left: -BACK_EDGE },
    onUpdate: (e) => {
      "worklet";
      const pull = pullDistance(e.translationX, rtl);
      offset.value = rowOffset(pull);
      const now = pull >= PULL_ARMED ? 1 : 0;
      if (now && !armed.value) scheduleOnRN(buzz);
      armed.value = now;
    },
    onFinalize: () => {
      "worklet";
      if (armed.value) scheduleOnRN(onReply);
      armed.value = 0;
      offset.value = withTiming(0, { duration: reduce ? 100 : 160 });
    },
  });
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? offset.value : -offset.value }] }));
  const mark = useAnimatedStyle(() => {
    const grow = Math.min(1, offset.value / PULL_ARMED);
    return {
      opacity: grow,
      transform: [{ scale: 0.6 + 0.4 * grow }],
      backgroundColor: armed.value ? accent : field,
    };
  });
  if (!enabled) return <>{children}</>;
  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", end: 14, top: 8, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, mark]}
        >
          <Icon name="arrow-bend-up-left" size={20} color={palette.fg} />
        </Animated.View>
        <Animated.View style={row}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * One message, like the web's Message on a phone: 48 px info column with a
 * 36 px avatar at the start of a group, name in the role colour, calendar
 * time, "(edited)", reply preview, text, extra blocks (slots.tsx), files
 * and reactions. Swipe to reply; tap the avatar or name for the profile.
 */
export const MessageRow = memo(function MessageRow({ id, tail, selfId, serverId, onLongPress, onReply, onJump, highlighted, selecting, selected, onSelect, onAddReaction }: MessageRowProps) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const openProfile = useOpenProfile();
  const message = useSolid(useCallback(() => client.messages.get(id), [client, id]));
  const f = useFields(message, (m) => ({
    // the SDK name: masquerade, then the webhook's own name (a webhook post has no author, it used to show "…"), nickname, display name, username
    name: m.username ?? "…",
    colour: typeof m.roleColour === "string" && !m.roleColour.includes("gradient") ? m.roleColour : undefined,
    avatar: m.avatarURL,
    authorId: m.webhook ? undefined : m.authorId,
    bot: !!m.author?.bot || !!m.webhook,
    at: m.createdAt.getTime(),
    edited: !!m.editedAt,
    content: m.content ?? "",
    hideContent: hidesContent(m.content, m.embeds),
    // a forwarded copy: drawn in the Forwarded frame (web ForwardedFrame)
    forwarded: forwardOrigin(m.forwarded),
    channelId: m.channelId,
    system: !!m.systemMessage,
    replies: m.replyIds ?? [],
    mentioned: m.mentioned,
    // voice notes and audio files are drawn by MessageExtras
    // a bot's answer: "<name> used /command" above it (web InteractionHeader)
    interaction: m.interaction?.name ? { user: m.interaction.user, name: m.interaction.name, botId: m.authorId } : undefined,
    // files a component block already shows in place are left out (web placedAttachments)
    files: (m.attachments ?? []).filter((a) => !isAudioAttachment(a) && !placedAttachments(m.components).has(a.id)).map((a) => {
      const type = a.metadata?.type;
      return {
        id: a.id,
        url: a.createFileURL?.() ?? a.originalUrl,
        name: a.filename,
        kind: (type === "Image" ? "image" : type === "Video" ? "video" : type === "Audio" ? "audio" : "file") as Attachment["kind"],
        width: (a.metadata as { width?: number })?.width,
        height: (a.metadata as { height?: number })?.height,
        size: a.humanReadableSize,
      };
    }),
  }));
  if (!message || !f) return null;
  if (f.system) return <SystemLine message={message} selfId={selfId} serverId={serverId} onJump={onJump} />;

  const edited = f.edited ? t`(edited)` : undefined;
  const authorId = f.authorId;
  const profile = authorId ? () => openProfile(authorId, serverId) : undefined;
  const userMenu = authorId ? () => openUserMenu(authorId, serverId) : undefined;
  const marked = selected || highlighted;
  return (
    <SwipeToReply enabled={!!onReply && !selecting} onReply={() => onReply?.(message)}>
      <PressableRow
        testID={`message-${id}`}
        // long press: the row lifts with a medium tap, then the message sheet opens
        highlight={palette.navHover}
        onPress={selecting ? () => onSelect?.(id) : undefined}
        onLongPress={
          selecting
            ? undefined
            : () => {
                clearPressedFile();
                onLongPress(message);
              }
        }
        delayLongPress={MENU_DELAY}
        accessibilityState={selecting ? { selected: !!selected } : undefined}
        style={{
          paddingVertical: tail ? 1 : 2,
          marginTop: tail ? 0 : 16,
          borderStartWidth: 2,
          borderStartColor: marked ? palette.accent : f.mentioned ? palette.mentionBar : "transparent",
          backgroundColor: marked || f.mentioned ? palette.mentionBg : "transparent",
          flexDirection: "row",
        }}
      >
        {selecting ? (
          <View style={{ width: 32, alignItems: "center", paddingTop: tail ? 2 : 8 }}>
            <View
              testID={`message-select-${id}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: selected ? palette.accent : palette.muted,
                backgroundColor: selected ? palette.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected ? <Icon name="check" size={14} color={palette.onAccent} /> : null}
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {f.replies.map((r) => (
            <ReplyPreview key={r} id={r} onJump={selecting ? undefined : onJump} />
          ))}
          {f.interaction ? <InteractionHeader userId={f.interaction.user} name={f.interaction.name} botId={f.interaction.botId} serverId={serverId} selecting={selecting} /> : null}
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 48, alignItems: "flex-start" }}>
              {!tail ? (
                <Pressable
                  testID={`message-avatar-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={f.name}
                  onPress={selecting ? () => onSelect?.(id) : profile}
                  onLongPress={selecting ? undefined : userMenu}
                  delayLongPress={300}
                  disabled={!profile && !selecting}
                  // a 44 px tap box around the 36 px avatar; the picture stays where the web draws it
                  style={{ width: 44, height: 44, margin: -4, padding: 4 }}
                >
                  <Avatar url={f.avatar} name={f.name} size={36} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ flex: 1, paddingEnd: 4 }}>
              {!tail ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20, flexWrap: "wrap" }}>
                  <AText autoDir size={14} line={20} weight="medium" color={f.colour ?? palette.fg} numberOfLines={1} onPress={selecting ? undefined : profile} onLongPress={selecting ? undefined : userMenu} style={{ flexShrink: 1 }}>
                    {f.name}
                  </AText>
                  {f.bot ? (
                    <View style={{ paddingHorizontal: 4, borderRadius: 4, backgroundColor: palette.accent }}>
                      <AText size={10} line={14} weight="bold" color={palette.onAccent}>
                        {t`Bot`}
                      </AText>
                    </View>
                  ) : null}
                  <AText size={12} line={16} color={palette.muted}>
                    {messageTime(i18n, new Date(f.at))}
                  </AText>
                </View>
              ) : null}
              <ForwardedFrame origin={f.forwarded} serverId={serverId}>
                {f.content && !f.hideContent ? <MessageContent content={f.content} edited={edited} serverId={serverId} /> : null}
                <MessageBlocks message={message} serverId={serverId} selfId={selfId} />
                {f.files.length ? (
                  <Attachments
                    files={f.files}
                    source={{ messageId: id, authorId: f.authorId, serverId }}
                    onHold={
                      selecting
                        ? undefined
                        : (fileId) => {
                            // the sheet's file rows act on the file that was held (web: the right-clicked file)
                            markPressedFile(id, fileId);
                            onLongPress(message);
                          }
                    }
                  />
                ) : null}
                <MessageExtras message={message} onOpenLink={openLink} onOpenImage={openImage} onLongPress={selecting ? undefined : () => onLongPress(message)} />
              </ForwardedFrame>
              <Reactions message={message} selfId={selfId} serverId={serverId} onAdd={selecting ? undefined : onAddReaction} />
              {f.channelId ? <ThreadChip channelId={f.channelId} messageId={id} /> : null}
            </View>
          </View>
        </View>
      </PressableRow>
    </SwipeToReply>
  );
});
