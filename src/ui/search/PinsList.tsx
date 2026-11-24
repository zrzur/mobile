import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { memo, type ReactElement, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { MessageRow } from "@/chat/MessageRow";
import { useChannel, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { channelRoute } from "@/ui/forum/channelRoute";

import { EmptyState, TextButton } from "./parts";

const noop = () => {};

const PinnedMessage = memo(function PinnedMessage({ id, channelId, thread, selfId }: { id: string; channelId: string; thread: boolean; selfId?: string }) {
  const { t } = useLingui();
  return (
    <Pressable
      testID={`pin-${id}`}
      accessibilityRole="link"
      accessibilityLabel={t`Jump to message`}
      onPress={() => router.push(channelRoute({ id: channelId, isThread: thread }, id))}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingBottom: 8, opacity: pressed ? 0.7 : 1 })}
    >
      <View pointerEvents="none">
        <MessageRow id={id} tail={false} selfId={selfId} onLongPress={noop} />
      </View>
    </Pressable>
  );
});

/**
 * The channel's pinned messages, newest first (web: TextSearchSidebar with
 * `pinned: true`); a tap opens the message in its channel. `header` goes
 * above it in the same scrolling list.
 */
export function PinsList({ channelId, header }: { channelId: string; header?: ReactElement }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(channelId);
  const selfId = useSelfId();
  const [attempt, setAttempt] = useState(0);
  const key = `${channelId}:${attempt}`;
  const [state, setState] = useState<{ key: string; status: "loading" | "error" | "done"; ids: string[] }>({ key: "", status: "loading", ids: [] });

  useEffect(() => {
    if (!channel) return;
    let alive = true;
    channel
      .searchWithUsers({ pinned: true, sort: "Latest" } as never)
      .then(({ messages }) => alive && setState({ key, status: "done", ids: messages.map((m) => m.id) }))
      .catch(() => alive && setState({ key, status: "error", ids: [] }));
    return () => {
      alive = false;
    };
  }, [channel, key]);
  const current = state.key === key ? state : { key, status: "loading" as const, ids: [] };
  const thread = !!channel?.isThread;

  const empty =
    current.status === "loading" ? (
      <ActivityIndicator color={palette.accent} style={{ marginTop: 32 }} accessibilityLabel={t`Loading…`} />
    ) : current.status === "error" ? (
      <EmptyState
        icon="warning-circle"
        title={t`This list couldn't be loaded`}
        text={t`Check your connection and try again.`}
        action={<TextButton testID="pins-retry" label={t`Try again`} onPress={() => setAttempt((n) => n + 1)} />}
      />
    ) : (
      <EmptyState testID="pins-empty" icon="push-pin" title={t`No pinned messages yet`} text={t`Pin an important message from its menu to keep it here.`} />
    );

  return (
    <FlashList
      testID="pins-list"
      data={current.ids}
      keyExtractor={(id) => id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
      renderItem={({ item }) => <PinnedMessage id={item} channelId={channelId} thread={thread} selfId={selfId} />}
    />
  );
}
