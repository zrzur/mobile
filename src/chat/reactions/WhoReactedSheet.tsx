import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { autoDirStyle } from "@/ui/kit/bidi";
import { haptics } from "@/ui/kit/haptics";
import { useOpenProfile } from "@/ui/profile/store";

import { emojiUrl } from "../MessageContent";
import { RText, RichSheet, SheetButton, withAlpha } from "../rich/parts";
import { canRemove, isCustomEmoji, pickGroup, reactionGroups, reactionPath } from "./logic";

/** Run once the sheet has slid away (one modal at a time on iOS) */
const afterSheet = (fn: () => void) => setTimeout(fn, 280);

function ReactionEmoji({ emoji, size }: { emoji: string; size: number }) {
  const client = useClient();
  const cdn = client.configuration?.features?.autumn?.url;
  if (isCustomEmoji(emoji)) {
    return <Image source={{ uri: emojiUrl(cdn, emoji) }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="memory-disk" />;
  }
  return (
    <Text style={{ fontSize: size - 2, lineHeight: size }} allowFontScaling={false}>
      {emoji}
    </Text>
  );
}

/**
 * Who reacted (gap row 37; the web shows it in a tooltip on hover): a hold
 * on a reaction chip opens this sheet. One tab per reaction with its count,
 * the people who chose it (tap: their profile), "Remove reaction" on your
 * own row, and on everyone's for people who can manage messages, who also
 * get "Remove all reactions".
 */
export function WhoReactedSheet({ message, emoji, selfId, serverId, onClose }: { message: Message; emoji?: string; selfId?: string; serverId?: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const openProfile = useOpenProfile();
  const [tab, setTab] = useState(emoji);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const groups = useFields(message, (m) => reactionGroups([...m.reactions.entries()], selfId), [selfId]) ?? [];
  const manage = useFields(message, (m) => !!m.channel?.havePermission("ManageMessages")) ?? false;
  const group = pickGroup(groups, tab);
  const people = useFields(
    message,
    (m) =>
      (group?.users ?? []).map((id) => {
        const user = client.users.get(id);
        const nick = serverId ? client.serverMembers.getByKey({ server: serverId, user: id })?.nickname : undefined;
        return { id, name: nick ?? user?.displayName ?? user?.username ?? "…", avatar: user?.animatedAvatarURL, known: !!user, channel: m.channelId };
      }),
    [group?.emoji, group?.users.join(","), serverId],
  );

  // people not loaded yet are fetched once
  const missing = (people ?? []).filter((p) => !p.known).map((p) => p.id).join(",");
  useEffect(() => {
    if (!missing) return;
    for (const id of missing.split(",")) void client.users.fetch(id).catch(() => undefined);
  }, [client, missing]);

  // the last reaction gone: nothing left to show
  useEffect(() => {
    if (!groups.length) onClose();
  }, [groups.length, onClose]);

  const remove = async (userId: string) => {
    if (!group) return;
    setBusy(userId);
    setError(undefined);
    try {
      if (userId === selfId) await message.unreact(group.emoji);
      else await client.api.delete(reactionPath(message.channelId, message.id, group.emoji) as never, { user_id: userId } as never);
      haptics.light();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(undefined);
    }
  };

  const removeAll = async () => {
    setBusy("*");
    setError(undefined);
    try {
      await message.clearReactions();
      haptics.light();
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <RichSheet visible onClose={onClose} testID="who-reacted-sheet">
      <View style={{ paddingHorizontal: 16, gap: 12, flexShrink: 1 }}>
        <RText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
          {t`Reactions`}
        </RText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {groups.map((g) => {
            const on = g.emoji === group?.emoji;
            return (
              <Pressable
                key={g.emoji}
                testID={`who-reacted-tab-${g.emoji}`}
                accessibilityRole="tab"
                accessibilityLabel={`${g.emoji} ${g.users.length}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptics.selection();
                  setTab(g.emoji);
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? palette.accent : palette.borderSubtle,
                  backgroundColor: on ? withAlpha(palette.accent, 0.16) : pressed ? palette.navSelected : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                })}
              >
                <ReactionEmoji emoji={g.emoji} size={20} />
                <RText size={14} line={20} weight="semibold" color={on ? palette.accentText : palette.fg2} style={{ fontVariant: ["tabular-nums"] }}>
                  {String(g.users.length)}
                </RText>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          accessibilityRole="list"
          style={{ maxHeight: 360, borderRadius: 10, borderWidth: 1, borderColor: palette.borderSubtle }}
          contentContainerStyle={{ padding: 12, gap: 4 }}
        >
          {(people ?? []).map((p) => (
            <View key={p.id} testID={`who-reacted-${p.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p.name}
                onPress={() => {
                  onClose();
                  afterSheet(() => openProfile(p.id, serverId));
                }}
                style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, opacity: pressed ? 0.7 : 1 })}
              >
                <Avatar url={p.avatar} name={p.name} size={32} />
                <RText size={15} line={20} weight="medium" color={palette.fg} numberOfLines={1} style={[{ flex: 1 }, autoDirStyle(p.name)]}>
                  {p.name}
                </RText>
              </Pressable>
              {canRemove(p.id, selfId, manage) ? (
                <Pressable
                  testID={`who-reacted-remove-${p.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t`Remove reaction`}
                  disabled={!!busy}
                  onPress={() => void remove(p.id)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    justifyContent: "center",
                    opacity: busy === p.id ? 0.5 : 1,
                    backgroundColor: pressed ? palette.navSelected : "transparent",
                  })}
                >
                  <RText size={14} line={20} weight="semibold" color={palette.danger}>
                    {t`Remove reaction`}
                  </RText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
        {error ? (
          <RText size={13} line={18} color={palette.danger} accessibilityRole="alert">
            {error}
          </RText>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {manage ? <SheetButton testID="who-reacted-remove-all" label={t`Remove all reactions`} disabled={!!busy} onPress={() => void removeAll()} /> : null}
          <SheetButton label={t`Close`} onPress={onClose} />
        </View>
      </View>
    </RichSheet>
  );
}
