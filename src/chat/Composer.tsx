import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { Channel, Message } from "@zrzur/sdk/solid";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, TextInput, type TextInputInstance, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inputDirStyle } from "@/ui/kit/bidi";
import { describeError } from "@/auth/errorText";
import { useClient, useLiveStatus } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { explainPermission, permissionOutcome } from "@/lib/permissions";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { EmojiPicker, entryText, type EmojiEntry } from "@/ui/emoji/EmojiPicker";
import { useNow } from "@/ui/events/useNow";
import { AText, haptics, Icon, type IconName, useReduceMotion } from "@/ui/kit";
import { startThread } from "@/ui/threads/startThread";
import { startAccess } from "@/ui/threads/threadAccess";

import { applyCompletion, findTrigger } from "./autocomplete";
import { getDraft, loadDrafts, setDraft } from "./drafts";
import { CommandForm, CommandPicker, CommandSheet, slashQuery, typedCommand, useChannelCommands, type ApplicationCommand } from "./interactions";
import { runCommand } from "./interactions/store";
import { commandName } from "./interactions/types";
import { DEFAULT_ATTACHMENTS, DEFAULT_MESSAGE_LENGTH, humanFileSize, lengthState, splitBySize } from "./limits";
import type { OutboxFile } from "./outbox/rules";
import { sendMessage as queueMessage } from "./outbox/store";
import { digitalTime, splitDuration, useSlowmode } from "./slowmode";
import { type Suggestion, Suggestions } from "./Suggestions";
import type { PickedFile } from "./upload";

export type ComposerMode = { kind: "reply"; message: Message; mention: boolean } | { kind: "edit"; message: Message } | null;

/**
 * An extra choice in the "+" panel (GIFs, polls, voice messages).
 * `onPress` gets the composer's tools.
 */
export type ComposerAction = {
  id: string;
  icon: IconName;
  label: string;
  onPress: (tools: ComposerTools) => void;
};

/** What an extra piece may do with the message box */
export type ComposerTools = {
  channel: Channel;
  /** Put text where the cursor is */
  insertText: (text: string) => void;
  /** Send a message right away (e.g. a picked GIF) */
  sendNow: (content: string) => Promise<void>;
  /** Send a file with the text in the box and the reply (e.g. a voice note), as the web does */
  sendFile: (file: PickedFile) => void;
  /** Close the "+" panel */
  closePanel: () => void;
};

type DraftFile = OutboxFile & { id: string };

// ----- the "+" panel and the keyboard share one space under the box -----

const panelListeners = new Set<() => void>();
/** Close the "+" panel (the chat list calls this when it is dragged, as it lowers the keyboard) */
export function dismissComposerPanel() {
  for (const l of panelListeners) l();
}

/** Last keyboard height seen (without the home indicator), so the panel takes the keyboard's place exactly */
let lastKeyboard = 0;
const keyboardListeners = new Set<() => void>();
Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => {
  lastKeyboard = e.endCoordinates.height;
  for (const l of keyboardListeners) l();
});
Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
  for (const l of keyboardListeners) l();
});
const subscribeKeyboard = (l: () => void) => {
  keyboardListeners.add(l);
  return () => {
    keyboardListeners.delete(l);
  };
};
/** The keyboard's height while it is up (0 otherwise) */
function useKeyboardHeight() {
  return useSyncExternalStore(
    subscribeKeyboard,
    () => (Keyboard.isVisible() ? lastKeyboard : 0),
    () => 0,
  );
}

/** The panel's height: the keyboard's, so swapping them moves nothing */
const panelHeight = (bottomInset: number) => Math.max(260, (lastKeyboard || 300) - bottomInset);

/** The image on the clipboard, saved as a PNG in the cache (undefined when there is none) */
async function clipboardImageFile(): Promise<PickedFile | undefined> {
  const image = await Clipboard.getImageAsync({ format: "png" });
  if (!image?.data) return undefined;
  const base64 = image.data.replace(/^data:[^,]*,/, "");
  const name = `pasted-${Date.now()}.png`;
  const file = new File(Paths.cache, name);
  file.create();
  file.write(base64, { encoding: "base64" });
  return { uri: file.uri, name, type: "image/png", size: Math.round((base64.length * 3) / 4) };
}

// ----- the line above the box: who is typing, and slowmode -----

/** Durations in words in the reader's language (web: useDurationFormat) */
function durationWords(locale: string, seconds: number) {
  const { hours, minutes, seconds: s } = splitDuration(seconds);
  const part = (n: number, unit: "hour" | "minute" | "second") => new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(n);
  const parts = [hours ? part(hours, "hour") : "", minutes ? part(minutes, "minute") : "", s || (!hours && !minutes) ? part(s, "second") : ""].filter(Boolean);
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(parts);
  } catch {
    return parts.join(" ");
  }
}

/**
 * The quiet line above the message box (web: CompositionInfo): who is
 * typing, with their avatars, and at the end the slowmode clock: the
 * countdown while you wait, "Slowmode immune" for those who may skip it.
 * A tap on the clock says the channel's rule.
 */
export function ComposerInfo({ channel, onToast }: { channel: Channel | undefined; onToast?: (text: string) => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const slow = useSlowmode(channel);
  const typing = useSolid(
    useCallback(() => {
      if (!channel) return "";
      return (channel.typing ?? [])
        .filter((u) => u && u.id !== client.user?.id && u.relationship !== "Blocked")
        .sort((a, b) => a.id.toUpperCase().localeCompare(b.id.toUpperCase()))
        .map((u) => `${u.id}\u0002${u.displayName ?? u.username}\u0002${u.avatarURL ?? ""}`)
        .join("\u0001");
    }, [client, channel]),
  );
  const people = typing ? typing.split("\u0001").map((row) => row.split("\u0002")) : [];
  const names = people.map((p) => p[1]);
  const rule = slow.every ? durationWords(i18n.locale, slow.every) : "";
  // web msgid: "Members can send one message every {0}."
  const ruleText = t`Members can send one message every ${String(rule)}.`;

  return (
    <View style={{ minHeight: 24, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {people.length ? (
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite" testID="typing-line">
          <View style={{ flexDirection: "row" }}>
            {people.slice(0, 3).map(([id, name, avatar], i) => (
              <View key={id} style={{ marginStart: i ? -6 : 0, borderRadius: 9, borderWidth: 1, borderColor: palette.frame }}>
                <Avatar url={avatar || undefined} name={name} size={16} />
              </View>
            ))}
          </View>
          <AText size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {names.length === 1 ? (
              <Trans>
                <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                  {names[0]}
                </AText>{" "}
                is typing…
              </Trans>
            ) : names.length < 5 ? (
              <Trans>
                <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                  {names.slice(0, -1).join(", ")}
                </AText>{" "}
                and{" "}
                <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                  {names[names.length - 1]}
                </AText>{" "}
                are typing…
              </Trans>
            ) : (
              <Trans>Several people are typing…</Trans>
            )}
          </AText>
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {slow.every ? (
        <Pressable
          testID="slowmode-line"
          accessibilityRole="text"
          accessibilityHint={ruleText}
          onPress={() => onToast?.(ruleText)}
          hitSlop={{ top: 10, bottom: 10 }}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Icon name="clock" size={14} color={slow.left ? palette.warningText : palette.muted} />
          <AText size={12} line={16} weight="semibold" color={slow.left ? palette.warningText : palette.muted} style={{ fontVariant: ["tabular-nums"] }}>
            {slow.immune ? t`Slowmode immune` : slow.left > 0 ? digitalTime(slow.left) : t`Slowmode is enabled.`}
          </AText>
        </Pressable>
      ) : null}
    </View>
  );
}

// ----- the bars above the box -----

/** "Replying to" bar (web: MessageReplyPreview): who and what, the @ On/Off switch, dismiss */
function ReplyBar({ message, mention, self, onToggle, onDismiss }: { message: Message; mention: boolean; self: boolean; onToggle?: () => void; onDismiss: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const f = useFields(message, (m) => ({
    // the SDK name and avatar, as in MessageRow: masquerade, then the webhook's own (a webhook post has no author), nickname, display name, username
    name: m.username ?? "",
    avatar: m.avatarURL,
    text: (m.content ?? "").replace(/\s+/g, " ").slice(0, 160),
    files: m.attachments?.length ?? 0,
  }));
  return (
    <View
      testID="composer-reply-bar"
      style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingStart: 12, borderRadius: 10, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.borderSoft }}
    >
      <AText size={13} line={20} color={palette.fg2}>
        {t`Replying to`}
      </AText>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Avatar url={f?.avatar} name={f?.name} size={16} />
        <AText autoDir size={13} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 0, maxWidth: "50%" }}>
          {f?.name ?? ""}
        </AText>
        <AText autoDir size={13} line={20} color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
          {f?.text || (f?.files ? t`Sent an attachment` : "")}
        </AText>
      </View>
      {!self && onToggle ? (
        <Pressable
          testID="composer-reply-mention"
          accessibilityRole="switch"
          accessibilityLabel={t`Mention`}
          accessibilityState={{ checked: mention }}
          aria-checked={mention}
          onPress={() => {
            haptics.selection();
            onToggle();
          }}
          style={{ minWidth: 44, height: 44, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          <Icon name="at" size={16} color={mention ? palette.accentText : palette.muted} />
          <AText size={12} line={16} weight="semibold" color={mention ? palette.accentText : palette.muted}>
            {mention ? t`On` : t`Off`}
          </AText>
        </Pressable>
      ) : null}
      <Pressable testID="composer-mode-cancel" accessibilityRole="button" accessibilityLabel={t`Cancel`} onPress={onDismiss} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="x-circle" size={18} color={palette.muted} />
      </Pressable>
    </View>
  );
}

/** Files waiting to be sent, as cards (web: FileCarousel): preview, spoiler, remove, name, size; "+" adds more */
function FileStrip({ files, max, onRemove, onSpoiler, onAdd }: { files: DraftFile[]; max: number; onRemove: (id: string) => void; onSpoiler: (id: string) => void; onAdd?: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View testID="composer-files" style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.floating }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 10, alignItems: "stretch" }}>
        {files.map((f, i) => {
          const image = f.type.startsWith("image/");
          const video = f.type.startsWith("video/");
          const ext = f.name.includes(".") ? f.name.split(".").pop()!.slice(0, 5) : "";
          return (
            <View key={f.id} style={{ flexDirection: "row", gap: 10 }}>
              {i === max ? <View aria-hidden style={{ width: 2, borderRadius: 2, backgroundColor: palette.borderStrong }} /> : null}
              <View
                testID={`composer-file-${i}`}
                accessibilityHint={i >= max ? t`Sent in the next message` : undefined}
                style={{ width: 164, padding: 6, gap: 2, borderRadius: 10, backgroundColor: palette.field, opacity: i >= max ? 0.45 : 1 }}
              >
                <View style={{ height: 104, marginBottom: 6, borderRadius: 7, overflow: "hidden", backgroundColor: palette.navHover, alignItems: "center", justifyContent: "center" }}>
                  {image || video ? (
                    <Image source={{ uri: f.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" blurRadius={f.spoiler ? 18 : 0} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={{ alignItems: "center", gap: 6 }}>
                      <Icon name={f.type.startsWith("audio/") ? "music-note" : f.type.startsWith("text/") ? "file-text" : "file"} size={28} color={palette.iconNeutral} />
                      {ext ? (
                        <AText size={11} line={14} weight="bold" color={palette.muted}>
                          {ext}
                        </AText>
                      ) : null}
                    </View>
                  )}
                  {video ? (
                    <View style={{ position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: palette.overlayScrim, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="play" size={14} color={palette.onOverlay} />
                    </View>
                  ) : null}
                  {f.spoiler ? (
                    <View style={{ position: "absolute", bottom: 6, start: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: palette.overlayScrim }}>
                      <AText size={11} line={14} weight="bold" color={palette.onOverlay}>
                        {t`Spoiler`}
                      </AText>
                    </View>
                  ) : null}
                  {image || video ? (
                    <Pressable
                      testID={`composer-file-spoiler-${i}`}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: !!f.spoiler }}
                      accessibilityLabel={f.spoiler ? t`Remove spoiler` : t`Mark as spoiler`}
                      onPress={() => onSpoiler(f.id)}
                      hitSlop={9}
                      style={{ position: "absolute", top: 6, start: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: palette.overlayScrim, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name={f.spoiler ? "eye" : "eye-slash"} size={14} color={palette.onOverlay} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID={`composer-file-remove-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={t`Remove ${f.name}`}
                    onPress={() => onRemove(f.id)}
                    hitSlop={9}
                    style={{ position: "absolute", top: 6, end: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: palette.overlayScrim, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon name="x" size={14} color={palette.onOverlay} />
                  </Pressable>
                </View>
                <AText autoDir size={13} line={17} weight="semibold" color={palette.fg} numberOfLines={1} style={{ paddingHorizontal: 2 }}>
                  {f.name}
                </AText>
                <AText size={12} line={15} color={palette.muted} style={{ paddingHorizontal: 2 }}>
                  {humanFileSize(f.size ?? 0)}
                </AText>
              </View>
            </View>
          );
        })}
        {onAdd ? (
          <Pressable
            testID="composer-file-add"
            accessibilityRole="button"
            accessibilityLabel={t`Add file`}
            onPress={onAdd}
            style={({ pressed }) => ({ width: 64, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: pressed ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" })}
          >
            <Icon name="plus" size={22} color={palette.muted} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** One tile of the "+" panel (web: ComposerAddPanel tile, 3 per row, 84 px) */
function AddTile({ id, icon, label, onPress }: { id: string; icon: IconName; label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={`composer-add-${id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: "31.5%",
        height: 84,
        padding: 8,
        borderRadius: 14,
        backgroundColor: pressed ? palette.navSelected : palette.field,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      })}
    >
      <Icon name={icon} size={24} color={palette.fg} />
      <AText size={13} line={17} weight="medium" color={palette.fg} numberOfLines={2} style={{ textAlign: "center" }}>
        {label}
      </AText>
    </Pressable>
  );
}

/**
 * The message box (web: Composition + MessageBox on a phone).
 *
 * Above the box: the reply bar, the file cards, the slash-command list or
 * the @ # : suggestions, the "too long" line. The box: "+", the text (grows
 * to 40 % of the space above the keyboard, 20 % with a reply or files, then
 * scrolls), emoji, the length counter and Send. Under the box sits the
 * keyboard's space: it follows the keyboard frame by frame (also while the
 * chat is dragged down), and the "+" panel takes the keyboard's place there.
 *
 * Sending is instant: the text leaves the box at once and the message shows
 * in the chat as "Sending…" (the outbox), waits offline, retries itself.
 * Blocked states (timed out, announcement channel, no permission) show in
 * the box itself.
 *
 * Slots: `actions` adds tiles to the "+" panel, `accessory` draws above
 * the box (the voice recorder), `idleButton` takes Send's place while
 * there is nothing to send (the microphone), `onTools` hands the
 * composer's tools out.
 */
export function Composer({
  channel,
  placeholder,
  mode,
  onClearMode,
  onToggleMention,
  onSent,
  actions,
  accessory,
  idleButton,
  onTools,
}: {
  channel: Channel;
  placeholder: string;
  mode: ComposerMode;
  onClearMode: () => void;
  onToggleMention?: () => void;
  onSent: () => void;
  actions?: ComposerAction[];
  accessory?: ReactNode;
  /** drawn in Send's place while the box is empty and has no files (web: the microphone) */
  idleButton?: ReactNode;
  onTools?: (tools: ComposerTools) => void;
}) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const status = useLiveStatus();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const window = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const now = useNow(60_000);
  const editing = mode?.kind === "edit";
  const [text, setText] = useState(() => (editing ? (mode.message.content ?? "") : getDraft(channel.id)));
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [focused, setFocused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: text.length, end: text.length });
  const [command, setCommand] = useState<ApplicationCommand | null>(null);
  const [slashNote, setSlashNote] = useState<string | null>(null);
  const [commandSheet, setCommandSheet] = useState(false);
  const [clipboardImage, setClipboardImage] = useState(false);
  const [pasteHidden, setPasteHidden] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const typingSent = useRef(0);
  const slow = useSlowmode(channel);

  const rules = useFields(channel, (c) => ({
    send: c.type === "SavedMessages" || c.type === "DirectMessage" || c.type === "Group" || c.havePermission("SendMessage"),
    upload: c.type === "SavedMessages" || c.havePermission("UploadFiles"),
    announcementOnly: !!c.announcement && !c.havePermission("ManageMessages"),
    timeoutUntil: c.server?.member?.timeout?.getTime() ?? 0,
    thread: c.type === "TextChannel" && !c.isThread && !c.isVoice && startAccess(c) === "allowed",
    nsfw: c.mature,
    // a DM with a bot: its commands one tap away in the row (web: composer-commands, features.bot_dms)
    botDm: c.type === "DirectMessage" && !!c.recipient?.bot && (client.configuration?.features as { bot_dms?: boolean } | undefined)?.bot_dms === true,
    shape: { id: c.id, type: c.type, serverId: c.serverId || undefined, parentId: c.parentId, recipient: c.recipient ? { id: c.recipient.id, bot: c.recipient.bot } : undefined },
  }));
  const timedOut = !!rules && rules.timeoutUntil > now;
  const blocked = !rules ? null : timedOut ? "timeout" : rules.announcementOnly ? "announcement" : !rules.send ? "permission" : null;

  // the saved drafts may still be loading when the box first shows
  useEffect(() => {
    if (editing) return;
    let alive = true;
    void loadDrafts().then(() => {
      const saved = getDraft(channel.id);
      if (alive && saved) setText((current) => current || saved);
    });
    return () => {
      alive = false;
    };
  }, [channel.id, editing]);

  useEffect(() => {
    if (mode) input.current?.focus();
  }, [mode]);

  const limits = client.limits as { message_length?: number; message_attachments?: number; file_upload_size_limits?: Record<string, number> } | undefined;
  const maxLength = limits?.message_length ?? DEFAULT_MESSAGE_LENGTH;
  const maxFiles = limits?.message_attachments ?? DEFAULT_ATTACHMENTS;
  const maxSize = limits?.file_upload_size_limits?.attachments;
  const length = lengthState(text.length, maxLength);
  const over = text.length - maxLength;
  const tooLong = length.show && length.over;
  const ready = (text.trim().length > 0 || files.length > 0) && !saving && !tooLong && !slow.left && !blocked;

  // slash commands: the list while the text is "/" and one word
  const query = !editing ? slashQuery(text) : undefined;
  const commands = useChannelCommands(client, rules?.shape, query !== undefined || text.startsWith("/") || commandSheet);
  const trigger = useMemo(
    () => (focused && query === undefined && selection.start === selection.end ? findTrigger(text, selection.end) : undefined),
    [focused, query, text, selection.start, selection.end],
  );

  // the keyboard's space under the box, frame by frame; the panel takes it when open
  const keyboard = useAnimatedKeyboard();
  const panel = useSharedValue(0);
  const bottomInset = insets.bottom;
  const space = useAnimatedStyle(() => ({ height: Math.max(keyboard.height.get() - bottomInset, panel.get()) }));
  const panelH = panelHeight(bottomInset);

  const openPanel = () => {
    setPasteHidden(false);
    void Clipboard.hasImageAsync().then(setClipboardImage, () => setClipboardImage(false));
    if (Keyboard.isVisible()) {
      // the panel takes the keyboard's place without a jump
      panel.set(panelH);
      Keyboard.dismiss();
    } else panel.set(reduceMotion ? panelH : withTiming(panelH, { duration: 250 }));
    setAdding(true);
  };
  const closePanel = useCallback(
    (forKeyboard = false) => {
      setAdding(false);
      // when the keyboard comes up in its place, the space shrinks once it is there
      if (!forKeyboard) panel.set(reduceMotion ? 0 : withTiming(0, { duration: 250 }));
    },
    [panel, reduceMotion],
  );
  useEffect(() => {
    const listener = () => closePanel();
    panelListeners.add(listener);
    return () => {
      panelListeners.delete(listener);
    };
  }, [closePanel]);
  useEffect(() => {
    // the keyboard is up: the panel's space is not needed any more
    if (keyboardHeight > 0) panel.set(0);
  }, [keyboardHeight, panel]);

  function change(value: string) {
    setText(value);
    setSlashNote(null);
    if (!editing) setDraft(channel.id, value);
  }

  function addFiles(picked: PickedFile[]) {
    const { ok, tooLarge } = splitBySize(picked, maxSize);
    if (tooLarge.length && maxSize) {
      const maxSizeFormatted = humanFileSize(maxSize);
      haptics.error();
      if (tooLarge.length === 1) {
        const file = tooLarge[0];
        const fileSize = humanFileSize(file.size ?? 0);
        setError(t`The file "${file.name}" (${fileSize}) exceeds the maximum size limit of ${maxSizeFormatted}.`);
      } else {
        const rejectedFiles = tooLarge;
        setError(t`${rejectedFiles.length} files exceed the maximum size limit of ${maxSizeFormatted} and were not uploaded.`);
      }
    } else setError(null);
    setFiles((list) => [...list, ...ok.filter((x) => !list.some((y) => y.uri === x.uri)).map((f) => ({ ...f, id: `${f.uri}#${Math.random().toString(36).slice(2)}` }))]);
  }

  async function pickImages() {
    closePanel();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: maxFiles, quality: 0.9 });
    if (result.canceled) return;
    addFiles(result.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? `image-${a.assetId ?? a.uri.split("/").pop()}`, type: a.mimeType ?? "image/jpeg", size: a.fileSize })));
  }

  async function takePhoto() {
    closePanel();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      explainPermission("camera-photo", permissionOutcome(permission));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled) return;
    const a = result.assets[0];
    addFiles([{ uri: a.uri, name: a.fileName ?? a.uri.split("/").pop() ?? "photo.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize }]);
  }

  async function pickFiles() {
    closePanel();
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    addFiles(result.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size })));
  }

  /** The image on the clipboard, as a file in the cache */
  async function pasteImage() {
    closePanel();
    setPasteHidden(true);
    try {
      const file = await clipboardImageFile();
      if (file) addFiles([file]);
    } catch {
      setError(t`The image could not be pasted.`);
    }
  }

  /** Run a picked command: at once when it asks for nothing, else its form opens */
  function chooseCommand(c: ApplicationCommand) {
    // the typed "/name" goes; a draft written before opening the sheet stays
    if (text.startsWith("/")) change("");
    if (!c.options?.length) {
      haptics.light();
      runCommand(client, channel.id, c, []).catch(() => {
        // the failure shows in the chat where the answer would be
      });
      onSent();
      return;
    }
    Keyboard.dismiss();
    setCommand(c);
  }

  async function send(extra: PickedFile[] = []) {
    if (blocked || saving || slow.left) return;
    // a slash command named in full runs instead of being sent as text
    if (!editing && text.startsWith("/") && !extra.length && !files.length && commands.list) {
      const named = typedCommand(text, commands.list.commands, (c) => commandName(c, i18n.locale));
      if (named) return chooseCommand(named);
      if (slashQuery(text) !== undefined && !slashNote) {
        setSlashNote(t`No command has this name. Press Enter again to send it as a message.`);
        return;
      }
    }
    const withExtra = extra.length > 0 && !editing && !tooLong;
    if (!ready && !withExtra) return;
    setError(null);
    if (editing) {
      setSaving(true);
      try {
        await mode.message.edit({ content: text.trim() });
        setText("");
        onClearMode();
        haptics.light();
      } catch (err) {
        haptics.error();
        setError(describeError(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    const all: OutboxFile[] = [...files, ...extra].slice(0, maxFiles).map((f) => ({ uri: f.uri, name: f.name, type: f.type, size: f.size, spoiler: (f as DraftFile).spoiler }));
    const content = text.trim();
    const replies = mode?.kind === "reply" ? [{ id: mode.message.id, mention: mode.mention }] : undefined;
    // the box empties at once; the message shows in the chat as "Sending…"
    setText("");
    setDraft(channel.id, "");
    setFiles((list) => list.slice(maxFiles));
    setSlashNote(null);
    onClearMode();
    onSent();
    haptics.light();
    void queueMessage(client, channel, { content, replies, files: all }, status === "connected");
  }

  function onChangeText(value: string) {
    change(value);
    // tell others we are typing, at most every 3 seconds
    const at = Date.now();
    if (value && at - typingSent.current > 3000) {
      typingSent.current = at;
      channel.startTyping?.();
    }
  }

  function insertText(value: string) {
    const at = Math.min(selection.start, text.length);
    const end = Math.min(selection.end, text.length);
    const before = text.slice(0, at);
    const space = before && !/\s$/.test(before) && /^[:<]/.test(value) ? " " : "";
    const next = before + space + value + text.slice(end);
    const cursor = at + space.length + value.length;
    change(next);
    setSelection({ start: cursor, end: cursor });
    requestAnimationFrame(() => input.current?.setSelection?.(cursor, cursor));
  }

  function pickSuggestion(s: Suggestion) {
    if (!trigger) return;
    const result = applyCompletion(text, trigger, s.insert);
    change(result.text);
    setSelection({ start: result.cursor, end: result.cursor });
    requestAnimationFrame(() => input.current?.setSelection?.(result.cursor, result.cursor));
  }

  const tools: ComposerTools = {
    channel,
    insertText,
    sendNow: async (content) => {
      onSent();
      await queueMessage(client, channel, { content }, status === "connected");
    },
    sendFile: (file) => void send([file]),
    closePanel: () => closePanel(),
  };

  useEffect(() => {
    onTools?.(tools);
  });

  /** The commands sheet (the "+" tile and the row button); typing "/" keeps the list above the box */
  function openCommands() {
    closePanel();
    Keyboard.dismiss();
    setCommandSheet(true);
  }

  /** A command picked in the sheet: the sheet leaves first, then it runs or its form opens */
  function pickFromSheet(c: ApplicationCommand) {
    setCommandSheet(false);
    // one Modal at a time on iOS: the form opens once the sheet's exit ran (MessageSheet afterSheet)
    setTimeout(() => chooseCommand(c), 280);
  }

  /** What a tile of the "+" panel does */
  function runTile(id: string) {
    switch (id) {
      case "camera":
        return void takePhoto();
      case "pictures":
        return void pickImages();
      case "files":
        return void pickFiles();
      case "paste":
        return void pasteImage();
      case "thread":
        closePanel();
        return startThread(channel.id);
      case "commands":
        return openCommands();
      default:
        return actions?.find((a) => a.id === id)?.onPress(tools);
    }
  }

  const choices: { id: string; icon: IconName; label: string }[] = [
    ...(rules?.upload
      ? [
          { id: "camera", icon: "video-camera" as IconName, label: t`Camera` },
          { id: "pictures", icon: "image" as IconName, label: t`Photos and videos` },
          { id: "files", icon: "file" as IconName, label: t`Files` },
          ...(clipboardImage ? [{ id: "paste", icon: "copy" as IconName, label: t`Paste image` }] : []),
        ]
      : []),
    ...(actions ?? []).map((a) => ({ id: a.id, icon: a.icon, label: a.label })),
    ...(rules?.thread ? [{ id: "thread", icon: "chats-circle" as IconName, label: t`New thread` }] : []),
    { id: "commands", icon: "lightning", label: t`Commands` },
  ];

  // grows to 40 % of the space above the keyboard (20 % with a reply or files), then scrolls
  const crowded = files.length > 0 || mode?.kind === "reply";
  const visible = window.height - insets.top - (keyboardHeight || (adding ? panelH + bottomInset : 0));
  const maxInput = Math.max(44, Math.floor(visible * (crowded ? 0.2 : 0.4)) - 16);
  const sendOn = ready;
  // nothing typed or attached: the microphone instead of Send (web draftEmpty)
  const idle = !!idleButton && !text.trim() && !files.length && !editing && !saving;
  const replySelf = mode?.kind === "reply" && mode.message.authorId === client.user?.id;
  const showPasteChip = focused && clipboardImage && !pasteHidden && !text && !files.length && !!rules?.upload && !editing;

  useEffect(() => {
    if (!focused || editing) return;
    let live = true;
    void Clipboard.hasImageAsync().then(
      (has) => live && setClipboardImage(has),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [focused, editing]);

  return (
    <View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
        {files.length ? (
          <FileStrip
            files={files}
            max={maxFiles}
            onRemove={(id) => setFiles((list) => list.filter((f) => f.id !== id))}
            onSpoiler={(id) => setFiles((list) => list.map((f) => (f.id === id ? { ...f, spoiler: !f.spoiler } : f)))}
            onAdd={rules?.upload ? () => void pickFiles() : undefined}
          />
        ) : null}
        {mode?.kind === "reply" ? (
          <ReplyBar message={mode.message} mention={mode.mention} self={replySelf} onToggle={onToggleMention} onDismiss={onClearMode} />
        ) : mode?.kind === "edit" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingStart: 12, borderRadius: 10, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.borderSoft }}>
            <Icon name="pencil-simple" size={16} color={palette.muted} />
            <AText size={13} line={20} color={palette.fg2} numberOfLines={1} style={{ flex: 1 }}>
              {t`Edit message`}
            </AText>
            <Pressable
              testID="composer-mode-cancel"
              accessibilityRole="button"
              accessibilityLabel={t`Cancel editing`}
              onPress={() => {
                setText("");
                onClearMode();
              }}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="x-circle" size={18} color={palette.muted} />
            </Pressable>
          </View>
        ) : null}
        {query !== undefined && focused ? (
          <CommandPicker load={commands} query={query} mediaUrl={client.configuration?.features?.autumn?.url} onPick={chooseCommand} />
        ) : trigger ? (
          <Suggestions channel={channel} trigger={trigger} onPick={pickSuggestion} />
        ) : null}
        {accessory}
        {showPasteChip ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable
              testID="composer-paste-image"
              accessibilityRole="button"
              onPress={() => void pasteImage()}
              style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: pressed ? palette.navSelected : palette.tonal })}
            >
              <Icon name="image" size={16} color={palette.fg} />
              <AText size={13} line={18} weight="semibold" color={palette.fg}>
                {t`Paste image`}
              </AText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t`Dismiss`} onPress={() => setPasteHidden(true)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={14} color={palette.muted} />
            </Pressable>
          </View>
        ) : null}
        {tooLong ? (
          <View testID="composer-too-long" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.field }}>
            <Icon name="warning" size={18} color={palette.danger} />
            <AText size={14} line={20} color={palette.danger} style={{ flex: 1 }} accessibilityLiveRegion="polite">
              <Plural
                value={over}
                one={`This message is too long. Remove # character to send it (up to ${maxLength}).`}
                other={`This message is too long. Remove # characters to send it (up to ${maxLength}).`}
              />
            </AText>
          </View>
        ) : null}
        {slashNote || error ? (
          <AText size={13} line={18} color={error ? palette.danger : palette.muted} numberOfLines={3} accessibilityLiveRegion="polite">
            {error ?? slashNote}
          </AText>
        ) : null}
        <View
          style={{
            // web: 56 px dock, 7 px padding, 40 px icon slots; here 44 px tap boxes
            minHeight: 56,
            paddingVertical: 5,
            paddingHorizontal: 5,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: focused ? palette.accent : palette.borderSoft,
            backgroundColor: palette.field,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 2,
            shadowColor: palette.shadow,
            shadowOpacity: palette.dark ? 0.25 : 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          {blocked ? (
            <>
              <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Icon name="prohibit" size={20} color={palette.muted} />
              </View>
              <AText testID="composer-blocked" size={14} line={20} color={palette.fg2} style={{ flex: 1, paddingVertical: 12, paddingEnd: 8 }}>
                {blocked === "timeout"
                  ? t`You are timed out and can't send messages right now.`
                  : blocked === "announcement"
                    ? t`This is an announcement channel. Only people who can manage messages post here.`
                    : t`You don't have permission to send messages in this channel.`}
              </AText>
            </>
          ) : (
            <>
              {!editing ? (
                <Pressable
                  testID="composer-add"
                  accessibilityRole="button"
                  accessibilityLabel={adding ? t`Close` : t`Add`}
                  accessibilityState={{ expanded: adding }}
                  onPress={() => {
                    haptics.selection();
                    if (adding) {
                      closePanel(true);
                      input.current?.focus();
                    } else openPanel();
                  }}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", transform: [{ rotate: adding ? "45deg" : "0deg" }] }}
                >
                  <Icon name="plus" size={22} color={palette.iconMuted} />
                </Pressable>
              ) : (
                <View style={{ width: 8 }} />
              )}
              <TextInput
                ref={input}
                testID="composer-input"
                value={text}
                onChangeText={onChangeText}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                placeholder={placeholder}
                placeholderTextColor={palette.muted}
                accessibilityLabel={placeholder}
                selectionColor={palette.accent}
                cursorColor={palette.accent}
                multiline
                scrollEnabled
                // a chat: Return starts a new line (iMessage); sentences start capitalised; the keyboard follows the theme
                returnKeyType="default"
                submitBehavior="newline"
                autoCapitalize="sentences"
                keyboardAppearance={palette.dark ? "dark" : "light"}
                // a hardware keyboard in the web build: Enter sends, Shift+Enter starts a new line
                onKeyPress={
                  Platform.OS === "web"
                    ? (e) => {
                        const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                        if (key.key === "Enter" && !key.shiftKey) {
                          (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                          void send();
                        }
                      }
                    : undefined
                }
                rows={Platform.OS === "web" ? 1 : undefined}
                onFocus={() => {
                  setFocused(true);
                  if (adding) closePanel(true);
                }}
                onBlur={() => setFocused(false)}
                style={{
                  flex: 1,
                  maxHeight: maxInput,
                  minHeight: 44,
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingHorizontal: 4,
                  fontSize: 16,
                  lineHeight: 20,
                  color: palette.fg,
                  fontFamily: fontFamily(i18n.locale),
                  // the draft takes its own direction, like dir="auto" on the web (Arabic starts on the right)
                  ...inputDirStyle(text),
                  textAlignVertical: "center",
                }}
              />
              {rules?.botDm && !editing ? (
                <Pressable
                  testID="composer-commands"
                  accessibilityRole="button"
                  accessibilityLabel={t`Commands`}
                  onPress={() => {
                    haptics.selection();
                    openCommands();
                  }}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="terminal" size={22} color={palette.iconMuted} />
                </Pressable>
              ) : null}
              <Pressable
                testID="composer-emoji"
                accessibilityRole="button"
                accessibilityLabel={t`Open emoji picker`}
                onPress={() => {
                  closePanel();
                  setEmoji(true);
                }}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="smiley" size={22} color={palette.iconMuted} />
              </Pressable>
              <View style={{ alignItems: "center" }}>
                {length.show ? (
                  <AText testID="composer-length" size={11} line={16} weight="semibold" color={length.over ? palette.danger : palette.muted} style={{ writingDirection: "ltr", fontVariant: ["tabular-nums"] }}>
                    {length.wayOver ? t`Too long` : String(length.left).replace("-", "−")}
                  </AText>
                ) : null}
                {idle ? (
                  idleButton
                ) : (
                <Pressable
                  testID="composer-send"
                  accessibilityRole="button"
                  accessibilityLabel={editing ? t`Save` : t`Send message`}
                  accessibilityState={{ disabled: !sendOn, busy: saving }}
                  disabled={!sendOn && !(text.startsWith("/") && !editing)}
                  onPress={() => void send()}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  {({ pressed }) => (
                    // web: the 40 px button fills with the accent only when there is something to send
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: sendOn || saving ? (pressed ? palette.accentPressed : palette.accent) : "transparent",
                        opacity: sendOn || saving ? 1 : 0.4,
                      }}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={palette.onAccent} />
                      ) : (
                        <Icon name={editing ? "check" : "paper-plane-tilt"} size={22} color={sendOn ? palette.onAccent : palette.iconMuted} />
                      )}
                    </View>
                  )}
                </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </View>
      {/* the keyboard's place: follows it frame by frame; the "+" panel lives here */}
      <Animated.View style={[{ overflow: "hidden" }, space]}>
        {adding ? (
          <ScrollView
            testID="composer-add-panel"
            style={{ height: panelH }}
            contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16, justifyContent: "flex-start" }}
            keyboardShouldPersistTaps="always"
          >
            {choices.map((c) => (
              <AddTile key={c.id} id={c.id} icon={c.icon} label={c.label} onPress={() => runTile(c.id)} />
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>
      <EmojiPicker visible={emoji} onClose={() => setEmoji(false)} testID="composer-emoji-picker" onPick={(entry: EmojiEntry) => insertText(entryText(entry))} />
      <CommandSheet visible={commandSheet} load={commands} nsfw={rules?.nsfw} onClose={() => setCommandSheet(false)} onPick={pickFromSheet} />
      {command ? (
        <CommandForm
          channel={channel}
          command={command}
          onClose={() => setCommand(null)}
          onDone={() => {
            setCommand(null);
            onSent();
          }}
        />
      ) : null}
    </View>
  );
}
