import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { memo, type ReactElement, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { relativeParts } from "@/chat/rich/poll";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";
import { EmptyState, Pill, PillRow, ReasonNote, TextButton } from "@/ui/search/parts";
import { ChannelHeaderActions } from "@/ui/threads/ChannelHeaderActions";
import { startThread } from "@/ui/threads/startThread";
import { StartThreadHost, TagEmoji } from "@/ui/threads/StartThreadSheet";
import { startAccess } from "@/ui/threads/threadAccess";

import { channelRoute } from "./channelRoute";
import { activity, forumPosts } from "./posts";

type TagInfo = { id: string; name: string; emoji?: string };

/** "19 days ago" (web: dayjs fromNow on the post card) */
function agoText(locale: string, date: Date, now = Date.now()) {
  const rel = relativeParts(date.getTime() - now);
  return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" }).format(rel.value, rel.unit);
}

const PostRow = memo(function PostRow({ id, tags }: { id: string; tags: TagInfo[] }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const post = useChannel(id);
  const f = useFields(post, (c) => ({
    name: c.name ?? "",
    locked: !!c.thread?.locked,
    count: c.thread?.messageCount ?? 0,
    tags: c.thread?.tags ?? [],
    at: activity({ id: c.id, lastMessageId: c.lastMessageId }),
  }));
  if (!f) return null;
  const count = f.count;
  return (
    <Pressable
      testID={`forum-post-${id}`}
      accessibilityRole="button"
      onPress={() => router.push(channelRoute({ id, isThread: true }))}
      style={({ pressed }) => ({
        marginHorizontal: 16,
        marginBottom: 8,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        gap: 4,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: pressed ? palette.navSelected : palette.field,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {f.locked ? <Icon name="lock-simple" size={14} color={palette.iconMuted} /> : null}
        <AText autoDir size={16} line={22} weight="semibold" color={palette.fg} numberOfLines={2} style={{ flexShrink: 1 }}>
          {f.name}
        </AText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {f.tags.map((tagId) => {
          const tag = tags.find((entry) => entry.id === tagId);
          if (!tag) return null;
          return (
            <View key={tagId} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, minHeight: 24, borderRadius: 999, backgroundColor: palette.tonal }}>
              <TagEmoji emoji={tag.emoji} size={14} />
              <AText size={12} line={16} weight="medium" color={palette.fg}>
                {tag.name}
              </AText>
            </View>
          );
        })}
        <AText size={13} line={18} color={palette.muted}>
          {t`${plural(count, { one: "# message", other: "# messages" })}`}
        </AText>
        {f.at ? (
          <AText size={13} line={18} color={palette.muted}>
            {`· ${agoText(i18n.locale, new Date(f.at))}`}
          </AText>
        ) : null}
      </View>
    </Pressable>
  );
});

/**
 * A forum (web: ForumChannel): posts (threads with a title and tags), the
 * most recently active first. One primary action, New post; tags and
 * Archived filter the list.
 */
export function ForumScreen({ id }: { id: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const channel = useChannel(id);
  const head = useFields(channel, (c) => ({
    name: c.name ?? "",
    access: startAccess(c),
    tags: (c.forum?.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name, emoji: tag.emoji ?? undefined })),
  }));
  const [archived, setArchived] = useState(false);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${id}:${archived}:${attempt}`;
  const [state, setState] = useState<{ key: string; status: "loading" | "error" | "done" }>({ key: "", status: "loading" });

  useEffect(() => {
    if (!channel) return;
    let alive = true;
    channel
      .fetchThreads({ archived, limit: 100 })
      .then(() => alive && setState({ key: loadKey, status: "done" }))
      .catch(() => alive && setState({ key: loadKey, status: "error" }));
    return () => {
      alive = false;
    };
  }, [channel, archived, loadKey]);
  const status = state.key === loadKey ? state.status : "loading";

  const joined = useSolid(
    useCallback(
      () =>
        forumPosts(client.channels.toList(), id, { archived, tag })
          .map((c) => c.id)
          .join(","),
      [client, id, archived, tag],
    ),
  );
  const ids = joined ? joined.split(",") : [];
  const tags = head?.tags ?? [];

  const top = (
    <View style={{ gap: 8, paddingTop: 12, paddingBottom: 8 }}>
      {head?.access === "allowed" ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ alignSelf: "flex-start" }}>
            <Button testID="forum-new-post" icon="plus" label={t`New post`} onPress={() => startThread(id)} />
          </View>
        </View>
      ) : null}
      <PillRow label={t`Filter posts`}>
        <Pill testID="forum-tag-all" label={t`All`} on={!tag} onPress={() => setTag(undefined)} />
        {tags.map((entry) => (
          <Pill
            key={entry.id}
            testID={`forum-tag-${entry.id}`}
            label={entry.name}
            on={tag === entry.id}
            leading={<TagEmoji emoji={entry.emoji} size={16} />}
            onPress={() => setTag(tag === entry.id ? undefined : entry.id)}
          />
        ))}
        <Pill testID="forum-archived" label={t`Archived`} icon="archive" on={archived} onPress={() => setArchived(!archived)} />
      </PillRow>
      {head?.access === "switched-off" ? <ReasonNote>{t`Forums are off in this server. You can still read the posts.`}</ReasonNote> : null}
      {head?.access === "no-permission" ? <ReasonNote>{t`You can't start posts in this forum.`}</ReasonNote> : null}
    </View>
  );

  let empty: ReactElement | null = null;
  if (!ids.length) {
    if (status === "loading") empty = <ActivityIndicator color={palette.accent} style={{ marginTop: 32 }} accessibilityLabel={t`Loading…`} />;
    else if (status === "error")
      empty = <EmptyState icon="warning-circle" title={t`Posts couldn't be loaded.`} action={<TextButton testID="forum-retry" label={t`Try again`} onPress={() => setAttempt((n) => n + 1)} />} />;
    else
      empty = (
        <EmptyState
          testID="forum-empty"
          icon="note-pencil"
          title={archived || tag ? t`Nothing matches this filter.` : head?.access === "allowed" ? t`No posts yet. Start the first one.` : t`No posts yet.`}
        />
      );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <Pressable
          testID="forum-title"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/channel-details/[id]", params: { id } })}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
        >
          <Icon name="note-pencil" size={18} color={palette.iconMuted} />
          <AText autoDir size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }}>
            {head?.name ?? ""}
          </AText>
        </Pressable>
        <ChannelHeaderActions channelId={id} />
      </ScreenHeader>
      <FlashList
        testID="forum-posts"
        data={ids}
        keyExtractor={(postId) => postId}
        extraData={tags}
        ListHeaderComponent={top}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => <PostRow id={item} tags={tags} />}
      />
      <StartThreadHost channelId={id} />
    </SafeAreaView>
  );
}
