import { Trans, useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import type { Channel, Message } from "@zrzur/sdk/solid";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { describeError } from "@/auth/errorText";
import { forwardTargets, type TargetLike } from "@/chat/forward";
import { showToast } from "@/chat/overlays";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import type { Palette } from "@/theme/palette";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader, SearchField } from "@/ui/app/parts";
import { channelIcon } from "@/ui/app/ServerPanel";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Button, KeyboardSafeScreen, keyboardScrollProps } from "@/ui/kit";

type Target = TargetLike & { avatar?: string; place: string; channel: Channel };

/** Longest note the server takes (web: NOTE_MAX) */
const NOTE_MAX = 1000;

/** A new key per try: the server sends once per key (web: idempotencyKey) */
const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** One destination (web: ForwardMessage Option): 48 px, selected = raised with an accent ring and a check */
const TargetRow = memo(function TargetRow({ item, on, palette, onSelect }: { item: Target; on: boolean; palette: Palette; onSelect: (id: string) => void }) {
  const mark = on ? palette.accent : palette.iconMuted;
  return (
    <Pressable
      testID={`forward-target-${item.id}`}
      accessibilityRole="radio"
      accessibilityLabel={`${item.name}, ${item.place}`}
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={() => onSelect(item.id)}
      style={({ pressed }) => ({
        minHeight: 48,
        marginBottom: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 2,
        borderColor: on ? palette.accent : "transparent",
        backgroundColor: on ? palette.navSelected : pressed ? palette.navHover : "transparent",
      })}
    >
      {item.type === "TextChannel" || item.type === "SavedMessages" ? (
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: palette.tonal, alignItems: "center", justifyContent: "center" }}>
          <Icon name={item.type === "SavedMessages" ? "notebook" : channelIcon(item.channel)} size={20} color={mark} />
        </View>
      ) : (
        <Avatar url={item.avatar} name={item.name} size={32} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
          {item.name}
        </AText>
        {item.place ? (
          <AText autoDir size={12} line={16} color={palette.muted} numberOfLines={1}>
            {item.place}
          </AText>
        ) : null}
      </View>
      {on ? <Icon name="check" size={20} color={palette.accent} /> : null}
    </Pressable>
  );
});

/**
 * Forward a message (web: modals/ForwardMessage): pick a conversation or
 * channel, add a note, send a copy. Nobody it mentions is notified.
 * `channel` (optional) lets a fresh load fetch the message.
 */
export default function ForwardScreen() {
  const { messageId, channel: channelId } = useLocalSearchParams<{ messageId: string; channel?: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const cached = useSolid(useCallback(() => client.messages.get(messageId), [client, messageId]));
  // the channel list fills in after the first sync: read its size so the list appears then
  const ready = useSolid(useCallback(() => (client.ready() ? 1 : 0) + client.channels.size(), [client]));
  const source = useSolid(useCallback(() => (channelId ? client.channels.get(channelId) : undefined), [client, channelId]));
  const [fetched, setFetched] = useState<Message | null>();
  const message = cached ?? fetched ?? undefined;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());

  // opened from a link: the message is not in memory yet
  useEffect(() => {
    if (cached || !source) return;
    let alive = true;
    source
      .fetchMessage(messageId)
      .then((m) => alive && setFetched(m))
      .catch(() => alive && setFetched(null));
    return () => {
      alive = false;
    };
  }, [cached, source, messageId]);
  const missing = !message && (fetched === null || (!channelId && ready > 0) || (!!channelId && ready > 0 && !source));

  const label = useCallback(
    (c: Channel) => (c.type === "SavedMessages" ? t`Saved notes` : c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.displayName ?? c.name ?? "")),
    [t],
  );
  const place = useCallback(
    (c: Channel) => {
      switch (c.type) {
        case "DirectMessage":
          return t`Direct message`;
        case "Group":
          return t`Group`;
        case "SavedMessages":
          return t`Only you`;
        default:
          return c.server?.name ?? "";
      }
    },
    [t],
  );

  // the list is read once per search (and once the channels arrive): new
  // messages elsewhere don't reorder it under the finger
  const targets = useMemo(() => {
    void ready;
    const sourceMature = !!message?.channel?.mature || !!message?.server?.mature;
    const all: Target[] = client.channels.toList().map((c) => ({
      id: c.id,
      type: c.type,
      name: label(c),
      place: place(c),
      serverName: c.server?.name,
      serverMature: c.server?.mature,
      active: c.type !== "DirectMessage" || !!c.active,
      isForum: !!(c as unknown as { isForum?: boolean }).isForum,
      mature: c.mature,
      updatedAt: c.updatedAt.getTime(),
      canSend: c.type === "SavedMessages" || c.type === "DirectMessage" || c.type === "Group" || (c.type === "TextChannel" && !c.isVoiceRoom && c.havePermission("SendMessage")),
      avatar: c.type === "DirectMessage" ? c.recipient?.avatarURL : c.type === "Group" ? c.iconURL : undefined,
      channel: c,
    }));
    return forwardTargets(all, query, sourceMature);
  }, [client, message, query, label, place, ready]);

  const chosen = targets.find((x) => x.id === selected);
  const preview = (message?.content ?? "").trim() || (message?.attachments?.length ? t`Files only` : t`Embed only`);
  const author = message?.username ?? message?.author?.displayName ?? message?.author?.username;

  async function send() {
    if (!message || !chosen || sending) return;
    setSending(true);
    setError(null);
    try {
      await message.forward(chosen.channel, note.trim() || undefined, key.current);
      showToast(t`Forwarded to ${label(chosen.channel)}`);
      router.back();
    } catch (err) {
      // a refusal from the server: the next try is a new request
      if (!(err instanceof TypeError)) key.current = newKey();
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardSafeScreen inset={insets.bottom}>
        <ScreenHeader back modal>
          <AText size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
            {t`Forward message`}
          </AText>
        </ScreenHeader>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 16 }}>
          <AText size={14} line={20} color={palette.fg2}>
            <Trans>A copy goes to the place you choose. Nobody it mentions is notified.</Trans>
          </AText>
          <View
            testID="forward-preview"
            style={{
              padding: 12,
              gap: 4,
              borderRadius: RADIUS,
              backgroundColor: palette.field,
              borderWidth: 1,
              borderColor: palette.borderSubtle,
              borderStartWidth: 4,
              borderStartColor: palette.borderStrong,
            }}
          >
            {message ? (
              <>
                {author ? (
                  <AText autoDir size={12} line={16} weight="semibold" color={palette.muted} numberOfLines={1}>
                    {author}
                  </AText>
                ) : null}
                <AText autoDir autoAlign size={14} line={20} color={palette.fg} numberOfLines={2}>
                  {preview}
                </AText>
              </>
            ) : missing ? (
              <AText size={14} line={20} color={palette.muted}>
                {t`It was deleted, or you can no longer see it.`}
              </AText>
            ) : (
              <ActivityIndicator size="small" color={palette.muted} accessibilityLabel={t`Loading…`} style={{ alignSelf: "flex-start" }} />
            )}
          </View>
          <View style={{ flexDirection: "row" }}>
            <SearchField value={query} onChange={setQuery} placeholder={t`Search conversations and channels`} testID="forward-search" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          {targets.length === 0 ? (
            ready === 0 ? (
              <ActivityIndicator size="small" color={palette.muted} accessibilityLabel={t`Loading…`} style={{ padding: 24 }} />
            ) : (
              <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center", padding: 24 }}>
                <Trans>Nothing found. Try another name.</Trans>
              </AText>
            )
          ) : (
            <FlashList
              testID="forward-targets"
              data={targets}
              keyExtractor={(x) => x.id}
              {...keyboardScrollProps}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              extraData={selected}
              renderItem={({ item }) => <TargetRow item={item} on={item.id === selected} palette={palette} onSelect={setSelected} />}
            />
          )}
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderTopWidth: 1, borderTopColor: palette.borderSubtle }}>
          <TextField
            testID="forward-note"
            label={t`Add a note (optional)`}
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX}
            multiline
            style={{ maxHeight: 120 }}
          />
          {error ? (
            <AText size={14} line={20} color={palette.danger} accessibilityRole="alert">
              {error}
            </AText>
          ) : null}
          <Button testID="forward-send" label={t`Forward`} fill disabled={!chosen || !message} status={sending ? "submitting" : "ready"} onPress={send} />
        </View>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}
