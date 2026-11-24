import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import type { File, Message } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, type ReactElement, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, useWindowDimensions, View } from "react-native";

import { useChannel } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { channelRoute } from "@/ui/forum/channelRoute";

import { findFiles, findLinks, type FindsKind, findsHas, host, mergeNewest } from "./finds";
import { EmptyState, TextButton } from "./parts";

type Item =
  | { kind: "media"; key: string; messageId: string; preview: string; video: boolean }
  | { kind: "file"; key: string; messageId: string; name?: string; size?: string; who: string }
  | { kind: "link"; key: string; messageId: string; url: string; title: string; image?: string; who: string };

const who = (message: Message) => message.masquerade?.name ?? message.webhook?.name ?? message.member?.displayName ?? message.author?.displayName ?? message.author?.username ?? "";

function toItems(kind: FindsKind, messages: Message[]): Item[] {
  if (kind === "media")
    return findFiles<File, Message>(messages, true).map(({ message, file }) => ({
      kind: "media",
      key: `${message.id}:${file.id}`,
      messageId: message.id,
      preview: file.previewUrl,
      video: file.metadata?.type === "Video",
    }));
  if (kind === "files")
    return findFiles<File, Message>(messages, false).map(({ message, file }) => ({
      kind: "file",
      key: `${message.id}:${file.id}`,
      messageId: message.id,
      name: file.filename,
      size: file.humanReadableSize,
      who: who(message),
    }));
  return findLinks(messages).map((link, i) => ({
    kind: "link",
    key: `${link.message.id}:${i}:${link.url}`,
    messageId: link.message.id,
    url: link.url,
    title: link.title ?? link.siteName ?? host(link.url),
    image: link.image,
    who: who(link.message),
  }));
}

const Tile = memo(function Tile({ item, size, onOpen }: { item: Item; size: number; onOpen: (messageId: string) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  if (item.kind === "media") {
    return (
      <Pressable
        testID={`finds-media-${item.key}`}
        accessibilityRole="imagebutton"
        accessibilityLabel={t`Jump to message`}
        onPress={() => onOpen(item.messageId)}
        style={{ width: size, height: size, padding: 2 }}
      >
        <Image source={{ uri: item.preview }} style={{ flex: 1, borderRadius: 4, backgroundColor: palette.field }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.key} />
        {item.video ? (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.scrim, alignItems: "center", justifyContent: "center" }}>
              <Icon name="play" size={22} color="#FFFFFF" />
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  }
  return (
    <View style={{ width: size, padding: 4 }}>
      <Pressable
        testID={`finds-${item.kind}-${item.key}`}
        accessibilityRole="button"
        onPress={() => onOpen(item.messageId)}
        style={({ pressed }) => ({ borderRadius: 14, overflow: "hidden", backgroundColor: pressed ? palette.navSelected : palette.field })}
      >
        {item.kind === "link" ? (
          item.image ? (
            <Image source={{ uri: item.image }} style={{ width: "100%", height: 84 }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.key} />
          ) : (
            <View style={{ height: 84, alignItems: "center", justifyContent: "center", backgroundColor: palette.navSelected }}>
              <Icon name="link" size={26} color={palette.iconMuted} />
            </View>
          )
        ) : null}
        <View style={{ padding: 12, gap: 4 }}>
          {item.kind === "file" ? <Icon name="file-text" size={26} color={palette.iconNeutral} /> : null}
          <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={2}>
            {item.kind === "file" ? (item.name ?? t`File`) : item.title}
          </AText>
          {item.kind === "link" ? (
            <AText size={12} line={16} color={palette.link} numberOfLines={1} style={{ writingDirection: "ltr" }}>
              {host(item.url)}
            </AText>
          ) : item.size ? (
            <AText size={12} line={16} color={palette.muted} numberOfLines={1} style={{ writingDirection: "ltr" }}>
              {item.size}
            </AText>
          ) : null}
          <AText autoDir size={12} line={16} color={palette.muted} numberOfLines={1}>
            {item.who}
          </AText>
        </View>
      </Pressable>
    </View>
  );
});

/**
 * Media, links or files of a channel (web: ChannelDetailsPhone Finds): the
 * channel's search with a "has" filter, newest first; pictures three in a
 * row, links and files as cards two in a row. A tap opens the message.
 */
export function FindsList({ channelId, kind, header }: { channelId: string; kind: FindsKind; header?: ReactElement }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const channel = useChannel(channelId);
  const [attempt, setAttempt] = useState(0);
  const [failedOnce, setFailedOnce] = useState(false);
  const key = `${channelId}:${kind}:${attempt}`;
  const [state, setState] = useState<{ key: string; status: "loading" | "error" | "done"; messages: Message[] }>({ key: "", status: "loading", messages: [] });

  useEffect(() => {
    if (!channel) return;
    let alive = true;
    // one request per kind: the search takes one "has" at a time on some servers
    Promise.all(findsHas(kind).map((has) => channel.searchWithUsers({ has: [has], sort: "Latest" }).then((r) => r.messages)))
      .then((lists) => alive && setState({ key, status: "done", messages: mergeNewest(lists) }))
      .catch(() => alive && setState({ key, status: "error", messages: [] }));
    return () => {
      alive = false;
    };
  }, [channel, kind, key]);
  const current = state.key === key ? state : { key, status: "loading" as const, messages: [] as Message[] };
  const items = useMemo(() => (current.status === "done" ? toItems(kind, current.messages) : []), [current.status, current.messages, kind]);

  const thread = !!channel?.isThread;
  const open = (messageId: string) => router.push(channelRoute({ id: channelId, isThread: thread }, messageId));
  const columns = kind === "media" ? 3 : 2;
  const pad = kind === "media" ? 10 : 8;
  const size = Math.floor((Math.min(width, 768) - pad * 2) / columns);

  const empties: Record<FindsKind, { icon: IconName; title: string; text: string }> = {
    media: { icon: "image", title: t`No pictures or videos yet`, text: t`Pictures and videos sent in this channel show here.` },
    links: { icon: "link", title: t`No links yet`, text: t`Links sent in this channel show here.` },
    files: { icon: "file-text", title: t`No files yet`, text: t`Files sent in this channel show here.` },
  };
  const empty =
    current.status === "loading" ? (
      <ActivityIndicator color={palette.accent} style={{ marginTop: 32 }} accessibilityLabel={t`Loading…`} />
    ) : current.status === "error" ? (
      <EmptyState
        icon="warning-circle"
        title={t`This list couldn't be loaded`}
        text={t`Check your connection and try again.`}
        action={
          <View style={{ alignItems: "center" }}>
            <TextButton
              testID="finds-retry"
              label={t`Try again`}
              onPress={() => {
                setFailedOnce(true);
                setAttempt((n) => n + 1);
              }}
            />
            {failedOnce ? (
              <AText size={14} line={20} color={palette.muted} accessibilityRole="alert">
                {t`Still not loading.`}
              </AText>
            ) : null}
          </View>
        }
      />
    ) : (
      <EmptyState testID={`finds-empty-${kind}`} icon={empties[kind].icon} title={empties[kind].title} text={empties[kind].text} />
    );

  return (
    <FlashList
      testID={`finds-${kind}`}
      data={items}
      numColumns={columns}
      keyExtractor={(item) => item.key}
      // the shared head spans the page; the grid keeps its own edge
      ListHeaderComponent={header ? <View style={{ marginHorizontal: -pad, marginTop: -8, marginBottom: 8 }}>{header}</View> : null}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 8, paddingBottom: 32 }}
      renderItem={({ item }) => <Tile item={item} size={size} onOpen={open} />}
    />
  );
}
