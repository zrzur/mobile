import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { emojiUrl } from "@/chat/MessageContent";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";
import { channelRoute } from "@/ui/forum/channelRoute";
import { canSubmitThread, CUSTOM_EMOJI, toggleTag, validTagEmoji } from "@/ui/forum/tags";
import { Pill, PillRow, SheetField } from "@/ui/search/parts";

import { closeStartThread, newHostToken, registerHost, startThreadRequest, subscribeStartThread, topHost, type StartThreadRequest } from "./startThread";

/** A forum tag's emoji: a Unicode emoji, or a custom emoji picture */
export function TagEmoji({ emoji, size = 16 }: { emoji?: string | null; size?: number }) {
  const client = useClient();
  const { palette } = useTheme();
  const valid = validTagEmoji(emoji);
  if (!valid) return null;
  if (CUSTOM_EMOJI.test(valid)) {
    const uri = emojiUrl(client.configuration?.features?.autumn?.url, valid);
    return uri ? <Image source={{ uri }} style={{ width: size, height: size }} cachePolicy="memory-disk" accessibilityIgnoresInvertColors /> : null;
  }
  return (
    <AText size={size - 2} line={size + 2} color={palette.fg}>
      {valid}
    </AText>
  );
}

/**
 * Draws the start-thread sheet when `startThread(channelId, …)` asks for this
 * channel. Mount one per screen that shows the channel (the header actions,
 * the threads tab and the forum mount it already).
 */
export function StartThreadHost({ channelId }: { channelId: string }) {
  const [token] = useState(newHostToken);
  useEffect(() => registerHost(token, channelId), [token, channelId]);
  const readTop = useCallback(() => topHost(channelId), [channelId]);
  const top = useSyncExternalStore(subscribeStartThread, readTop, readTop);
  const request = useSyncExternalStore(subscribeStartThread, startThreadRequest, startThreadRequest);
  const mine = top === token && request && request.channelId === channelId ? request : null;
  const channel = useChannel(mine?.channelId);
  if (!mine || !channel) return null;
  // a new request starts a new form
  return <StartThreadSheet key={`${mine.channelId}:${mine.messageId ?? ""}:${mine.name ?? ""}`} channel={channel} request={mine} />;
}

/**
 * Start a thread in a channel (from a message, or with a first message), or a
 * post in a forum: a title, the first message and its tags (web: CreateThread)
 */
function StartThreadSheet({ channel, request }: { channel: Channel; request: StartThreadRequest }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const forum = useFields(channel, (c) => (c.forum ? { tags: c.forum.tags.map((tag) => ({ id: tag.id, name: tag.name, emoji: tag.emoji ?? undefined })), requireTag: c.forum.requireTag } : null));
  const [name, setName] = useState(request.name ?? "");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromMessage = !!request.messageId;
  const ready = canSubmitThread({ name, content, tags }, forum ?? undefined) && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const text = content.trim();
      const thread = await channel.createThread({
        name: name.trim(),
        message: request.messageId,
        content: text || undefined,
        tags: forum ? tags : undefined,
      });
      closeStartThread();
      router.push(channelRoute({ id: thread.id, isThread: true }));
    } catch (err) {
      // shown under the fields, so nothing typed is lost
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <SheetModal visible onClose={closeStartThread} testID="start-thread-sheet" handleOnly maxShare={0.88} dismissible={!busy}>
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginBottom: 12 }} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }} keyboardShouldPersistTaps="handled" bounces={false}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name={forum ? "note-pencil" : "chat-circle"} size={22} color={palette.iconNeutral} />
                <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
                  {forum ? t`New post` : t`Start a thread`}
                </AText>
              </View>
              <SheetField testID="start-thread-name" label={forum ? t`Title` : t`Thread name`} value={name} onChange={setName} max={100} autoFocus={!name} />
              {!fromMessage ? (
                <SheetField testID="start-thread-content" label={forum ? t`Post text` : t`First message (optional)`} value={content} onChange={setContent} max={2000} lines={4} />
              ) : null}
              {forum?.tags.length ? (
                <View style={{ gap: 8 }} accessibilityRole="none">
                  <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                    {forum.requireTag ? t`Tags (choose at least one)` : t`Tags`}
                  </AText>
                  <PillRow label={t`Tags`} wrap>
                    {forum.tags.map((tag) => (
                      <Pill
                        key={tag.id}
                        testID={`start-thread-tag-${tag.id}`}
                        label={tag.name}
                        on={tags.includes(tag.id)}
                        leading={<TagEmoji emoji={tag.emoji} size={16} />}
                        onPress={() => setTags((list) => toggleTag(list, tag.id))}
                      />
                    ))}
                  </PillRow>
                </View>
              ) : null}
              {error ? (
                <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
                  <Icon name="warning-circle" size={20} color={palette.danger} />
                  <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                    {error}
                  </AText>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                <Button testID="start-thread-cancel" variant="ghost" label={t`Cancel`} onPress={closeStartThread} disabled={busy} />
                <Button
                  testID="start-thread-submit"
                  label={forum ? t`Post` : t`Start thread`}
                  onPress={() => void submit()}
                  disabled={!busy && !ready}
                  status={busy ? "submitting" : "ready"}
                />
              </View>
            </ScrollView>
    </SheetModal>
  );
}
