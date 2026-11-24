import { useLingui } from "@lingui/react/macro";
import { FlashList } from "@shopify/flash-list";
import type { User } from "@zrzur/sdk/solid";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { CountBadge, ScreenHeader, SearchField, Sheet, ToolButton } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { ChromeScale } from "@/ui/kit/fontScale";
import { type FriendPerson, type FriendTab, errorType, friendGroups, isUserId, statusLine } from "@/ui/profile/logic";
import { type Mood, MOODS } from "@/ui/profile/moods";
import { ProfileAvatar } from "@/ui/profile/parts";
import { openProfile, openUserMenu } from "@/ui/profile/store";
import { StepButton, StepError } from "@/ui/profile/StepPanel";
import { HEX, contrast } from "@/ui/profile/theme";
import { nameFontStyle } from "@/ui/settings/user/profile-look";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

type Kind = "friend" | "incoming" | "outgoing" | "blocked";
type Row = { type: "heading"; key: string; title: string; count: number; first: boolean } | { type: "person"; key: string; id: string; kind: Kind; first: boolean; last: boolean };

/** A bare 44 px icon in a row: no ring round it, a round tint when pressed (web Actions, phone) */
function RowIcon({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      <Icon name={icon} size={18} color={palette.iconNeutral} />
    </Pressable>
  );
}

/**
 * One person with the actions of their kind (web Friends Person, phone): a
 * 62 px row in a filled group, a hairline after the avatar. The row opens the
 * profile; its actions sit beside it, never inside its button.
 */
const Person = memo(function Person({ user, kind, first, last }: { user: User; kind: Kind; first: boolean; last: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [down, setDown] = useState(false);
  const f = useFields(user, (u) => ({
    name: u.displayName,
    avatar: u.animatedAvatarURL,
    presence: u.presence as string,
    online: u.online,
    status: statusLine(u.statusEmoji, u.status?.text),
    decoration: u.style?.decoration,
    font: u.style?.name_font,
    colour: u.style?.name_colour?.[0],
  }));
  if (!f) return null;
  const status =
    kind === "incoming"
      ? t`Incoming friend request`
      : kind === "outgoing"
        ? t`Outgoing friend request`
        : kind === "blocked"
          ? t`Blocked`
          : f.status ||
            (f.online ? (f.presence === "Busy" ? t`Do not disturb` : f.presence === "Idle" ? t`Idle` : f.presence === "Focus" ? t`Focus` : t`Online`) : t`Offline`);
  const message = async () => {
    const dm = await user.openDM();
    router.push({ pathname: "/channel/[id]", params: { id: dm.id } });
  };
  const run = (action: () => Promise<unknown>) => void action().catch(() => {});
  // a picked name colour only where it reads on the group
  const nameColour = f.colour && HEX.test(f.colour) && HEX.test(palette.field) && contrast(f.colour, palette.field) >= 4.5 ? f.colour : palette.fg;
  return (
    <View
      style={{
        marginHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        height: 62,
        paddingStart: 16,
        paddingEnd: 8,
        gap: 12,
        backgroundColor: down ? palette.navSelected : palette.field,
        borderTopLeftRadius: first ? 14 : 0,
        borderTopRightRadius: first ? 14 : 0,
        borderBottomLeftRadius: last ? 14 : 0,
        borderBottomRightRadius: last ? 14 : 0,
      }}
    >
      {first ? null : <View pointerEvents="none" style={{ position: "absolute", top: 0, start: 64, end: 16, height: 1, backgroundColor: palette.divider }} />}
      <Pressable
        testID="friend-row"
        accessibilityRole="button"
        accessibilityLabel={f.name}
        accessibilityHint={status}
        onPress={() => openProfile(user.id)}
        onLongPress={() => openUserMenu(user.id)}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        style={{ flex: 1, minWidth: 0, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <ProfileAvatar url={f.avatar} name={f.name} size={36} decoration={f.decoration} presence={kind === "friend" ? f.presence : undefined} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AText autoDir size={15} line={20} weight="semibold" color={nameColour} numberOfLines={1} style={nameFontStyle(f.font)}>
            {f.name}
          </AText>
          <AText autoDir testID="friend-status" size={13} line={16} color={palette.muted} numberOfLines={1}>
            {status}
          </AText>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {kind === "friend" ? <RowIcon testID="friend-message" icon="chat-circle" label={t`Message`} onPress={() => void message().catch(() => {})} /> : null}
        {kind === "incoming" ? (
          <>
            <RowIcon testID="friend-accept" icon="check" label={t`Accept`} onPress={() => run(() => user.addFriend())} />
            <RowIcon testID="friend-ignore" icon="x" label={t`Ignore`} onPress={() => run(() => user.removeFriend())} />
          </>
        ) : null}
        {kind === "outgoing" ? <RowIcon testID="friend-cancel" icon="x" label={t`Cancel request`} onPress={() => run(() => user.removeFriend())} /> : null}
        {kind === "blocked" ? <Button testID="friend-unblock" size="sm" variant="tonal" label={t`Unblock`} onPress={() => run(() => user.unblockUser())} /> : null}
        <RowIcon testID="friend-more" icon="dots-three-vertical" label={t`More`} onPress={() => openUserMenu(user.id)} />
      </View>
    </View>
  );
});

function PersonById({ id, kind, first, last }: { id: string; kind: Kind; first: boolean; last: boolean }) {
  const client = useClient();
  const user = useSolid(useCallback(() => client.users.get(id), [client, id]));
  return user ? <Person user={user} kind={kind} first={first} last={last} /> : null;
}

/** Add a new friend by username (web AddFriend dialog) */
function AddFriendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const client = useClient();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { palette } = useTheme();
  const close = () => {
    setUsername("");
    setError(undefined);
    onClose();
  };
  const send = async () => {
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.api.post("/users/friend" as never, { username: name } as never);
      close();
    } catch (err) {
      setError(errorType(err) === "OfficialAccount" ? t`This is an official Zrzur account. It can't be added.` : describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={close} testID="add-friend-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="user-plus" size={20} color={palette.accentText} />
        <AText size={18} line={24} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Add a new friend`}
        </AText>
      </View>
      <TextField
        label={t`Username`}
        placeholder={t`username`}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        testID="friends-username"
      />
      <StepError message={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StepButton testID="friends-close" label={t`Close`} onPress={close} />
        <StepButton testID="friends-send" tone="primary" label={t`Send request`} busy={busy} disabled={!username.trim()} onPress={() => void send()} />
      </View>
    </Sheet>
  );
}

/** Calm empty state (web EmptyState): the mood, one line of context, one action */
function Empty({ mood, title, description, action, onAction }: { mood: Mood; title: string; description?: string; action?: string; onAction?: () => void }) {
  const { palette } = useTheme();
  return (
    <View testID="friends-empty" style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 4 }}>
      <View style={{ marginBottom: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SvgXml xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="${palette.header}" fill-rule="evenodd" d="${MOODS[mood]}"/></svg>`} width={64} height={64} />
      </View>
      <AText size={15} line={24} weight="semibold" color={palette.fg} style={{ textAlign: "center", maxWidth: 420 }}>
        {title}
      </AText>
      {description ? (
        <AText size={13} line={20} color={palette.fg2} style={{ textAlign: "center", maxWidth: 420 }}>
          {description}
        </AText>
      ) : null}
      {action && onAction ? (
        <View style={{ marginTop: 12 }}>
          <Button testID="friends-empty-action" size="sm" variant="tonal" label={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** A filter chip with an optional count (kit Chip metrics; the kit Chip has no count slot) */
function TabChip({ label, selected, count, onPress, testID }: { label: string; selected: boolean; count?: number; onPress: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: selected ? palette.navSelected : pressed ? palette.navHover : palette.field,
      })}
    >
      <ChromeScale>
        <AText size={14} line={20} weight={selected ? "semibold" : "medium"} color={selected ? palette.fg : palette.fg2} numberOfLines={1}>
          {label}
        </AText>
        {count ? <CountBadge count={count} /> : null}
      </ChromeScale>
    </Pressable>
  );
}

/** Friends: online, all, pending (incoming, outgoing), blocked; search; add by username */
export default function Friends() {
  const { add, profile } = useLocalSearchParams<{ add?: string; profile?: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [tab, setTab] = useState<FriendTab>("online");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(add === "1");
  const [linkError, setLinkError] = useState(false);

  // `/friends?profile=<id>`, the link of a friend-request notification
  useEffect(() => {
    if (!profile) return;
    const id = profile.trim();
    router.setParams({ profile: undefined });
    const known = isUserId(id) ? client.users.get(id) : undefined;
    const found = known ? Promise.resolve(known) : isUserId(id) ? client.users.fetch(id) : Promise.reject(new Error("not an id"));
    found.then((u) => openProfile(u.id)).catch(() => setLinkError(true));
  }, [profile, client]);

  const snapshot = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          client.users
            .filter((u) => u.relationship !== "None" && u.relationship !== "User")
            .map((u): FriendPerson => ({ id: u.id, name: u.displayName, username: u.username, relationship: u.relationship, online: u.online })),
        ),
      [client],
    ),
  );
  const people = useMemo(() => JSON.parse(snapshot) as FriendPerson[], [snapshot]);
  const pending = people.filter((p) => p.relationship === "Incoming").length;
  const groups = friendGroups(people, tab, query);
  const titles: Record<Kind, string> = {
    friend: tab === "online" ? t`Online` : t`All friends`,
    incoming: t`Incoming`,
    outgoing: t`Outgoing`,
    blocked: t`Blocked`,
  };
  const rows: Row[] = [];
  for (const g of groups) {
    if (!g.ids.length) continue;
    rows.push({ type: "heading", key: `h:${g.kind}`, title: titles[g.kind], count: g.ids.length, first: rows.length === 0 });
    g.ids.forEach((id, i) => rows.push({ type: "person", key: `${g.kind}:${id}`, id, kind: g.kind, first: i === 0, last: i === g.ids.length - 1 }));
  }
  // pull to refresh: the people listed here again (names, pictures, status)
  const pull = usePullRefresh(async () => {
    const ids = rows.filter((r): r is Extract<Row, { type: "person" }> => r.type === "person").slice(0, 100).map((r) => r.id);
    await Promise.all(ids.map((id) => client.api.get(`/users/${id as ""}` as never).then((data) => client.users.getOrCreate(id, data as never), () => undefined)));
  });
  const searching = !!query.trim();
  const openAdd = () => setAdding(true);
  const empty =
    tab === "online" ? (
      <Empty mood={searching ? "look-down" : "sleepy"} title={searching ? t`No one matches that search` : t`No friends online right now`} description={searching ? undefined : t`When your friends come online, they show up here.`} action={searching ? undefined : t`Add a friend`} onAction={openAdd} />
    ) : tab === "all" ? (
      <Empty mood={searching ? "look-down" : "relaxed"} title={searching ? t`No one matches that search` : t`Your friends list is empty`} description={searching ? undefined : t`Add people by their username to chat, call and play together.`} action={searching ? undefined : t`Add friend`} onAction={openAdd} />
    ) : tab === "pending" ? (
      <Empty mood="look-up" title={t`No pending requests`} description={t`Friend requests you send or receive wait here.`} />
    ) : (
      <Empty mood="focused" title={t`You haven't blocked anyone`} description={t`Blocked people can't message you or send requests.`} />
    );

  const tabs: [FriendTab, string][] = [
    ["online", t`Online`],
    ["all", t`All`],
    ["pending", t`Pending`],
    ["blocked", t`Blocked`],
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }} accessibilityRole="header">
          {t`Friends`}
        </AText>
        <ToolButton icon="user-plus" label={t`Add friend`} onPress={openAdd} primary testID="friends-add" />
      </ScreenHeader>
      {/* phones: the filters and the search take their own rows under the title */}
      <View style={{ gap: 8, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          accessibilityRole="tablist"
          accessibilityLabel={t`Friends filter`}
          contentContainerStyle={{ gap: 4, paddingHorizontal: 16 }}
        >
          {tabs.map(([value, label]) => (
            <TabChip key={value} testID={`friends-tab-${value}`} label={label} selected={tab === value} count={value === "pending" ? pending : undefined} onPress={() => setTab(value)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", marginHorizontal: 16 }}>
          <SearchField value={query} onChange={setQuery} placeholder={t`Search`} testID="friends-search" />
        </View>
      </View>
      {linkError ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <StepError message={t`This profile could not be opened. The account may no longer exist.`} />
        </View>
      ) : null}
      {rows.length ? (
        <FlashList<Row>
          data={rows}
          refreshControl={pull.control}
          onScroll={pull.onScroll}
          scrollEventThrottle={16}
          {...keyboardScrollProps}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.type}
          renderItem={({ item }) =>
            item.type === "heading" ? (
              <View style={{ paddingTop: item.first ? 16 : 24, paddingBottom: 8, paddingHorizontal: 20 }}>
                <AText size={12} line={16} weight="semibold" color={palette.muted} accessibilityRole="header">
                  {`${item.title} — ${item.count}`}
                </AText>
              </View>
            ) : (
              <PersonById id={item.id} kind={item.kind} first={item.first} last={item.last} />
            )
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      ) : (
        empty
      )}
      <AddFriendSheet visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}
