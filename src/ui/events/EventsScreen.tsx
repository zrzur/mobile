import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, ScreenHeader, SearchField, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button, Chip } from "@/ui/kit";
import { serverEventsOn } from "@/ui/server/home";

import { EventRow } from "./EventCard";
import { EventCalendar } from "./EventCalendar";
import { EventEditor } from "./EventEditor";
import { eventMatches, type PlaceFilter } from "./eventFormat";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { fetchRange, fetchServerEvents, sdkEvents, useDraftIds, useEventsLoaded, useTakingPart } from "./eventsStore";
import type { ServerEvent } from "./types";
import { canManageEvents } from "./permission";
import { useNow } from "./useNow";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

type Tab = "upcoming" | "mine" | "calendar" | "past" | "drafts";


/** A titled group of event rows (web: EventGroup = SettingsSection) */
export function EventGroup({ title, children }: { title?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {title ? (
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {title}
        </AText>
      ) : null}
      <RowGroup>{children}</RowGroup>
    </View>
  );
}

/** The web's EmptyState: a title, a line, an action */
export function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: "center", gap: 8 }}>
      <Icon name="calendar" size={28} color={palette.muted} />
      <AText size={16} line={22} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
        {title}
      </AText>
      <AText size={14} line={22} color={palette.muted} style={{ textAlign: "center" }}>
        {text}
      </AText>
      {action && onAction ? (
        <View style={{ marginTop: 8 }}>
          <Button label={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function Problem({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <View accessibilityRole="alert" testID="events-error" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8 }}>
      <AText size={15} line={22} weight="semibold" color={palette.fg}>
        {title}
      </AText>
      {detail ? (
        <AText size={13} line={18} color={palette.fg2}>
          {detail}
        </AText>
      ) : null}
      {onRetry ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button size="sm" variant="tonal" label={t`Try again`} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** The page of a server whose managers have not turned events on (web: EventsOff) */
function EventsOff({ serverId }: { serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const canManage = useFields(server, (s) => s.havePermission("ManageServer"));
  return (
    // web Off: one plain line in a box, and for managers the way to the switch
    <View testID="events-off" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, alignItems: "flex-start", gap: 8 }}>
      <AText size={15} line={24} color={palette.fg}>
        {t`Events are off in this server.`}
      </AText>
      {canManage ? (
        <Button
          size="sm"
          testID="events-off-settings"
          label={t`Open server settings`}
          onPress={() => router.push({ pathname: "/server-settings/[id]", params: { id: serverId } })}
        />
      ) : null}
    </View>
  );
}

/**
 * A server's events (web: EventsPage): happening now, upcoming, yours,
 * the last three months and the drafts, with search and place filter.
 * Opened from the Events row at the top of the channel list.
 */
export function EventsScreen({ serverId }: { serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const head = useFields(server, (s) => {
    // the node's settings are a plain field: read the signal that says they arrived so "on" follows them
    client.configured();
    return { on: serverEventsOn(client, s), manage: canManageEvents(s) };
  });
  const now = useNow();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const [place, setPlace] = useState<PlaceFilter>("any");
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [past, setPast] = useState<{ ids: string[]; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [finder, setFinder] = useState(false);
  const loaded = useEventsLoaded(serverId);
  const draftIds = useDraftIds(serverId);
  const manage = !!head?.manage;
  const on = !!head?.on;

  // pull to refresh: the server's events again (and the past list on its tab)
  const pull = usePullRefresh(async () => {
    await fetchServerEvents(client, serverId, manage);
    setError(undefined);
    if (tab === "past") setPast(null);
  });

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetchServerEvents(client, serverId, manage).then(
      () => live && setError(undefined),
      (err) => live && setError(describeError(err)),
    );
    return () => {
      live = false;
    };
  }, [client, serverId, manage, on, attempt]);

  useEffect(() => {
    if (tab !== "past" || past) return;
    let live = true;
    const to = new Date();
    const from = new Date(to.getTime() - 92 * 24 * 60 * 60_000);
    fetchRange(client, serverId, from.toISOString(), to.toISOString()).then(
      (list) => live && setPast({ ids: list.filter((e) => e.status === "Completed" || e.status === "Cancelled").sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).map((e) => e._id) }),
      (err) => live && setPast({ ids: [], error: describeError(err) }),
    );
    return () => {
      live = false;
    };
  }, [tab, past, client, serverId]);

  // the events as small snapshots: only what the list sorts and filters on
  const snapshot = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          sdkEvents(client)
            .forServer(serverId)
            .map((e) => ({ _id: e._id, status: e.status, title: e.title, description: e.description, place: e.place, starts_at: e.starts_at })),
        ),
      [client, serverId],
    ),
  );
  const events = useMemo(() => JSON.parse(snapshot) as Pick<ServerEvent, "_id" | "status" | "title" | "description" | "place" | "starts_at">[], [snapshot]);
  const found = (e: Pick<ServerEvent, "title" | "description" | "place">) => eventMatches(e, search, place);
  const finding = search.trim() !== "" || place !== "any";
  const live = events.filter((e) => e.status === "Active" && found(e));
  const upcoming = events.filter((e) => e.status === "Scheduled");
  const answers = useTakingPart();
  // the calendar asks for the span it shows (web: fetchRange)
  const loadRange = useCallback((from: string, to: string) => fetchRange(client, serverId, from, to).then((list) => list.map((e) => e._id)), [client, serverId]);
  const shown = (tab === "mine" ? events.filter((e) => answers.has(e._id)) : upcoming).filter(found);

  const tabs: { id: Tab; label: string }[] = [
    { id: "upcoming", label: t`Upcoming` },
    { id: "mine", label: t`My events` },
    { id: "calendar", label: t({ message: "Calendar", context: "scheduled events" }) },
    { id: "past", label: t`Past` },
    ...(manage ? [{ id: "drafts" as const, label: t`Drafts` }] : []),
  ];
  // web FindPanel: the places under "Where"
  const places: { id: PlaceFilter; label: string; icon: IconName }[] = [
    { id: "any", label: t({ message: "All", context: "event places" }), icon: "squares-four" },
    { id: "Voice", label: t({ message: "Voice", context: "event places" }), icon: "speaker-high" },
    { id: "Text", label: t({ message: "Text", context: "event places" }), icon: "hash" },
    { id: "External", label: t({ message: "Elsewhere", context: "event places" }), icon: "globe" },
  ];

  const nothing = (
    <View testID="events-nothing-found" accessibilityRole="text" style={{ padding: 16 }}>
      <AText size={14} line={20} color={palette.fg2}>
        {t`No event matches. Try other words or another place.`}
      </AText>
    </View>
  );

  const body = () => {
    // the server (and the node's settings) still loading is not "off"
    if (!head)
      return (
        <View accessible accessibilityLabel={t`Loading events`}>
          <SkeletonRows count={4} avatar={48} square padding={0} label={false} testID="events-loading" />
        </View>
      );
    if (!on) return <EventsOff serverId={serverId} />;
    if (error && !loaded) return <Problem title={t`The events could not be loaded.`} detail={error} onRetry={() => setAttempt((n) => n + 1)} />;
    if (!loaded)
      return (
        <View accessible accessibilityLabel={t`Loading events`}>
          <SkeletonRows count={4} avatar={48} square padding={0} label={false} testID="events-loading" />
        </View>
      );
    if (tab === "calendar")
      return (
        <EventCalendar
          load={loadRange}
          filter={found}
          day={(list) => (
            <EventGroup>
              {list.map((e, i) => (
                <EventRow key={e._id} id={e._id} serverId={serverId} now={now} first={i === 0} live={e.status === "Active"} />
              ))}
            </EventGroup>
          )}
        />
      );
    if (tab === "past") {
      if (!past)
        return (
          <View accessible accessibilityLabel={t`Loading events`}>
            <SkeletonRows count={4} avatar={48} square padding={0} label={false} testID="events-loading" />
          </View>
        );
      if (past.error) return <Problem title={t`The events could not be loaded.`} detail={past.error} />;
      if (!past.ids.length) return <Empty title={t`Nothing in the last three months`} text={t`Events that are over or were called off show up here.`} />;
      return <PastList ids={past.ids} serverId={serverId} now={now} search={search} place={place} nothing={nothing} />;
    }
    if (tab === "drafts") {
      if (!draftIds.length) return <Empty title={t`No drafts`} text={t`Save an event as a draft to finish it later. Only organisers see drafts.`} />;
      return (
        <EventGroup>
          {draftIds.map((id, i) => (
            <EventRow key={id} id={id} serverId={serverId} now={now} first={i === 0} />
          ))}
        </EventGroup>
      );
    }
    return (
      <View style={{ gap: 32 }}>
        {tab === "upcoming" && live.length ? (
          <EventGroup title={t`Happening now`}>
            {live.map((e, i) => (
              <EventRow key={e._id} id={e._id} serverId={serverId} now={now} first={i === 0} live />
            ))}
          </EventGroup>
        ) : null}
        {shown.length ? (
          <EventGroup title={tab === "mine" ? t`My events` : t`Upcoming`}>
            {shown.map((e, i) => (
              <EventRow key={e._id} id={e._id} serverId={serverId} now={now} first={i === 0} />
            ))}
          </EventGroup>
        ) : finding ? (
          tab === "mine" || !live.length ? (
            nothing
          ) : null
        ) : tab === "mine" ? (
          <Empty title={t`You have not answered any event here`} text={t`Events you answer Going or Maybe to are kept here.`} />
        ) : !events.some((e) => e.status === "Active") ? (
          <Empty
            title={t`No events planned yet`}
            text={manage ? t`Plan a game night, a tournament or a meetup. Members answer once and keep their place.` : t`When the organisers plan something, it shows up here.`}
            action={manage ? t`New event` : undefined}
            onAction={() => setEditing(true)}
          />
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView testID="events-page" style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <Icon name="calendar" size={20} color={palette.fg2} />
        <AText size={18} line={24} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {t({ message: "Events", context: "scheduled events" })}
        </AText>
        {on && tab !== "drafts" ? (
          <Pressable
            testID="events-find"
            accessibilityRole="button"
            accessibilityLabel={finding ? t`Search and filter events (a filter is set)` : t`Search and filter events`}
            onPress={() => setFinder(true)}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}
          >
            <View>
              <Icon name="magnifying-glass" size={18} color={palette.fg2} />
              {finding ? <View style={{ position: "absolute", top: -2, end: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }} /> : null}
            </View>
          </Pressable>
        ) : null}
        {on && manage ? <Button size="sm" icon="plus" label={t`New event`} variant={live.length ? "tonal" : "primary"} testID="events-schedule" onPress={() => setEditing(true)} /> : null}
      </ScreenHeader>
      {on ? (
        // web ListPhoneFilters: the tabs get their own row under the title
        <View style={{ borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={t`Which events`} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 4 }}>
            {tabs.map((x) => (
              <Chip key={x.id} testID={`events-tab-${x.id}`} label={x.label} selected={tab === x.id} radio onPress={() => setTab(x.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96, gap: 24 }} {...keyboardScrollProps} refreshControl={on ? pull.control : undefined} onScroll={pull.onScroll} scrollEventThrottle={16}>
        {body()}
      </ScrollView>
      {editing ? <EventEditor serverId={serverId} onClose={() => setEditing(false)} /> : null}
      {/* web FindPanel: the search and the place, in one sheet */}
      <Sheet visible={finder} onClose={() => setFinder(false)} testID="events-filter">
        <View style={{ flexDirection: "row" }}>
          <SearchField value={search} onChange={setSearch} placeholder={t`Search events`} testID="events-search" />
        </View>
        <AText size={12} line={16} weight="semibold" color={palette.muted} style={{ paddingHorizontal: 4 }}>
          {t({ message: "Where", context: "scheduled events" })}
        </AText>
        <RowGroup>
          {places.map((p, i) => (
            <GroupRow
              key={p.id}
              first={i === 0}
              testID={`events-place-${p.id}`}
              icon={p.icon}
              label={p.label}
              selected={place === p.id}
              end={place === p.id ? "check" : undefined}
              onPress={() => setPlace(p.id)}
            />
          ))}
        </RowGroup>
      </Sheet>
    </SafeAreaView>
  );
}

function PastList({ ids, serverId, now, search, place, nothing }: { ids: string[]; serverId: string; now: number; search: string; place: PlaceFilter; nothing: ReactNode }) {
  const client = useClient();
  const { t } = useLingui();
  const visible = ids.filter((id) => {
    const e = sdkEvents(client).get(id);
    return !e || eventMatches(e, search, place);
  });
  if (!visible.length) return <>{nothing}</>;
  return (
    <EventGroup title={t`Past`}>
      {visible.map((id, i) => (
        <EventRow key={id} id={id} serverId={serverId} now={now} first={i === 0} />
      ))}
    </EventGroup>
  );
}
