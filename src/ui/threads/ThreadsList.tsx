import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { memo, type ReactElement, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit";
import { channelRoute } from "@/ui/forum/channelRoute";
import { EmptyState, ReasonNote, Segmented, TextButton } from "@/ui/search/parts";

import { startThread } from "./startThread";
import { StartThreadHost } from "./StartThreadSheet";
import { startAccess } from "./threadAccess";

const ThreadRow = memo(function ThreadRow({ id }: { id: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(id);
  const f = useFields(channel, (c) => ({ name: c.name ?? "", locked: !!c.thread?.locked, count: c.thread?.messageCount ?? 0 }));
  if (!f) return null;
  const count = f.count;
  return (
    <Pressable
      testID={`thread-row-${id}`}
      accessibilityRole="button"
      onPress={() => router.push(channelRoute({ id, isThread: true }))}
      style={({ pressed }) => ({
        minHeight: 60,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        justifyContent: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: pressed ? palette.navSelected : palette.field,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {f.locked ? <Icon name="lock-simple" size={14} color={palette.iconMuted} /> : null}
        <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
          {f.name}
        </AText>
      </View>
      <AText size={13} line={18} color={palette.muted}>
        {t`${plural(count, { one: "# message", other: "# messages" })}`}
      </AText>
    </Pressable>
  );
});

/**
 * The threads of a text channel: active ones, or archived ones, and the one
 * action to start a new thread (web: ThreadsPanel). `header` goes above it in
 * the same scrolling list (the channel details screen's head and tabs).
 */
export function ThreadsList({ channelId, header }: { channelId: string; header?: ReactElement }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const opened = useChannel(channelId);
  // inside a thread, the list shows the threads of the channel it is in
  const parentId = useFields(opened, (c) => c.parentId ?? c.id);
  const channel = useChannel(parentId);
  const access = useFields(channel, (c) => startAccess(c));
  const [archived, setArchived] = useState(false);
  const [state, setState] = useState<{ key: string; status: "loading" | "error" | "done" }>({ key: "", status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadKey = `${parentId}:${archived}:${attempt}`;

  useEffect(() => {
    if (!channel) return;
    let alive = true;
    channel
      .fetchThreads({ archived })
      .then(() => alive && setState({ key: loadKey, status: "done" }))
      .catch(() => alive && setState({ key: loadKey, status: "error" }));
    return () => {
      alive = false;
    };
  }, [channel, archived, loadKey]);
  const status = state.key === loadKey ? state.status : "loading";

  /** threads known to this session (new ones arrive live), newest first */
  const joined = useSolid(
    useCallback(
      () =>
        client.channels
          .filter((c) => !!parentId && c.parentId === parentId && !!c.thread?.archived === archived)
          .map((c) => c.id)
          .sort((a, b) => b.localeCompare(a))
          .join(","),
      [client, parentId, archived],
    ),
  );
  const ids = joined ? joined.split(",") : [];

  const top = (
    <View>
      {header}
      {/* the button drops under the choices when both don't fit on one line */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
          <Segmented
            testID="threads-filter"
            label={t`Threads`}
            value={archived ? "archived" : "active"}
            onChange={(v) => setArchived(v === "archived")}
            options={[
              { value: "active", label: t`Active` },
              { value: "archived", label: t`Archived`, icon: "archive" },
            ]}
          />
        </View>
        {access === "allowed" && parentId ? (
          <Button testID="threads-new" variant="tonal" icon="plus" label={t`New thread`} onPress={() => startThread(parentId)} />
        ) : null}
      </View>
      {access === "switched-off" ? (
        <View style={{ paddingBottom: 12 }}>
          <ReasonNote>{t`Threads are off in this server. You can still read the ones it has.`}</ReasonNote>
        </View>
      ) : null}
    </View>
  );

  let empty: ReactElement | null = null;
  if (!ids.length) {
    if (status === "loading") empty = <ActivityIndicator color={palette.accent} style={{ marginTop: 32 }} accessibilityLabel={t`Loading…`} />;
    else if (status === "error")
      empty = (
        <EmptyState
          icon="warning-circle"
          title={t`Threads couldn't be loaded.`}
          action={<TextButton testID="threads-retry" label={t`Try again`} onPress={() => setAttempt((n) => n + 1)} />}
        />
      );
    else
      empty = archived ? (
        <EmptyState testID="threads-empty" icon="chat-circle" title={t`No archived threads`} text={t`Threads that were archived show here.`} />
      ) : (
        <EmptyState testID="threads-empty" icon="chat-circle" title={t`No threads yet`} text={t`Start one from a message, or with New thread.`} />
      );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        testID="threads-list"
        data={ids}
        keyExtractor={(id) => id}
        ListHeaderComponent={top}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => <ThreadRow id={item} />}
      />
      {parentId ? <StartThreadHost channelId={parentId} /> : null}
    </View>
  );
}
