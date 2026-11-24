/**
 * Events on a month or a week (web: events/EventCalendar, its phone form):
 * a compact grid of day numbers with a mark for each event (accent for
 * yours, green for one happening now), the chosen day's events listed
 * below. Arrows, a swipe to the side or Today move the span; Month and Week
 * switch how much is shown. Times are the person's own clock.
 */
import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button, Chip } from "@/ui/kit";
import { isRTL } from "@/ui/kit/direction";
import { haptics } from "@/ui/kit/haptics";

import { type CalendarView, calendarRange, calendarTitle, chosenAfterMove, dayKey, eventsByDay, keyDay, moveAnchor, weekStartsOn } from "./calendarDays";
import { sdkEvents, useTakingPart } from "./eventsStore";
import type { ServerEvent } from "./types";

/** Marks drawn under a day number (web: CELL_EVENTS) */
const CELL_EVENTS = 3;

export function EventCalendar({ load, day, filter }: { load: (from: string, to: string) => Promise<string[]>; day: (events: ServerEvent[]) => ReactNode; filter?: (event: ServerEvent) => boolean }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const locale = i18n.locale || "en";
  const weekStart = weekStartsOn(locale);
  const today = dayKey(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [chosen, setChosen] = useState(today);
  const [ids, setIds] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const mineSet = useTakingPart();

  const range = useMemo(() => calendarRange(view, anchor, weekStart), [view, anchor, weekStart]);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  useEffect(() => {
    let live = true;
    load(from, to).then(
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
  }, [load, from, to, attempt]);

  // read from the collection, so an answer or a change shows at once
  const snapshot = useSolid(
    useCallback(() => JSON.stringify((ids ?? []).map((id) => sdkEvents(client).get(id)).filter((e): e is ServerEvent => !!e && e.status !== "Draft")), [client, ids]),
  );
  const events = useMemo(() => (JSON.parse(snapshot) as ServerEvent[]).filter((e) => filter?.(e) ?? true), [snapshot, filter]);
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const weeks = useMemo(() => Array.from({ length: range.days.length / 7 }, (_, i) => range.days.slice(i * 7, i * 7 + 7)), [range]);
  const chosenEvents = byDay.get(chosen) ?? [];

  const weekday = (date: Date, long = false) => new Intl.DateTimeFormat(locale, { weekday: long ? "long" : "narrow" }).format(date);
  const longDay = (key: string) => new Intl.DateTimeFormat(locale, { numberingSystem: "latn", weekday: "long", day: "numeric", month: "long" }).format(keyDay(key));

  const move = (step: -1 | 1) => {
    haptics.selection();
    const next = moveAnchor(view, anchor, step);
    setAnchor(next);
    setChosen(chosenAfterMove(view, next, weekStart, chosen));
  };
  const goToday = () => {
    setAnchor(new Date());
    setChosen(today);
  };

  // a swipe to the side moves a span, as the arrows do (mirrored in RTL)
  const rtl = isRTL();
  const swipe = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-16, 16],
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) < 48) return;
      const forward = rtl ? e.translationX > 0 : e.translationX < 0;
      scheduleOnRN(move, forward ? 1 : -1);
    },
  });

  return (
    <View testID="event-calendar" style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable testID="calendar-previous" accessibilityRole="button" accessibilityLabel={view === "month" ? t`Month before` : t`Week before`} onPress={() => move(-1)} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}>
          <Icon name="caret-left" size={16} color={palette.fg2} />
        </Pressable>
        <Pressable testID="calendar-next" accessibilityRole="button" accessibilityLabel={view === "month" ? t`Month after` : t`Week after`} onPress={() => move(1)} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}>
          <Icon name="caret-right" size={16} color={palette.fg2} />
        </Pressable>
        <AText testID="calendar-title" accessibilityLiveRegion="polite" accessibilityLabel={calendarTitle(view, anchor, weekStart, locale)} size={16} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
          {calendarTitle(view, anchor, weekStart, locale, true)}
        </AText>
        <Button size="sm" variant="ghost" label={t({ message: "Today", context: "calendar" })} onPress={goToday} testID="calendar-today" />
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={t`How much to show`} style={{ flexDirection: "row", gap: 8 }}>
        <Chip radio label={t({ message: "Month", context: "calendar" })} selected={view === "month"} onPress={() => setView("month")} testID="calendar-view-month" />
        <Chip radio label={t({ message: "Week", context: "calendar" })} selected={view === "week"} onPress={() => setView("week")} testID="calendar-view-week" />
      </View>

      {error ? (
        <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8 }}>
          <AText size={13} line={18} color={palette.fg2}>
            {error}
          </AText>
          <View style={{ alignSelf: "flex-start" }}>
            <Button size="sm" variant="tonal" label={t`Try again`} onPress={() => setAttempt((n) => n + 1)} />
          </View>
        </View>
      ) : null}

      <GestureDetector gesture={swipe}>
        <View accessibilityLabel={calendarTitle(view, anchor, weekStart, locale)} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row" }}>
            {(weeks[0] ?? []).map((d) => (
              <View key={dayKey(d)} accessible accessibilityLabel={weekday(d, true)} style={{ flex: 1, alignItems: "center", paddingBottom: 4 }}>
                <AText size={12} line={16} weight="semibold" color={palette.muted}>
                  {weekday(d)}
                </AText>
              </View>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={dayKey(week[0])} style={{ flexDirection: "row" }}>
              {week.map((d) => {
                const key = dayKey(d);
                const list = byDay.get(key) ?? [];
                const outside = view === "month" && d.getMonth() !== anchor.getMonth();
                const on = chosen === key;
                const isToday = today === key;
                return (
                  <Pressable
                    key={key}
                    testID="calendar-day"
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={list.length ? t`${longDay(key)}, ${String(list.length)} events` : longDay(key)}
                    onPress={() => {
                      haptics.selection();
                      setChosen(key);
                    }}
                    style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 2 }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? palette.accent : "transparent", borderWidth: isToday && !on ? 1 : 0, borderColor: palette.accent }}>
                      <AText size={14} line={18} weight={on || isToday ? "bold" : "medium"} color={on ? palette.onAccent : outside ? palette.muted : palette.fg} style={{ fontVariant: ["tabular-nums"] }}>
                        {String(d.getDate())}
                      </AText>
                    </View>
                    <View style={{ flexDirection: "row", gap: 2, height: 4 }}>
                      {list.slice(0, CELL_EVENTS).map((e) => (
                        <View key={e._id} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: e.status === "Active" ? palette.online : mineSet.has(e._id) ? palette.accent : palette.muted }} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>

      <View testID="calendar-day-list" style={{ gap: 12 }}>
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {longDay(chosen)}
        </AText>
        {chosenEvents.length ? (
          day(chosenEvents)
        ) : (
          <AText size={14} line={20} color={palette.fg2}>
            {ids === undefined && !error ? t`Loading events` : t`Nothing on this day.`}
          </AText>
        )}
      </View>
    </View>
  );
}
