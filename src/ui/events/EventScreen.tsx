import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { File as SdkFile } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { describeError } from "@/auth/errorText";
import { MessageContent } from "@/chat/MessageContent";
import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Chip } from "@/ui/kit/Chip";
import { Icon, type IconName } from "@/ui/Icon";
import { ConfirmDialog, ControlRow, Toggle } from "@/ui/settings/parts";
import { openProfile } from "@/ui/server/home";

import { EventAnswer, SeatBar } from "./EventAnswer";
import { JoinButton, usePlace } from "./EventCard";
import { EventEditor } from "./EventEditor";
import { eventLink, eventPhase, eventWhen, isUpcoming, namesShown, seatState, shareLink, startsIn, takesPart } from "./eventFormat";
import { useNow } from "./useNow";
import { cancelEvent, deleteEvent, eventAction, fetchAttendees, fetchEvent, setEventMuted, useOrganiser, useRsvp, useServerEvent } from "./eventsStore";
import type { Attendee, AttendeeFilter, ServerEvent } from "./types";
import { canManageEvents } from "./permission";
import { copyToClipboard } from "@/ui/kit/share";

function Section({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {title ? (
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {title}
        </AText>
      ) : null}
      {children}
    </View>
  );
}

/** A settings row with an icon, a title and a line under it */
function InfoRow({ icon, title, text, first }: { icon: IconName; title: string; text?: string; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <Icon name={icon} size={20} color={palette.iconNeutral} />
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg}>
          {title}
        </AText>
        {text ? (
          <AText size={13} line={18} color={palette.muted}>
            {text}
          </AText>
        ) : null}
      </View>
    </View>
  );
}

function Panel({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <View style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 12 }}>{children}</View>;
}

type Confirm = "cancel" | "series" | "delete" | "delete-series";

/**
 * The page of one event (web: EventDetail): cover, when and where, your
 * answer, the seats, who comes, and for organisers the tools to run it.
 */
export function EventScreen({ serverId, eventId }: { serverId: string; eventId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const event = useServerEvent(eventId);
  const [loadError, setLoadError] = useState<string>();
  // the page names its channel and organisers: wait for the client's first sync (a link straight here fetches the event sooner)
  // (kept once reached: a reconnect later does not hide the page)
  const ready = useSolid(useCallback(() => client.ready(), [client]));
  const [synced, setSynced] = useState(ready);
  if (ready && !synced) setSynced(true);
  useEffect(() => {
    // no gateway (offline, blocked socket): show what the event says after a moment anyway
    const timer = setTimeout(() => setSynced(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let live = true;
    // always asked for: the answer says whether you may run this event
    fetchEvent(client, serverId, eventId).catch((err) => live && setLoadError(describeError(err)));
    return () => {
      live = false;
    };
  }, [client, serverId, eventId]);

  return (
    <SafeAreaView testID="event-detail" style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <Pressable testID="events-back" accessibilityRole="link" onPress={() => router.replace({ pathname: "/events/[serverId]", params: { serverId } })} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
          <AText size={14} line={20} weight="semibold" color={palette.muted}>
            {t({ message: "Events", context: "scheduled events" })}
          </AText>
        </Pressable>
        <Icon name="caret-right" size={16} color={palette.muted} />
        <AText autoDir size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {event?.title ?? t({ message: "Events", context: "scheduled events" })}
        </AText>
      </ScreenHeader>
      {event && synced ? (
        <Detail event={event} serverId={serverId} />
      ) : loadError ? (
        <View accessibilityRole="alert" style={{ margin: 16, padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8 }}>
          <AText size={15} line={22} weight="semibold" color={palette.fg}>
            {t`This event is not there any more, or you can't see where it takes place.`}
          </AText>
          <AText size={13} line={18} color={palette.fg2}>
            {loadError}
          </AText>
        </View>
      ) : (
        <View accessibilityLabel={t`Loading events`} style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={palette.muted} />
        </View>
      )}
    </SafeAreaView>
  );
}

function Detail({ event, serverId }: { event: ServerEvent; serverId: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const now = useNow();
  const server = useServer(serverId);
  const canManage = useFields(server, (s) => canManageEvents(s));
  const organiserKnown = useOrganiser(event._id);
  const organiser = organiserKnown ?? !!canManage;
  const mine = useRsvp(event._id);
  const place = usePlace(event);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [editing, setEditing] = useState(false);
  const phase = eventPhase(event, now);
  const upcoming = isUpcoming(event);
  const draft = event.status === "Draft";
  const repeating = !!event.repeat;
  const seats = seatState(event);

  const organiserIds = [event.creator, ...(event.co_organisers ?? [])];
  const organiserNames = useFields(client, (c) => organiserIds.map((id) => c.users.get(id)?.displayName).filter((n): n is string => !!n), [organiserIds.join(",")]) ?? [];
  useEffect(() => {
    // the people who run it may not be known here yet: ask for them once
    for (const id of [event.creator, ...(event.co_organisers ?? [])]) if (!client.users.get(id)) void client.users.fetch(id).catch(() => undefined);
  }, [client, event.creator, event.co_organisers]);

  const act = async (action: () => Promise<unknown>) => {
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const link = () => {
    const origin = (client.configuration as { app?: string } | undefined)?.app || "https://app.zrzur.com";
    return event.link ? shareLink((client.configuration as { invite?: string } | undefined)?.invite || "https://zrzur.cc", event.link) : eventLink(origin, serverId, event._id);
  };

  const cover = event.cover ? new SdkFile(client, event.cover as never).createFileURL() : undefined;
  const repeatText = event.repeat === "Daily" ? t`Every day` : event.repeat === "Weekly" ? t`Every week` : event.repeat === "EveryTwoWeeks" ? t`Every 2 weeks` : t`Every month`;
  const visibilityText = event.visibility === "Invited" ? t`Only the invited people see it` : event.visibility === "Roles" ? t`Only some roles see it` : t`Everyone who sees its place sees it`;
  const stateText = phase === "live" ? t`Happening now` : draft ? t`Draft: only organisers see it` : event.status === "Cancelled" ? t({ message: "Cancelled", context: "scheduled events" }) : t`This event is over`;

  const confirmText =
    confirm === "series"
      ? t`Cancel this one and every one after it? Nothing more of this series is scheduled.`
      : confirm === "cancel"
        ? repeating
          ? t`Cancel this time only? The next one stays scheduled.`
          : t`Cancel this event? The people who answered see that it is off.`
        : confirm === "delete-series"
          ? t`Delete this one and every one after it for good? Nothing more of this series is scheduled.`
          : repeating && upcoming
            ? t`Delete this time and its answers for good? The next one stays scheduled.`
            : t`Delete this event and its answers for good?`;
  const confirmLabel =
    confirm === "series" ? t`Cancel the whole series` : confirm === "cancel" ? (repeating ? t`Cancel this time` : t`Cancel event`) : confirm === "delete-series" ? t`Delete the whole series` : repeating && upcoming ? t`Delete this time` : t({ message: "Delete", context: "scheduled events" });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 32 }} data-phase={phase}>
      {cover ? <Image source={{ uri: cover }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 14 }} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors /> : null}
      <View style={{ gap: 8 }}>
        {!upcoming || phase === "live" ? (
          <AText size={13} line={18} weight="semibold" color={phase === "live" ? palette.onlineText : palette.fg2}>
            {stateText}
          </AText>
        ) : null}
        <AText size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header">
          {event.title}
        </AText>
        {phase === "live" ? (
          <View style={{ flexDirection: "row" }}>
            <JoinButton event={event} />
          </View>
        ) : null}
      </View>

      <View testID="event-ticket">
        <RowGroup>
          <InfoRow
            first
            icon="calendar"
            title={eventWhen(event, i18n.locale)}
            text={phase === "live" ? t`Started ${startsIn(event.started_at ?? event.starts_at, now, i18n.locale)}` : upcoming ? startsIn(event.starts_at, now, i18n.locale) : undefined}
          />
          <InfoRow icon={place.icon} title={place.name} text={event.place.type === "Voice" ? t`Voice channel` : event.place.type === "Text" ? t`Text channel` : t`Outside the server`} />
          {event.repeat ? <InfoRow icon="arrows-clockwise" title={repeatText} /> : null}
          <InfoRow icon={event.visibility && event.visibility !== "Place" ? "lock-simple" : "eye"} title={visibilityText} />
          {organiserNames.length ? <InfoRow icon="users" title={organiserNames.join(", ")} text={t`Organisers`} /> : null}
        </RowGroup>
      </View>

      {event.description ? (
        <Section title={t`About this event`}>
          <Panel>
            <MessageContent content={event.description} />
          </Panel>
        </Section>
      ) : null}

      {upcoming ? (
        <Section title={t`Your answer`}>
          <Panel>
            <EventAnswer event={event} serverId={serverId} />
          </Panel>
        </Section>
      ) : null}

      {seats.capacity !== undefined ? (
        <Section title={t({ message: "Seats", context: "scheduled events" })} testID="event-seats">
          <Panel>
            <AText size={28} line={34} weight="bold" color={palette.header}>
              {`${seats.going} `}
              <AText size={15} line={20} color={palette.fg2}>
                {t`of ${seats.capacity}`}
              </AText>
            </AText>
            <SeatBar event={event} />
            <AText size={13} line={18} color={palette.fg2}>
              {event.over_capacity
                ? t`Over its limit: an organiser seated more people than there are seats.`
                : seats.full
                  ? t`${plural(seats.waiting, { 0: "Full", one: "Full · # on the waiting list", other: "Full · # on the waiting list" })}`
                  : t`${plural(seats.left ?? 0, { one: "# seat left", other: "# seats left" })}`}
            </AText>
          </Panel>
        </Section>
      ) : null}

      <Section title={upcoming || draft ? t`Who is coming` : t`Who came`} testID="event-people">
        {event.people_removed_at ? (
          <Panel>
            <AText testID="event-people-removed" size={13} line={18} color={palette.fg2}>
              {t`The names were removed 12 months after the event. The numbers stay.`}
            </AText>
          </Panel>
        ) : !namesShown(event, organiser, mine) ? (
          <Panel>
            <AText testID="event-people-hidden" size={13} line={18} color={palette.fg2}>
              {event.attendee_list === "Participants" ? t`Only the people taking part see the names.` : t`Only the organisers see the names.`}
            </AText>
          </Panel>
        ) : (
          <People event={event} serverId={serverId} organiser={organiser} />
        )}
      </Section>

      {!draft ? (
        <Section title={t`For you`}>
          <RowGroup>
            <GroupRow
              first
              icon="share-network"
              label={copied ? t`Link copied` : t`Copy link`}
              onPress={() => {
                void copyToClipboard(link()).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            />
            {upcoming && takesPart(mine) ? (
              <ControlRow
                icon={mine?.muted ? "bell-slash" : "bell"}
                title={t`Reminders for this event`}
                description={t`The organisers choose when they come.`}
                control={<Toggle testID="event-mute" label={t`Reminders for this event`} value={mine?.muted !== true} disabled={busy} onChange={(on) => void act(() => setEventMuted(client, serverId, event._id, !on))} />}
              />
            ) : null}
          </RowGroup>
        </Section>
      ) : null}

      {organiser ? (
        <>
          <Section title={t`Organiser tools`} testID="event-manage">
            <RowGroup>
              {draft ? <GroupRow first icon="paper-plane-tilt" testID="event-publish" label={t({ message: "Publish", context: "scheduled events" })} onPress={() => !busy && void act(() => eventAction(client, serverId, event._id, "publish"))} /> : null}
              {upcoming || draft ? <GroupRow first={!draft} icon="pencil-simple" testID="event-edit" label={t({ message: "Edit", context: "scheduled events" })} chevron onPress={() => setEditing(true)} /> : null}
              {event.status === "Scheduled" ? <GroupRow icon="play" testID="event-start" label={t`Start now`} onPress={() => !busy && void act(() => eventAction(client, serverId, event._id, "start"))} /> : null}
              {event.status === "Active" ? <GroupRow icon="stop" testID="event-end" label={t({ message: "End now", context: "scheduled events" })} onPress={() => !busy && void act(() => eventAction(client, serverId, event._id, "end"))} /> : null}
              <GroupRow
                first={!upcoming && !draft}
                icon="copy"
                testID="event-copy"
                label={t`Copy as a draft`}
                onPress={() =>
                  !busy &&
                  void act(async () => {
                    const copy = await eventAction(client, serverId, event._id, "copy");
                    router.push({ pathname: "/event/[id]", params: { id: copy._id, server: serverId } });
                  })
                }
              />
            </RowGroup>
          </Section>
          <Section title={t`Cancel or delete`}>
            <RowGroup>
              {upcoming ? <GroupRow first icon="x-circle" danger testID="event-cancel" label={repeating ? t`Cancel this time` : t`Cancel event`} onPress={() => setConfirm("cancel")} /> : null}
              {upcoming && repeating ? <GroupRow icon="arrows-clockwise" danger testID="event-cancel-series" label={t`Cancel the whole series`} onPress={() => setConfirm("series")} /> : null}
              <GroupRow first={!upcoming} icon="trash" danger testID="event-delete" label={repeating && upcoming ? t`Delete this time` : t({ message: "Delete", context: "scheduled events" })} onPress={() => setConfirm("delete")} />
              {repeating && upcoming ? <GroupRow icon="trash" danger testID="event-delete-series" label={t`Delete the whole series`} onPress={() => setConfirm("delete-series")} /> : null}
            </RowGroup>
          </Section>
        </>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={{ padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
          <AText size={13} line={18} color={palette.fg}>
            {error}
          </AText>
        </View>
      ) : null}

      <ConfirmDialog
        visible={!!confirm}
        title={confirmLabel}
        text={confirmText}
        confirm={confirmLabel}
        cancel={t({ message: "Keep it", context: "scheduled events" })}
        onClose={() => setConfirm(undefined)}
        onConfirm={async () => {
          const choice = confirm;
          if (choice === "cancel" || choice === "series") {
            await cancelEvent(client, serverId, event._id, choice === "series");
            return;
          }
          await deleteEvent(client, serverId, event._id, choice === "delete-series");
          router.replace({ pathname: "/events/[serverId]", params: { serverId } });
        }}
      />
      {editing ? <EventEditor serverId={serverId} event={event} onClose={() => setEditing(false)} /> : null}
    </ScrollView>
  );
}

/** Who comes, by answer (web: People); organisers also see "Can't go" */
function People({ event, serverId, organiser }: { event: ServerEvent; serverId: string; organiser: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [filter, setFilter] = useState<AttendeeFilter>("Going");
  const [page, setPage] = useState<{ key: string; people: Attendee[]; next?: string; error?: string } | null>(null);
  const [more, setMore] = useState(false);
  const counts = event.counts;
  // the list follows the chosen answer, and the counts (someone answered meanwhile)
  const key = [event._id, filter, counts?.going, counts?.waiting, counts?.maybe, counts?.not_going].join("|");

  useEffect(() => {
    let live = true;
    fetchAttendees(client, serverId, event._id, { answer: filter, limit: 25 }).then(
      (p) => live && setPage({ key, people: filter === "Waiting" ? [...p.attendees].sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "")) : p.attendees, next: p.next ?? undefined }),
      (err) => live && setPage({ key, people: [], error: describeError(err) }),
    );
    return () => {
      live = false;
    };
  }, [client, serverId, event._id, filter, key]);

  const loadMore = async () => {
    if (!page?.next || more) return;
    setMore(true);
    try {
      const p = await fetchAttendees(client, serverId, event._id, { answer: filter, after: page.next, limit: 25 });
      setPage({ ...page, people: [...page.people, ...p.attendees], next: p.next ?? undefined });
    } catch (err) {
      setPage({ ...page, error: describeError(err) });
    } finally {
      setMore(false);
    }
  };

  const filters: { value: AttendeeFilter; label: string; count: number }[] = [
    { value: "Going", label: t({ message: "Going", context: "event answer" }), count: counts?.going ?? 0 },
    ...((counts?.waiting ?? 0) > 0 || filter === "Waiting" ? [{ value: "Waiting" as const, label: t`Waiting`, count: counts?.waiting ?? 0 }] : []),
    { value: "Maybe", label: t({ message: "Maybe", context: "event answer" }), count: counts?.maybe ?? 0 },
    ...(organiser ? [{ value: "NotGoing" as const, label: t({ message: "Can't go", context: "event answer" }), count: counts?.not_going ?? 0 }] : []),
  ];
  const name = (a: Attendee) => client.users.get(a.user._id)?.displayName ?? a.user.display_name ?? a.user.username;
  const current = page?.key === key ? page : null;

  return (
    <View style={{ gap: 12 }}>
      <View accessibilityRole="tablist" accessibilityLabel={t`Answers`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {filters.map((f) => (
          <Chip key={f.value} testID={`event-people-${f.value}`} radio selected={filter === f.value} onPress={() => setFilter(f.value)} label={`${f.label} (${f.count})`} />
        ))}
      </View>
      {!current ? (
        <ActivityIndicator color={palette.muted} />
      ) : current.error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {current.error}
        </AText>
      ) : !current.people.length ? (
        <AText size={13} line={18} color={palette.fg2}>
          {t`Nobody yet.`}
        </AText>
      ) : (
        <RowGroup>
          {current.people.map((a, i) => (
            <Pressable
              key={a.user._id}
              accessibilityRole="button"
              onPress={() => openProfile(a.user._id, serverId)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
            >
              <Avatar url={client.users.get(a.user._id)?.avatarURL} name={name(a)} size={28} />
              <View style={{ flex: 1 }}>
                <AText autoDir size={15} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                  {name(a)}
                </AText>
                {filter === "Waiting" ? (
                  <AText size={13} line={18} color={palette.muted}>
                    {t`Number ${i + 1} in line`}
                  </AText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </RowGroup>
      )}
      {current?.next ? (
        <Pressable accessibilityRole="button" onPress={() => void loadMore()} style={{ alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 16, borderRadius: 10, justifyContent: "center", backgroundColor: palette.tonal }}>
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {t`Show more`}
          </AText>
        </Pressable>
      ) : null}
    </View>
  );
}
