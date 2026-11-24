/**
 * Your events in every server at once, soonest first (web: MyEventsPage,
 * route /events): the ones you answered Going or Maybe to, everything
 * coming up that you may see, or a calendar. Each row names its server and
 * opens the event there. Reached from the You sheet.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, ScreenHeader, SearchField, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button, Chip } from "@/ui/kit";
import { usePullRefresh } from "@/ui/kit/PullRefresh";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { eventsEnabled } from "@/ui/server/home";

import { EventRow } from "./EventCard";
import { EventCalendar } from "./EventCalendar";
import { eventMatches, type MyEventsTab, myEventsShown, type PlaceFilter } from "./eventFormat";
import { EventGroup, Problem } from "./EventsScreen";
import { fetchMyEvents, sdkEvents, useTakingPart } from "./eventsStore";
import type { ServerEvent } from "./types";
import { useNow } from "./useNow";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

export function MyEventsScreen() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const now = useNow();
  const on = useSolid(
    useCallback(() => {
      // the node's settings are a plain field: read the signal that says they arrived
      client.configured();
      return eventsEnabled(client);
    }, [client]),
  );
  const [which, setWhich] = useState<MyEventsTab>("mine");
  const [search, setSearch] = useState("");
  const [place, setPlace] = useState<PlaceFilter>("any");
  const [finder, setFinder] = useState(false);
  const [ids, setIds] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const answers = useTakingPart();

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetchMyEvents(client, { limit: 200 }).then(
      (list) => {
        if (!live) return;
        setIds(list);
        setError(undefined);
      },
      (err) => live && setError(describeError(err)),
    );
    return () => {
      live = false;
    };
  }, [client, on, attempt]);

  const pull = usePullRefresh(async () => {
    setIds(await fetchMyEvents(client, { limit: 200 }));
    setError(undefined);
  });

  // small snapshots of the events: only what the list sorts and filters on
  const snapshot = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          (ids ?? [])
            .map((id) => sdkEvents(client).get(id))
            .filter((e): e is ServerEvent => !!e)
            .map((e) => ({ _id: e._id, server: e.server, status: e.status, title: e.title, description: e.description, place: e.place, starts_at: e.starts_at, known: !!client.servers.get(e.server) })),
        ),
      [client, ids],
    ),
  );
  const events = useMemo(() => JSON.parse(snapshot) as (Pick<ServerEvent, "_id" | "server" | "status" | "title" | "description" | "place" | "starts_at"> & { known: boolean })[], [snapshot]);
  const found = useCallback((e: Pick<ServerEvent, "title" | "description" | "place">) => eventMatches(e, search, place), [search, place]);
  const finding = search.trim() !== "" || place !== "any";
  const known = new Set(events.filter((e) => e.known).map((e) => e.server));
  const all = myEventsShown(events, which === "mine" ? "mine" : "all", (id) => answers.has(id), (s) => known.has(s));
  const shown = all.filter(found);
  const loadRange = useCallback((from: string, to: string) => fetchMyEvents(client, { from, to, limit: 200 }), [client]);
  const calendarFilter = useCallback((e: ServerEvent) => found(e) && !!client.servers.get(e.server), [client, found]);

  const tabs: { id: MyEventsTab; label: string }[] = [
    { id: "mine", label: t`I'm taking part` },
    { id: "all", label: t`Everything coming up` },
    { id: "calendar", label: t({ message: "Calendar", context: "scheduled events" }) },
  ];
  const places: { id: PlaceFilter; label: string; icon: IconName }[] = [
    { id: "any", label: t({ message: "All", context: "event places" }), icon: "squares-four" },
    { id: "Voice", label: t({ message: "Voice", context: "event places" }), icon: "speaker-high" },
    { id: "Text", label: t({ message: "Text", context: "event places" }), icon: "hash" },
    { id: "External", label: t({ message: "Elsewhere", context: "event places" }), icon: "globe" },
  ];

  const empty = (title: string, text: string, action?: { label: string; onPress: () => void }) => (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: "center", gap: 8 }}>
      <Icon name="calendar" size={28} color={palette.muted} />
      <AText size={16} line={22} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
        {title}
      </AText>
      <AText size={14} line={22} color={palette.muted} style={{ textAlign: "center" }}>
        {text}
      </AText>
      {action ? (
        <View style={{ marginTop: 8 }}>
          <Button variant="tonal" label={action.label} onPress={action.onPress} testID="my-events-see-all" />
        </View>
      ) : null}
    </View>
  );

  const body = () => {
    if (!on) return empty(t`Nothing is planned in your servers`, t`Events of the next 90 days in servers that use events show up here.`);
    if (which === "calendar")
      return (
        <EventCalendar
          load={loadRange}
          filter={calendarFilter}
          day={(list) => (
            <EventGroup>
              {list.map((e, i) => (
                <EventRow key={e._id} id={e._id} serverId={e.server} now={now} first={i === 0} live={e.status === "Active"} showServer />
              ))}
            </EventGroup>
          )}
        />
      );
    if (error && !ids) return <Problem title={t`The events could not be loaded.`} detail={error} onRetry={() => setAttempt((n) => n + 1)} />;
    if (!ids)
      return (
        <View accessible accessibilityLabel={t`Loading events`}>
          <SkeletonRows count={4} avatar={48} square padding={0} label={false} testID="events-loading" />
        </View>
      );
    if (shown.length)
      return (
        <EventGroup>
          {shown.map((e, i) => (
            <EventRow key={e._id} id={e._id} serverId={e.server} now={now} first={i === 0} live={e.status === "Active"} showServer />
          ))}
        </EventGroup>
      );
    if (all.length)
      return (
        <View testID="events-nothing-found" style={{ padding: 16 }}>
          <AText size={14} line={20} color={palette.fg2}>
            {t`No event matches. Try other words or another place.`}
          </AText>
        </View>
      );
    if (which === "mine") {
      const any = myEventsShown(events, "all", () => true, (s) => known.has(s)).length > 0;
      return empty(t`You are not taking part in any event yet`, t`Answer Going or Maybe to an event in any of your servers and it is kept here.`, any ? { label: t`See everything coming up`, onPress: () => setWhich("all") } : undefined);
    }
    return empty(t`Nothing is planned in your servers`, t`Events of the next 90 days in servers that use events show up here.`);
  };

  return (
    <SafeAreaView testID="my-events-page" style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <Icon name="calendar" size={20} color={palette.fg2} />
        <AText size={18} line={24} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {t`My events`}
        </AText>
        {on ? (
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
      </ScreenHeader>
      {on ? (
        // web ListPhoneFilters: the tabs get their own row under the title
        <View style={{ borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={t`Which events`} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 4 }}>
            {tabs.map((x) => (
              <Chip key={x.id} testID={`my-events-tab-${x.id}`} label={x.label} selected={which === x.id} radio onPress={() => setWhich(x.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96, gap: 24 }} {...keyboardScrollProps} refreshControl={on && which !== "calendar" ? pull.control : undefined} onScroll={pull.onScroll} scrollEventThrottle={16}>
        {body()}
      </ScrollView>
      <Sheet visible={finder} onClose={() => setFinder(false)} testID="events-filter">
        <View style={{ flexDirection: "row" }}>
          <SearchField value={search} onChange={setSearch} placeholder={t`Search events`} testID="events-search" />
        </View>
        <AText size={12} line={16} weight="semibold" color={palette.muted} style={{ paddingHorizontal: 4 }}>
          {t({ message: "Where", context: "scheduled events" })}
        </AText>
        <RowGroup>
          {places.map((p, i) => (
            <GroupRow key={p.id} first={i === 0} testID={`events-place-${p.id}`} icon={p.icon} label={p.label} selected={place === p.id} end={place === p.id ? "check" : undefined} onPress={() => setPlace(p.id)} />
          ))}
        </RowGroup>
      </Sheet>
    </SafeAreaView>
  );
}

/** Open the cross-server events page (for the You sheet, WP3) */
export const openMyEvents = () => router.push("/events");
