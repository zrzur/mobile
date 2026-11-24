import { Trans, useLingui } from "@lingui/react/macro";
import type { Message, User } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { clock, shortDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { CenterNote, HeaderButton } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { isolate } from "@/ui/kit/bidi";
import { Button } from "@/ui/kit/Button";
import { Chip } from "@/ui/kit/Chip";
import { haptics } from "@/ui/kit/haptics";
import { PressableRow } from "@/ui/kit/Press";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { closeSwipeRows, type SwipeAction, swipeA11y, SwipeRow } from "@/ui/kit/SwipeRow";
import { Avatar } from "@/ui/Avatar";
import { channelRoute } from "@/ui/forum/channelRoute";
import { dayGroup, placeParts } from "@/ui/inbox/place";
import { openProfile } from "@/ui/profile/store";
import { savedRemindersEnabled, useArrivedReminders } from "@/chat/keep";

type Filter = "all" | "mentions" | "friends";

/** A name inside the sentence: isolated, so an Arabic name does not turn an English sentence around (or the reverse) */
function Bold({ v }: { v: string }) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  return <Text style={{ color: palette.fg, fontFamily: fontFamily(i18n.locale, "bold") }}>{isolate(v)}</Text>;
}

/** Mentions and friend requests (web: NotificationsPhone) */
export default function Notifications() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const arrived = useArrivedReminders();
  const lists = savedRemindersEnabled(client);
  const [filter, setFilter] = useState<Filter>("all");
  const [mentions, setMentions] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  // previews with names: a person or channel not in memory yet is fetched,
  // so a mention never shows as a raw <@id>
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // rows swiped away (marked read or dismissed) this visit
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const pull = usePullRefresh(
    () =>
      new Promise<boolean>((resolve) => {
        refreshDone.current = resolve;
        setTick((n) => n + 1);
      }),
  );
  const refreshDone = useRef<((changed: boolean) => void) | null>(null);

  useEffect(() => {
    let alive = true;
    client
      .fetchMentions(50)
      .then((list) => {
        if (!alive) return;
        refreshDone.current?.(true);
        refreshDone.current = null;
        setHidden(new Set());
        setMentions(list);
        for (const m of list) {
          if (!m.content || !/<[@#]/.test(m.contentPlain)) continue;
          client
            .markdownToTextFetch(m.content)
            .then((text) => alive && setPreviews((p) => ({ ...p, [m.id]: text })))
            .catch(() => {});
        }
      })
      .catch(() => {
        refreshDone.current?.(false);
        refreshDone.current = null;
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [client, tick]);

  const requestIds = useSolid(
    useCallback(() => client.users.filter((u) => u.relationship === "Incoming").map((u) => u.id).join(","), [client]),
  );
  const requests = useMemo(() => (requestIds ? requestIds.split(",").map((id) => client.users.get(id)!).filter(Boolean) : []), [requestIds, client]);

  const groups = useMemo(() => {
    const out: Record<string, Message[]> = { today: [], yesterday: [], earlier: [] };
    for (const m of mentions ?? []) if (!hidden.has(m.id)) out[dayGroup(m.createdAt)].push(m);
    return out;
  }, [mentions, hidden]);

  const chip = (value: Filter, label: string) => <Chip key={value} testID={`notifications-filter-${value}`} radio selected={filter === value} label={label} onPress={() => setFilter(value)} />;

  const title = (label: string) => (
    <AText size={13} line={20} weight="semibold" color={palette.muted} accessibilityRole="header" style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
      {label}
    </AText>
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  // the page is closed first: it would cover the profile (the profile has its own Accept)
  const showProfile = (user: User) => {
    close();
    openProfile(user.id);
  };

  const sendMessage = (user: User) =>
    void user
      .openDM()
      .then((dm) => router.replace({ pathname: "/channel/[id]", params: { id: dm.id } }))
      .catch(() => haptics.error());

  const requestRow = (user: User, first: boolean) => (
    <View key={user.id} style={{ paddingBottom: 12, backgroundColor: palette.mentionBg, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      {/* who sent it: one target that opens their profile; "Open profile" is said after the sentence */}
      <PressableRow
        testID="friend-request-profile"
        accessibilityRole="button"
        accessibilityHint={t`Open profile`}
        highlight={palette.navSelected}
        onPress={() => showProfile(user)}
        style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 44, paddingTop: 12, paddingHorizontal: 14 }}
      >
        <Avatar url={user.avatarURL} name={user.displayName ?? user.username} size={44} />
        <AText size={15} line={22} color={palette.fg2} style={{ flex: 1 }}>
          <Trans>
            <Bold v={user.displayName ?? user.username} /> sent you a friend request.
          </Trans>
        </AText>
      </PressableRow>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingStart: 70, paddingEnd: 14, marginTop: 4, marginBottom: -4 }}>
        <Button size="sm" label={t`Accept`} onPress={() => void user.addFriend().then(() => haptics.success(), () => haptics.error())} />
        <Button size="sm" variant="tonal" label={t`Decline`} onPress={() => void user.removeFriend().catch(() => haptics.error())} />
        <Button size="sm" variant="tonal" label={t`Send message`} onPress={() => sendMessage(user)} />
      </View>
    </View>
  );

  const mentionRow = (m: Message, first: boolean) => {
    const name = m.username ?? "…";
    // server and channel apart, each keeping its own direction (web: placed)
    const where = placeParts(m.channel ?? undefined, { directMessage: t`Direct message`, savedNotes: t`Saved notes` }).join(" · ");
    const today = dayGroup(m.createdAt) === "today";
    // not opened yet: a light wash of the action colour and a dot
    const fresh = !!m.channel?.mentions?.has(m.id);
    // swipe toward the start: Mark as read (full swipe) and Dismiss
    const actions: SwipeAction[] = [
      {
        key: "read",
        label: t`Mark as read`,
        icon: "check-circle",
        color: palette.accent,
        ink: palette.onAccent,
        testID: `mention-swipe-read-${m.id}`,
        onPress: () => {
          void m.channel?.ack(m).catch(() => {});
          hide(m.id);
        },
      },
      { key: "dismiss", label: t`Dismiss`, icon: "x", color: palette.dangerFill, ink: palette.onAccent, testID: `mention-swipe-dismiss-${m.id}`, onPress: () => hide(m.id) },
    ];
    return (
      <SwipeRow key={m.id} end={actions} fullEnd background={palette.field}>
      <PressableRow
        testID={`mention-${m.id}`}
        accessibilityRole="button"
        highlight={palette.navSelected}
        {...swipeA11y(actions)}
        onPress={() => router.push(channelRoute({ id: m.channelId, isThread: m.channel?.isThread }, m.id))}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: palette.divider,
          backgroundColor: fresh ? palette.mentionBg : palette.field,
        }}
      >
        <Avatar url={m.avatarURL} name={name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText size={15} line={22} color={palette.fg2}>
            <Trans>
              <Bold v={name} /> mentioned you in <Bold v={where} />
            </Trans>
          </AText>
          <View style={{ marginTop: 6, borderStartWidth: 3, borderStartColor: palette.borderStrong, paddingStart: 10 }}>
            <AText autoDir size={14} line={20} color={palette.muted} numberOfLines={2}>
              {previews[m.id] ?? m.contentPlain}
            </AText>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 3 }}>
          <AText size={12} line={16} color={palette.muted}>
            {today ? clock(m.createdAt, i18n.locale) : shortDate(m.createdAt, i18n.locale)}
          </AText>
          {fresh ? <View accessibilityLabel={t`Unread`} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }} /> : null}
        </View>
      </PressableRow>
      </SwipeRow>
    );
  };

  const card = (children: React.ReactNode) => <View style={{ marginHorizontal: 12, borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>{children}</View>;

  const showFriends = filter !== "mentions" && requests.length > 0;
  const showMentions = filter !== "friends";
  const empty = !showFriends && (!showMentions || (mentions && mentions.length === 0));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 12, paddingEnd: 8, paddingStart: 16 }}>
        <AText size={22} line={28} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Notifications`}
        </AText>
        <HeaderButton icon="x" label={t`Close`} size={22} onPress={close} testID="notifications-close" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} accessibilityRole="radiogroup" accessibilityLabel={t`Notifications`} contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
        {chip("all", t`All`)}
        {chip("mentions", t`Mentions`)}
        {chip("friends", t`Friends`)}
        {/* reminders and saved messages have their own lists */}
        {lists ? (
          <>
            <Chip
              testID="notifications-reminders"
              label={arrived.length ? `${t`Reminders`} ${arrived.length}` : t`Reminders`}
              accessibilityLabel={t`Reminders`}
              onPress={() => router.push("/reminders")}
            />
            <Chip testID="notifications-saved" label={t`Saved list`} onPress={() => router.push("/saved")} />
          </>
        ) : null}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={pull.control} onScroll={pull.onScroll} scrollEventThrottle={16} onScrollBeginDrag={closeSwipeRows} keyboardDismissMode="interactive">
        {showFriends ? (
          <>
            {title(t`Friend requests`)}
            {card(requests.map((u, i) => requestRow(u, i === 0)))}
          </>
        ) : null}
        {showMentions ? (
          failed ? (
            <View testID="notifications-error" style={{ alignItems: "center" }}>
              <CenterNote icon="warning-circle">{t`Mentions couldn't load. Try again soon.`}</CenterNote>
              <Button
                testID="notifications-retry"
                variant="tonal"
                label={t`Try again`}
                onPress={() => {
                  setFailed(false);
                  setMentions(null);
                  setTick((n) => n + 1);
                }}
              />
            </View>
          ) : !mentions ? (
            <View style={{ paddingTop: 12 }}>
              <SkeletonRows count={6} testID="notifications-loading" />
            </View>
          ) : (
            (["today", "yesterday", "earlier"] as const).map((key) =>
              groups[key].length ? (
                <View key={key}>
                  {title(key === "today" ? t`Today` : key === "yesterday" ? t`Yesterday` : t`Earlier`)}
                  {card(groups[key].map((m, i) => mentionRow(m, i === 0)))}
                </View>
              ) : null,
            )
          )
        ) : null}
        {empty && mentions ? <CenterNote icon="bell">{t`Nothing waits for you. New mentions and friend requests show here.`}</CenterNote> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
