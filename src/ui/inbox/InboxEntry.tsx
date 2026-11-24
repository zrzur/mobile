import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { memo, type ReactNode } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { MENU_DELAY } from "@/ui/kit/ContextMenu";
import { PressableRow, PressScale } from "@/ui/kit/Press";
import { type SwipeAction, swipeA11y, SwipeRow } from "@/ui/kit/SwipeRow";
import { AText } from "@/ui/kit/Text";

import { filesSummary, placeParts } from "./place";

/** An icon button at the end of an entry (web: EntryAction, 44 px target) */
export function EntryAction({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.92}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? palette.navSelected : "transparent",
      })}
    >
      <Icon name={icon} size={20} color={palette.iconNeutral} />
    </PressScale>
  );
}

/**
 * One message in the saved list or the reminders (web: InboxEntry, phone
 * look): who wrote it, where, its words and its files, with its own icon
 * buttons at the end of the row. Tapping the row opens the message; a
 * swipe shows the same actions; a long press opens `onMenu`. A message
 * that is gone, or closed to the person, is one quiet line.
 *
 * [avatar] Name                         note   [action] [action]
 *          Server · #channel
 *          words of the message…
 *          [clip] file.png +2
 */
export const InboxEntry = memo(function InboxEntry({
  message,
  note,
  actions,
  swipe,
  first,
  onOpen,
  onMenu,
  testID,
}: {
  message: Message | undefined;
  /** short line at the end of the name row (a time) */
  note?: string;
  /** icon buttons at the end of the row */
  actions: ReactNode;
  /** the same actions as swipe buttons (toward the start) */
  swipe: SwipeAction[];
  first: boolean;
  onOpen: (message: Message) => void;
  onMenu?: () => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();

  const row = {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    paddingVertical: 12,
    paddingStart: 14,
    // the icon buttons sit in the padding, so the card keeps a mention's height
    paddingEnd: 4,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: palette.divider,
  };

  if (!message) {
    return (
      <SwipeRow end={swipe} fullEnd background={palette.field}>
        <View testID={testID} accessibilityLabel={t`This message is no longer available.`} {...swipeA11y(swipe)} style={[row, { alignItems: "center", backgroundColor: palette.field }]}>
          <View style={{ flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon name="eye-slash" size={20} color={palette.iconNeutral} />
            <AText size={14} line={20} color={palette.muted} style={{ flex: 1 }}>
              {t`This message is no longer available.`}
            </AText>
          </View>
          <View style={{ flexDirection: "row", marginVertical: -10 }}>{actions}</View>
        </View>
      </SwipeRow>
    );
  }

  const name = message.username ?? "…";
  const place = placeParts(message.channel ?? undefined, { directMessage: t`Direct message`, savedNotes: t`Saved notes` }).join(" · ");
  const words = message.content ? client.markdownToText(message.content) : "";
  const files = filesSummary(message.attachments ?? undefined, t`File`);

  return (
    <SwipeRow end={swipe} fullEnd={false} background={palette.field}>
      <PressableRow
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={[name, note, place, words].filter(Boolean).join(", ")}
        highlight={palette.navSelected}
        onPress={() => onOpen(message)}
        onLongPress={onMenu}
        delayLongPress={MENU_DELAY}
        {...swipeA11y(swipe, onMenu ? [{ name: "longpress" }] : [], (n) => n === "longpress" && onMenu?.())}
        style={[row, { backgroundColor: palette.field }]}
      >
        <Avatar url={message.avatarURL} name={name} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AText autoDir size={15} line={20} weight="semibold" color={message.roleColour ?? palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </AText>
            {note ? (
              <AText size={12} line={16} color={palette.muted} numberOfLines={1}>
                {note}
              </AText>
            ) : null}
          </View>
          {place ? (
            <AText size={13} line={18} color={palette.muted} numberOfLines={1}>
              {place}
            </AText>
          ) : null}
          {words ? (
            <AText autoDir autoAlign size={14} line={20} color={palette.fg2} numberOfLines={2}>
              {words}
            </AText>
          ) : null}
          {files ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Icon name="paperclip" size={16} color={palette.iconNeutral} />
              <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                {files.first}
              </AText>
              {files.more ? (
                <AText size={13} line={18} color={palette.muted}>
                  {`+${files.more}`}
                </AText>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", marginVertical: -10 }}>{actions}</View>
      </PressableRow>
    </SwipeRow>
  );
});
