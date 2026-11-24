import { useLingui } from "@lingui/react/macro";
import type { Channel, Client } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { memo, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { searchEmoji } from "@/ui/emoji/data";

import { customEmoji, mentionChannel, mentionRole, mentionUser, rank, type Trigger } from "./autocomplete";

export type Suggestion =
  | { kind: "user"; id: string; name: string; username: string; avatar?: string; insert: string }
  | { kind: "role"; id: string; name: string; colour?: string; insert: string }
  | { kind: "channel"; id: string; name: string; insert: string }
  | { kind: "emoji"; key: string; name: string; text?: string; url?: string; insert: string };

const LIMIT = 6;

/** What fits the typed word (web: autoComplete search space: server members, roles and channels, or the group's people) */
export function suggestionsFor(client: Client, channel: Channel, trigger: Trigger): Suggestion[] {
  const server = channel.server;
  if (trigger.operator === "@") {
    const people: Suggestion[] = [];
    if (server) {
      const members = client.serverMembers.filter((m) => m.id.server === server.id && !!m.user);
      for (const m of rank(members, trigger.query, (x) => [x.nickname, x.user?.displayName, x.user?.username], LIMIT)) {
        const u = m.user!;
        people.push({ kind: "user", id: u.id, name: m.nickname ?? u.displayName ?? u.username, username: u.username, avatar: m.avatarURL ?? u.avatarURL, insert: mentionUser(u.id) });
      }
      const roles = rank(server.orderedRoles, trigger.query, (r) => [r.name], 3);
      for (const r of roles) people.push({ kind: "role", id: r.id, name: r.name, colour: r.colour && !r.colour.includes("gradient") ? r.colour : undefined, insert: mentionRole(r.id) });
    } else {
      for (const u of rank(channel.recipients, trigger.query, (x) => [x.displayName, x.username], LIMIT)) {
        people.push({ kind: "user", id: u.id, name: u.displayName ?? u.username, username: u.username, avatar: u.avatarURL, insert: mentionUser(u.id) });
      }
    }
    return people.slice(0, LIMIT + 3);
  }
  if (trigger.operator === "#") {
    if (!server) return [];
    const channels = server.channels.filter((c) => c.type === "TextChannel" && !c.isVoiceRoom);
    return rank(channels, trigger.query, (c) => [c.name], LIMIT).map((c) => ({ kind: "channel" as const, id: c.id, name: c.name, insert: mentionChannel(c.id) }));
  }
  const out: Suggestion[] = [];
  const cdn = client.configuration?.features?.autumn?.url?.replace(/\/$/, "");
  const needle = trigger.query.toLowerCase();
  const servers = server ? [server, ...client.servers.toList().filter((s) => s.id !== server.id)] : client.servers.toList();
  for (const s of servers) {
    for (const e of s.emojis) {
      if (out.length >= 3) break;
      if (e.name.toLowerCase().startsWith(needle)) out.push({ kind: "emoji", key: `c:${e.id}`, name: e.name, url: cdn ? `${cdn}/emojis/${e.id}` : undefined, insert: customEmoji(e.id) });
    }
  }
  for (const d of searchEmoji(needle, LIMIT)) out.push({ kind: "emoji", key: `u:${d.emoji}`, name: d.shorthands[0], text: d.emoji, insert: d.emoji });
  return out.slice(0, LIMIT + 2);
}

/**
 * The suggestion list above the message box (web: floating/AutoComplete):
 * at most 44 px rows, tap one to put it in.
 */
export const Suggestions = memo(function Suggestions({ channel, trigger, onPick }: { channel: Channel; trigger: Trigger; onPick: (s: Suggestion) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const list = useMemo(() => suggestionsFor(client, channel, trigger), [client, channel, trigger]);
  if (!list.length) return null;
  const title = trigger.operator === "@" ? t`Members` : trigger.operator === "#" ? t`Channels` : t`Emoji`;
  return (
    <View
      testID="composer-suggestions"
      accessibilityRole="list"
      accessibilityLabel={title}
      style={{ maxHeight: 264, borderRadius: 14, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.popoverBorder, overflow: "hidden" }}
    >
      <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
        {list.map((s, i) => (
          <Pressable
            key={s.kind === "emoji" ? s.key : `${s.kind}-${s.id}`}
            testID={`suggestion-${i}`}
            accessibilityRole="button"
            accessibilityLabel={s.name}
            onPress={() => onPick(s)}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? palette.navSelected : "transparent" })}
          >
            {s.kind === "user" ? (
              <Avatar url={s.avatar} name={s.name} size={24} />
            ) : s.kind === "role" ? (
              <Icon name="at" size={20} color={s.colour ?? palette.iconMuted} />
            ) : s.kind === "channel" ? (
              <Icon name="hash" size={20} color={palette.iconMuted} />
            ) : s.url ? (
              <Image source={{ uri: s.url }} style={{ width: 24, height: 24 }} contentFit="contain" cachePolicy="memory-disk" />
            ) : (
              <Text style={{ fontSize: 20, width: 24, textAlign: "center" }}>{s.text}</Text>
            )}
            <AText autoDir size={15} line={20} weight="medium" color={s.kind === "role" && s.colour ? s.colour : palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
              {s.kind === "emoji" ? `:${s.name}:` : s.name}
            </AText>
            {s.kind === "user" && s.username !== s.name ? (
              <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                {s.username}
              </AText>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});
