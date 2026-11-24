import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Channel, Server, User } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote, CountBadge, SearchField } from "@/ui/app/parts";
import { Avatar } from "@/ui/Avatar";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { Icon } from "@/ui/Icon";
import { InboxPage } from "@/ui/inbox/InboxPage";
import { haptics } from "@/ui/kit/haptics";
import { PressableRow } from "@/ui/kit/Press";
import { AText } from "@/ui/kit/Text";
import { showSnack } from "@/ui/notices/snack";

import { recentPlaces } from "./recentPlaces";
import { channelListed, rankItems, type SwitchItem, withFolds } from "./switcher";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/** How many results show at once */
const RESULT_LIMIT = 30;

/** A result and what it opens */
type Entry = SwitchItem & {
  avatar?: string;
  voice?: boolean;
  square?: boolean;
  open: () => void | Promise<void>;
  /** still allowed now (rights can change while the page is open) */
  allowed?: () => boolean;
};

const conversationName = (c: Channel) => (c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? ""));

/** Every place the person can go, taken once when the page opens */
export function buildEntries(client: ReturnType<typeof useClient>, words: { directMessage: string; group: string; savedNotes: string; onlyYou: string; server: string; friend: string }): Entry[] {
  const list: Entry[] = [];
  const withConversation = new Set<string>();
  const go = (href: Parameters<typeof router.replace>[0]) => router.replace(href);

  for (const channel of client.channels.values() as Iterable<Channel>) {
    if (!channelListed(channel)) continue;
    const base = {
      id: channel.id,
      unread: !!channel.unread,
      mentions: channel.mentions?.size ?? 0,
      updatedAt: (channel.lastMessageAt ?? channel.createdAt)?.getTime?.() ?? 0,
    };
    switch (channel.type) {
      case "TextChannel":
        list.push({
          ...base,
          kind: "channel",
          name: channel.name ?? "",
          place: channel.server!.name,
          voice: channel.isVoice,
          allowed: () => channelListed(channel),
          open: () => go(anyChannelRoute(channel)),
        });
        break;
      case "DirectMessage":
        if (channel.recipient) withConversation.add(channel.recipient.id);
        list.push({ ...base, kind: "conversation", name: conversationName(channel), place: words.directMessage, avatar: channel.recipient?.avatarURL, open: () => go({ pathname: "/channel/[id]", params: { id: channel.id } }) });
        break;
      case "Group":
        list.push({ ...base, kind: "conversation", name: conversationName(channel), place: words.group, avatar: channel.iconURL, square: true, open: () => go({ pathname: "/channel/[id]", params: { id: channel.id } }) });
        break;
      case "SavedMessages":
        list.push({ ...base, kind: "conversation", name: words.savedNotes, place: words.onlyYou, avatar: client.user?.avatarURL, open: () => go({ pathname: "/channel/[id]", params: { id: channel.id } }) });
        break;
    }
  }

  for (const server of client.servers.values() as Iterable<Server>)
    list.push({
      kind: "server",
      id: server.id,
      name: server.name,
      place: words.server,
      unread: !!server.unread,
      mentions: server.mentions?.length ?? 0,
      updatedAt: 0,
      avatar: server.iconURL,
      square: true,
      open: () => go({ pathname: "/server/[id]", params: { id: server.id } }),
    });

  // friends without an open conversation: choosing one opens it
  for (const user of client.users.values() as Iterable<User>)
    if (user.relationship === "Friend" && !withConversation.has(user.id))
      list.push({
        kind: "friend",
        id: user.id,
        name: user.displayName ?? user.username,
        place: words.friend,
        unread: false,
        mentions: 0,
        updatedAt: 0,
        avatar: user.avatarURL,
        open: () =>
          user
            .openDM()
            .then((dm) => go({ pathname: "/channel/[id]", params: { id: dm.id } }))
            .catch(() => haptics.error()),
      });

  return list.map(withFolds);
}

/**
 * "Go to" (web: QuickSwitcher, Ctrl+K), the phone's way without a
 * keyboard shortcut: one field over channels, conversations, servers and
 * friends. Recent and unread places first; # @ * narrow the kind (also as
 * chips under the field). Names are matched with Arabic folding.
 */
export function FindScreen() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const selfId = useSelfId();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  // the list is taken once when the page opens: new messages arriving
  // meanwhile don't rebuild it or move the rows under the finger
  const [entries] = useState(() =>
    buildEntries(client, {
      directMessage: t`Direct message`,
      group: t`Group`,
      savedNotes: t`Saved notes`,
      onlyYou: t`Only you`,
      server: t`Server`,
      friend: t`Friend`,
    }),
  );

  useEffect(() => {
    let live = true;
    void recentPlaces(selfId).then((list) => live && setRecents(list));
    return () => {
      live = false;
    };
  }, [selfId]);

  const results = useMemo(() => rankItems(entries, query, recents, RESULT_LIMIT), [entries, query, recents]);
  const prefix = query.trimStart()[0];

  const choose = (entry: Entry) => {
    // checked again: the list was taken when the page opened
    if (entry.allowed && !entry.allowed()) {
      haptics.error();
      showSnack({ message: t`You can't open this channel any more.` });
      return;
    }
    void entry.open();
  };

  const narrow = (mark: "#" | "@" | "*") => {
    haptics.selection();
    const text = prefix && "#@*".includes(prefix) ? query.trimStart().slice(1) : query;
    setQuery(prefix === mark ? text.trimStart() : `${mark}${text.trimStart()}`);
  };

  const chip = (mark: "#" | "@" | "*", label: string) => {
    const on = prefix === mark;
    return (
      <PressableRow
        key={mark}
        testID={`find-kind-${mark === "#" ? "channels" : mark === "@" ? "people" : "servers"}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        highlight={palette.navSelected}
        delay={0}
        onPress={() => narrow(mark)}
        style={{
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: 999,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: on ? palette.navSelected : palette.field,
          borderWidth: 1,
          borderColor: on ? palette.borderStrong : palette.borderSubtle,
        }}
      >
        <AText size={14} line={20} weight="bold" color={on ? palette.fg : palette.muted}>
          {mark}
        </AText>
        <AText size={14} line={20} weight={on ? "semibold" : "regular"} color={on ? palette.fg : palette.fg2}>
          {label}
        </AText>
      </PressableRow>
    );
  };

  return (
    <InboxPage title={t`Go to`} testID="quick-switcher">
      <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 12 }}>
        <AText size={14} line={20} color={palette.muted}>
          {t`Start with # for channels, @ for people or * for servers.`}
        </AText>
        <View style={{ flexDirection: "row" }}>
          <SearchField value={query} onChange={setQuery} placeholder={t`Channels, conversations, servers and friends`} testID="find-field" autoFocus />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 12, paddingHorizontal: 16 }}>
        {chip("#", t`Channels`)}
        {chip("@", t`People`)}
        {chip("*", t`Servers`)}
      </ScrollView>
      <AText
        size={13}
        line={20}
        weight="semibold"
        color={palette.muted}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        accessibilityLabel={results.length >= RESULT_LIMIT ? t`${RESULT_LIMIT}+ results` : t`${plural(results.length, { one: "# result", other: "# results" })}`}
        style={{ paddingHorizontal: 16, paddingBottom: 4 }}
      >
        {query.trim() ? t`Results` : t`Recent and unread places`}
      </AText>
      <ScrollView testID="find-results" {...keyboardScrollProps} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 32 }}>
        {results.length === 0 ? (
          <CenterNote icon="magnifying-glass">{t`Nothing found. Try another name.`}</CenterNote>
        ) : (
          results.map((entry) => (
            <PressableRow
              key={`${entry.kind}-${entry.id}`}
              testID={`find-${entry.kind}-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={[entry.name, entry.place].filter(Boolean).join(", ")}
              highlight={palette.navSelected}
              onPress={() => choose(entry)}
              style={{ minHeight: 56, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              {entry.kind === "channel" ? (
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={entry.voice ? "speaker-high" : "hash"} size={20} color={palette.iconMuted} />
                </View>
              ) : (
                <Avatar url={entry.avatar} name={entry.name} size={36} square={entry.square} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
                  {entry.name}
                </AText>
                {entry.place ? (
                  <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1}>
                    {entry.place}
                  </AText>
                ) : null}
              </View>
              {entry.mentions > 0 ? (
                <CountBadge count={entry.mentions} />
              ) : entry.unread ? (
                <View accessibilityLabel={t`Unread`} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.fg }} />
              ) : null}
            </PressableRow>
          ))
        )}
      </ScrollView>
    </InboxPage>
  );
}
