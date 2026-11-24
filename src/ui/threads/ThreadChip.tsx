import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { channelRoute } from "@/ui/forum/channelRoute";

import { startThread, threadNameFrom } from "./startThread";
import { startAccess } from "./threadAccess";

/** The thread started from a message, as plain fields (re-renders when it changes) */
function useThreadOf(channelId: string, messageId: string) {
  const client = useClient();
  const key = useSolid(
    useCallback(() => {
      const thread = client.channels.get(channelId)?.threadOf(messageId);
      if (!thread) return "";
      return JSON.stringify([thread.id, thread.name ?? "", thread.thread?.messageCount ?? 0, !!thread.thread?.archived]);
    }, [client, channelId, messageId]),
  );
  if (!key) return null;
  const [id, name, count, archived] = JSON.parse(key) as [string, string, number, boolean];
  return { id, name, count, archived };
}

/**
 * Under a message that started a thread: the thread's name and how many
 * messages it has; opens the thread (web: ThreadChip). Place it after the
 * message's reactions.
 */
export function ThreadChip({ channelId, messageId }: { channelId: string; messageId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const thread = useThreadOf(channelId, messageId);
  if (!thread) return null;
  const count = thread.count;
  return (
    <Pressable
      testID={`thread-chip-${messageId}`}
      accessibilityRole="button"
      onPress={() => router.push(channelRoute({ id: thread.id, isThread: true }))}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        maxWidth: "100%",
        marginTop: 4,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: pressed ? palette.navSelected : palette.field,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      })}
    >
      <Icon name="chat-circle" size={16} color={palette.link} />
      <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
        {thread.name}
      </AText>
      <View style={{ flexDirection: "row", gap: 4 }}>
        <AText size={13} line={18} color={palette.muted}>
          {t`${plural(count, { one: "# message", other: "# messages" })}`}
        </AText>
        {thread.archived ? (
          <AText size={13} line={18} color={palette.muted}>
            {`· ${t`archived`}`}
          </AText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Whether a thread can start from this message (web: MessageContextMenu canThread) */
export function canStartThreadFrom(message: Message) {
  const channel = message.channel;
  return !!channel && channel.type === "TextChannel" && !channel.isVoice && !channel.isThread && !channel.isForum && startAccess(channel) === "allowed";
}

/**
 * The thread row of a message's long-press sheet: "Open thread" when one
 * started from it, else "Start thread" when allowed. `onClose` closes the
 * message sheet first (one modal at a time).
 */
export function ThreadMenuRow({ message, onClose, first }: { message: Message; onClose: () => void; first?: boolean }) {
  const { t } = useLingui();
  const thread = useThreadOf(message.channelId, message.id);
  if (thread) {
    return (
      <GroupRow
        first={first}
        testID="message-open-thread"
        icon="chat-circle"
        label={t`Open thread`}
        onPress={() => {
          onClose();
          router.push(channelRoute({ id: thread.id, isThread: true }));
        }}
      />
    );
  }
  if (!canStartThreadFrom(message)) return null;
  return (
    <GroupRow
      first={first}
      testID="message-start-thread"
      icon="chat-circle"
      label={t`Start thread`}
      onPress={() => {
        onClose();
        // after the message sheet has gone
        setTimeout(() => startThread(message.channelId, message.id, threadNameFrom(message.content)), 250);
      }}
    />
  );
}
