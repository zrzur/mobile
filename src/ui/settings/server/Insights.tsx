import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { isRTL } from "@/ui/kit";

import { channelLabel } from "../discovery";
import { SettingsPage, SmallButton } from "../parts";
import { Loading } from "./controls";
import { type Count, INSIGHT_RANGES, type InsightRange, barAt, barHeights, dayDate, hoursMinutes, isEmptyRange, perDay, shares, signed } from "../insights";

type Insights = Awaited<ReturnType<Server["fetchInsights"]>>;
type Row = Insights["rows"][number];

/** A card on the field surface (radius 14, padding 16) */
function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 8 }}>
      {children}
    </View>
  );
}

/** One bar per day, oldest at the start side; touch a bar to read its day */
function Bars({ heights, labels, label }: { heights: number[]; labels: string[]; label: string }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState(-1);
  // the web build sets dir on <html> and leaves I18nManager alone: ask the kit
  const pick = (x: number) => setPicked(barAt(x, width, heights.length, isRTL()));
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPressIn={(e) => pick(e.nativeEvent.locationX)}
        style={{ height: 64, flexDirection: "row", alignItems: "flex-end", gap: heights.length > 40 ? 1 : 2 }}
      >
        {heights.map((h, i) => (
          <View key={i} style={{ flex: 1, height: `${h}%`, minHeight: h ? 2 : 0, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: i === picked ? palette.accentText : palette.accent }} />
        ))}
      </Pressable>
      {picked >= 0 && labels[picked] ? (
        <AText size={12} line={16} color={palette.fg2} accessibilityLiveRegion="polite">
          {labels[picked]}
        </AText>
      ) : null}
    </View>
  );
}

/** Insights (web: server insights), read-only */
export function InsightsPage({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [days, setDays] = useState<InsightRange>(30);
  // cached per range for the life of the page
  const [cache, setCache] = useState<Partial<Record<InsightRange, Insights>>>({});
  const [errors, setErrors] = useState<Partial<Record<InsightRange, string>>>({});
  const [tick, setTick] = useState(0);
  const data = cache[days];
  const error = errors[days];

  useEffect(() => {
    if (data) return;
    let live = true;
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }
    server
      .fetchInsights({ days, timeZone, utcOffset: -new Date().getTimezoneOffset() })
      .then((r) => {
        if (!live) return;
        setCache((c) => ({ ...c, [days]: r }));
        setErrors((e) => ({ ...e, [days]: undefined }));
      })
      .catch((err) => live && setErrors((e) => ({ ...e, [days]: describeError(err) })));
    return () => {
      live = false;
    };
  }, [server, days, data, tick]);

  const locale = intlLocale(i18n.locale);
  const fewer = t`fewer than 5`;
  const num = (v: number) => new Intl.NumberFormat(locale).format(v);
  const count = (v: Count) => (v === null ? fewer : num(v ?? 0));
  const shortDay = (day: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(dayDate(day));
  const unit = (v: number, u: "hour" | "minute") => {
    try {
      return new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "narrow" }).format(v);
    } catch {
      return `${num(v)}${u === "hour" ? "h" : "m"}`;
    }
  };
  const voice = (v: Count) => {
    if (v === null) return fewer;
    const { hours, minutes } = hoursMinutes(v ?? 0);
    return hours ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(minutes, "minute");
  };

  const rangeLabel = (n: number) => i18n._(msg`${plural(n, { one: "# day", other: "# days" })}`);

  let deviceZone = "UTC";
  try {
    deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    deviceZone = "UTC";
  }
  const time_zone = data?.time_zone || deviceZone;
  const date = data?.counted_since ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(dayDate(data.counted_since)) : undefined;

  const rows: Row[] = data?.rows ?? [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const totals = data?.totals;

  type Stat = { id: string; title: string; value: string; detail: string; series: Count[]; fromMin?: boolean; format: (v: Count) => string };
  const stats: Stat[] = [];
  if (data && totals) {
    const change = signed((last?.members ?? 0) - (first?.members ?? 0), num);
    const leaves = count(totals.leaves);
    const avg = perDay(totals.messages, rows.length);
    const average = avg === null ? fewer : num(avg);
    stats.push(
      { id: "members", title: t({ message: "Members", context: "server insights" }), value: num(last?.members ?? 0), detail: t`${change} in this range`, series: rows.map((r) => r.members), fromMin: true, format: (v) => num(v ?? 0) },
      { id: "joins", title: t({ message: "Joined", context: "server insights" }), value: count(totals.joins), detail: t`Left: ${leaves}`, series: rows.map((r) => r.joins), format: count },
      { id: "messages", title: t({ message: "Messages", context: "server insights" }), value: count(totals.messages), detail: t`${average} a day on average`, series: rows.map((r) => r.messages), format: count },
      { id: "active", title: t`Active members`, value: count(totals.active_members), detail: t`people who wrote, a day on average`, series: rows.map((r) => r.active_members), format: count },
      { id: "voice", title: t`Time in voice`, value: voice(totals.voice_minutes), detail: t`all voice channels together`, series: rows.map((r) => r.voice_minutes), format: voice },
    );
  }

  const sources = data
    ? [
        { key: "invite", label: t`Invite links`, value: data.join_sources.invite },
        { key: "discover", label: t({ message: "Discover", context: "server insights" }), value: data.join_sources.discover },
        { key: "vanity", label: t`Custom link`, value: data.join_sources.vanity },
        { key: "other", label: t`Other ways`, value: data.join_sources.other },
      ]
    : [];
  const sourceShares = shares(sources.map((s) => s.value));

  return (
    <SettingsPage title={t({ message: "Insights", context: "server insights" })} description={t`Joins, messages and activity, day by day.`} testID="server-insights">
      <View style={{ gap: 12 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t`Time range`} style={{ flexDirection: "row", padding: 4, gap: 4, borderRadius: 12, backgroundColor: palette.field }}>
          {INSIGHT_RANGES.map((r) => {
            const on = r === days;
            return (
              <Pressable
                key={r}
                testID={`insights-range-${r}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => setDays(r)}
                style={{ flex: 1, minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: on ? palette.tonal : "transparent" }}
              >
                <AText size={14} line={20} weight="semibold" color={on ? palette.fg : palette.fg2}>
                  {rangeLabel(r)}
                </AText>
              </Pressable>
            );
          })}
        </View>
        <AText size={13} line={18} color={palette.muted}>
          {t`Days in your time (${time_zone}). Updated every hour.`}
        </AText>
        {date ? (
          <AText size={13} line={18} color={palette.muted}>
            {t`Counted since ${date}.`}
          </AText>
        ) : null}
      </View>

      {error ? (
        <View accessibilityRole="alert" testID="insights-error" style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 12 }}>
          <AText size={14} line={20} color={palette.fg}>
            {error}
          </AText>
          <View style={{ alignSelf: "flex-start" }}>
            <SmallButton
              label={t`Try again`}
              testID="insights-retry"
              onPress={() => {
                setErrors((e) => ({ ...e, [days]: undefined }));
                setTick((n) => n + 1);
              }}
            />
          </View>
        </View>
      ) : !data ? (
        <View accessibilityState={{ busy: true }} aria-busy>
          <Loading text={t`Loading insights…`} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {isEmptyRange(rows) ? (
            <Card testID="insights-empty">
              <AText size={14} line={20} color={palette.fg2}>
                {t`Nothing counted yet. Joins show at once, messages within an hour.`}
              </AText>
            </Card>
          ) : null}
          {stats.map((s) => {
            const title = s.title;
            const value = s.value;
            const firstDay = first ? shortDay(first.day) : "";
            const lastDay = last ? shortDay(last.day) : "";
            const labels = rows.map((r, i) => {
              const day = shortDay(r.day);
              const shown = s.format(s.series[i]);
              return t`${day}: ${shown}`;
            });
            return (
              <Card key={`${s.id}-${days}`} testID={`insights-${s.id}`}>
                <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                  {title}
                </AText>
                <AText size={24} line={30} weight="bold" color={palette.header}>
                  {value}
                </AText>
                <AText size={13} line={18} color={palette.muted}>
                  {s.detail}
                </AText>
                <Bars heights={barHeights(s.series, s.fromMin)} labels={labels} label={t`${title}: ${value}, ${firstDay} – ${lastDay}`} />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <AText size={12} line={16} color={palette.muted}>
                    {firstDay}
                  </AText>
                  <AText size={12} line={16} color={palette.muted}>
                    {lastDay}
                  </AText>
                </View>
              </Card>
            );
          })}

          <Card testID="insights-sources">
            <AText size={16} line={22} weight="semibold" color={palette.header}>
              {t`Where joins came from`}
            </AText>
            {sources.map((s, i) => (
              <View key={s.key} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                    {s.label}
                  </AText>
                  <AText size={14} line={20} weight="semibold" color={palette.fg}>
                    {count(s.value)}
                  </AText>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.barFill, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={{ width: `${sourceShares[i]}%`, height: 6, borderRadius: 3, backgroundColor: palette.accent }} />
                </View>
              </View>
            ))}
          </Card>

          <Card testID="insights-channels">
            <AText size={16} line={22} weight="semibold" color={palette.header}>
              {t`Busiest channels`}
            </AText>
            {data.top_channels.length === 0 ? (
              <AText size={14} line={20} color={palette.muted}>
                {t`No messages in this range yet.`}
              </AText>
            ) : (
              data.top_channels.map((c, i) => {
                const name = client.channels.get(c.channel)?.name;
                const n = i + 1;
                return (
                  <View key={c.channel} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
                    <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
                      {name ? `${num(n)}. ${channelLabel(name)}` : `${num(n)}. ${t`Unknown channel`}`}
                    </AText>
                    <AText size={14} line={20} weight="semibold" color={palette.fg}>
                      {count(c.messages)}
                    </AText>
                  </View>
                );
              })
            )}
          </Card>
        </View>
      )}

      <AText size={13} line={18} color={palette.muted}>
        {t`Only totals, never who. Every count from 1 to 4 except the member total shows as “fewer than 5”, bots are not counted as active members or in voice time, and messages count only in channels you can see. Counts are kept for 90 days.`}
      </AText>
    </SettingsPage>
  );
}
