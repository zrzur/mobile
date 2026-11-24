import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { AText, ContextMenu, copyToClipboard, GroupRow, haptics, Icon, MENU_DELAY, PressableRow, RowGroup, Sheet } from "@/ui/kit";

import { MessageContent } from "../MessageContent";
import { showToast } from "../overlays";
import type { OutboxEntry } from "./rules";
import { cancelSend, retrySend, useOutboxProgress } from "./store";

/** The line in place of the time (web: DraftMessage timestamp) */
function useStatusText(entry: OutboxEntry) {
  const { t } = useLingui();
  if (entry.status === "sending" || entry.status === "sent") return t`Sending...`;
  if (entry.status === "failed") return t`Failed to send`;
  // written without a connection: it goes out by itself
  return t`Waiting to send`;
}

/**
 * A message on its way, under the loaded messages (web: DraftMessage): your
 * avatar and name, "Sending…", "Waiting to send" or "Failed to send" where
 * the time goes, the text, the files with their upload progress and, when
 * the server refused it, why. Hold it for Retry sending, Copy text and
 * Delete message.
 */
export const OutboxRow = memo(function OutboxRow({ entry, channel, tail }: { entry: OutboxEntry; channel: Channel; tail?: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const me = useFields(client.user ?? undefined, (u) => ({ name: u.displayName ?? u.username, avatar: u.avatarURL }));
  const member = useFields(channel.server?.member ?? undefined, (m) => ({ nick: m.nickname, avatar: m.avatarURL }));
  const progress = useOutboxProgress(entry.key);
  const [menu, setMenu] = useState(false);
  const status = useStatusText(entry);
  const failed = entry.status === "failed";
  const waiting = entry.status === "unsent";
  const actionable = failed || waiting;
  const showHead = !tail || !!entry.replies?.length;
  const name = member?.nick ?? me?.name ?? "";

  return (
    <>
      <ContextMenu enabled={actionable} onOpen={() => setMenu(true)}>
        <PressableRow
          testID={`outbox-row-${entry.key}`}
          accessibilityRole={actionable ? "button" : undefined}
          accessibilityHint={actionable ? t`Hold for options` : undefined}
          highlight={palette.navHover}
          onLongPress={actionable ? () => setMenu(true) : undefined}
          delayLongPress={MENU_DELAY}
          style={{ flexDirection: "row", paddingVertical: showHead ? 2 : 1, marginTop: showHead ? 16 : 0, opacity: failed ? 1 : 0.6 }}
        >
          <View style={{ width: 48, alignItems: "flex-start" }}>{showHead ? <Avatar url={member?.avatar ?? me?.avatar} name={name} size={36} /> : null}</View>
          <View style={{ flex: 1, paddingEnd: 4 }}>
            {showHead ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20 }}>
                <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </AText>
                <AText testID="outbox-status" size={12} line={16} color={failed ? palette.danger : palette.muted} accessibilityLiveRegion="polite">
                  {status}
                </AText>
              </View>
            ) : (
              <AText size={12} line={16} color={failed ? palette.danger : palette.muted}>
                {status}
              </AText>
            )}
            {entry.content ? <MessageContent content={entry.content} serverId={channel.serverId || undefined} /> : null}
            {entry.files?.map((f, i) => (
              <View key={`${f.uri}-${i}`} style={{ marginTop: 4, gap: 4 }}>
                {f.type.startsWith("image/") ? (
                  <View style={{ width: 160, height: 120, borderRadius: 8, overflow: "hidden", backgroundColor: palette.field }}>
                    <Image source={{ uri: f.uri }} style={{ width: 160, height: 120 }} contentFit="cover" blurRadius={f.spoiler ? 28 : 0} accessibilityIgnoresInvertColors />
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="file" size={16} color={palette.iconNeutral} />
                    <AText autoDir size={13} line={18} color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
                      {f.name}
                    </AText>
                  </View>
                )}
              </View>
            ))}
            {progress !== undefined ? (
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={{ marginTop: 4, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, maxWidth: 240 }}>
                <View style={{ height: 4, borderRadius: 2, width: `${Math.round(progress * 100)}%`, backgroundColor: palette.accent }} />
              </View>
            ) : null}
            {failed && entry.error ? (
              <AText testID="outbox-error" size={13} line={18} color={palette.danger}>
                {describeError({ type: entry.error })}
              </AText>
            ) : null}
          </View>
        </PressableRow>
      </ContextMenu>
      <Sheet visible={menu} onClose={() => setMenu(false)} testID="outbox-menu">
        <RowGroup>
          <GroupRow
            first
            icon="arrow-clockwise"
            label={t`Retry sending`}
            testID="outbox-retry"
            onPress={() => {
              setMenu(false);
              haptics.light();
              retrySend(client, channel, entry.key);
            }}
          />
          {entry.content ? (
            <GroupRow
              icon="copy"
              label={t`Copy text`}
              testID="outbox-copy"
              onPress={() => {
                setMenu(false);
                void copyToClipboard(entry.content).then(() => showToast(t`Copied`));
              }}
            />
          ) : null}
        </RowGroup>
        <RowGroup>
          <GroupRow
            first
            danger
            icon="trash"
            label={t`Delete message`}
            testID="outbox-delete"
            onPress={() => {
              setMenu(false);
              cancelSend(channel.id, entry.key);
            }}
          />
        </RowGroup>
      </Sheet>
    </>
  );
});
