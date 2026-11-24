import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { eventDay, eventPhase, eventTimes, isUpcoming, placeChannel, placeLink, seatState, startsIn } from "./eventFormat";
import { useRsvp, useServerEvent } from "./eventsStore";
import type { ServerEvent } from "./types";
import { openExternal } from "@/ui/kit/openLink";

export const openEvent = (serverId: string, id: string) => router.push({ pathname: "/event/[id]", params: { id, server: serverId } });

/** Where an event takes place, in a few words (web: EventPlace) */
export function usePlace(event: Pick<ServerEvent, "place">): { icon: IconName; name: string } {
  const { t } = useLingui();
  const client = useClient();
  const channelId = placeChannel(event.place);
  // read live: on a link straight to an event the channels arrive after the first render
  const name = useSolid(useCallback(() => (channelId ? client.channels.get(channelId)?.name : undefined) || undefined, [client, channelId]));
  if (event.place.type === "Voice") return { icon: "speaker-high", name: name ?? t`A voice channel` };
  if (event.place.type === "Text") return { icon: "hash", name: name ?? t`A text channel` };
  return { icon: placeLink(event.place) ? "link" : "globe", name: event.place.location };
}

/** How many take part, in one short line (web: EventCountLine) */
export function useCountLine(event: ServerEvent): string {
  const { t } = useLingui();
  const seats = seatState(event);
  const going = seats.going;
  const maybe = event.counts?.maybe ?? 0;
  if (seats.capacity !== undefined && seats.full) return t`${plural(seats.waiting, { 0: "Full", one: "Full · # waiting", other: "Full · # waiting" })}`;
  if (seats.capacity !== undefined) return t`${going} of ${seats.capacity} seats`;
  if (going + maybe === 0) return t`Nobody answered yet`;
  if (maybe === 0) return t`${plural(going, { one: "# going", other: "# going" })}`;
  return t`${going} going · ${maybe} maybe`;
}

/** A small mark (web: Ticket Stamp) */
export function Stamp({ text, tone, icon }: { text: string; tone?: "good" | "wait"; icon?: IconName }) {
  const { palette } = useTheme();
  const colour = tone === "good" ? palette.onlineText : tone === "wait" ? palette.warningText : palette.fg2;
  return (
    <View testID="event-own-answer" style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: palette.tonal }}>
      {icon ? <Icon name={icon} size={16} color={colour} /> : null}
      <AText size={13} line={18} weight="semibold" color={colour} numberOfLines={1}>
        {text}
      </AText>
    </View>
  );
}

/** Your own answer to an event, as a short mark (web: OwnAnswerMark) */
export function OwnAnswerMark({ event }: { event: ServerEvent }) {
  const { t } = useLingui();
  const mine = useRsvp(event._id);
  if (!mine) return null;
  if (mine.answer === "Going" && mine.waiting) return <Stamp tone="wait" text={mine.position ? t`Number ${mine.position} in line` : t`On the waiting list`} />;
  if (mine.answer === "Going") return <Stamp tone="good" icon="check" text={event.capacity != null ? t`You have a seat` : t`You are going`} />;
  if (mine.answer === "Maybe") return <Stamp text={t({ message: "Maybe", context: "event answer" })} />;
  return <Stamp text={t({ message: "Can't go", context: "event answer" })} />;
}

/** The day of an event in the icon column (web: DateMark) */
export function DateMark({ startsAt, quiet }: { startsAt: string; quiet?: boolean }) {
  const { i18n } = useLingui();
  const { palette } = useTheme();
  const day = eventDay(startsAt, i18n.locale);
  return (
    <View accessible={false} style={{ minWidth: 40, minHeight: 40, paddingHorizontal: 8, borderRadius: 10, backgroundColor: palette.tonal, alignItems: "center", justifyContent: "center" }}>
      <AText size={16} line={18} weight="bold" color={quiet ? palette.muted : palette.fg}>
        {day.day}
      </AText>
      <AText size={11} line={14} color={palette.fg2}>
        {day.month}
      </AText>
    </View>
  );
}

/**
 * The way in while an event happens: open its voice or text channel, or
 * its link (web: JoinButton)
 */
export function JoinButton({ event }: { event: ServerEvent }) {
  const { t } = useLingui();
  const client = useClient();
  const channelId = placeChannel(event.place);
  const link = placeLink(event.place);
  if (!channelId && !link) return null;
  const go = () => {
    if (channelId) {
      const c = client.channels.get(channelId);
      router.push(anyChannelRoute({ id: channelId, isForum: c?.isForum, isThread: c?.isThread, isVoice: c?.isVoice }));
    }
    else if (link) void openExternal(link);
  };
  const [icon, label]: [IconName, string] =
    event.place.type === "Voice" ? ["speaker-high", t({ message: "Join", context: "scheduled events" })] : event.place.type === "Text" ? ["hash", t({ message: "Open", context: "scheduled events" })] : ["arrow-square-out", t`Open link`];
  return <Button size="sm" testID="event-join" icon={icon} label={label} onPress={go} />;
}

function Meta({ icon, text }: { icon?: IconName; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      {icon ? <Icon name={icon} size={16} color={palette.muted} /> : null}
      <AText size={13} line={18} color={palette.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </AText>
    </View>
  );
}

/**
 * One event in a list, as a settings row (web: EventCard): the day at the
 * start, then title, when and where, how many come, and your answer.
 */
/** The server's name on a card in a list of many servers (web: EventCard showServer) */
function ServerMeta({ serverId }: { serverId: string }) {
  const server = useServer(serverId);
  const name = useFields(server, (x) => x.name);
  return name ? <Meta icon="users-three" text={name} /> : null;
}

export const EventRow = memo(function EventRow({ id, serverId, now, first, live, showServer }: { id: string; serverId: string; now: number; first?: boolean; live?: boolean; showServer?: boolean }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const event = useServerEvent(id);
  const mine = useRsvp(id);
  const place = usePlace(event ?? { place: { type: "External", location: "" } });
  const count = useCountLine(event ?? ({ capacity: null, counts: undefined } as unknown as ServerEvent));
  if (!event) return null;
  const phase = eventPhase(event, now);
  const upcoming = isUpcoming(event);
  const state =
    event.status === "Draft"
      ? t({ message: "Draft", context: "scheduled events" })
      : event.status === "Cancelled"
        ? t({ message: "Cancelled", context: "scheduled events" })
        : event.status === "Completed"
          ? t`Over`
          : undefined;
  return (
    <Pressable
      testID={live ? "event-hero" : "event-card"}
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => openEvent(serverId, id)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      {live ? (
        <View style={{ width: 40, alignItems: "center" }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.online }} />
        </View>
      ) : (
        <DateMark startsAt={event.starts_at} quiet={!upcoming} />
      )}
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <AText autoDir size={16} line={22} weight="semibold" color={palette.fg} numberOfLines={2}>
          {event.title}
        </AText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
          {showServer ? <ServerMeta serverId={serverId} /> : null}
          {state ? <Meta text={state} /> : null}
          {live ? (
            <AText size={13} line={18} weight="semibold" color={palette.onlineText}>
              {t`Started ${startsIn(event.started_at ?? event.starts_at, now, i18n.locale)}`}
            </AText>
          ) : phase === "soon" ? (
            <AText size={13} line={18} weight="semibold" color={palette.accentText}>
              {startsIn(event.starts_at, now, i18n.locale)}
            </AText>
          ) : null}
          {!live ? <Meta text={eventTimes(event, i18n.locale)} /> : null}
          <Meta icon={place.icon} text={place.name} />
          {event.visibility && event.visibility !== "Place" ? <Meta icon="lock-simple" text={event.visibility === "Invited" ? t`Invited only` : t`Some roles`} /> : null}
        </View>
        <AText testID="event-count-line" size={13} line={18} weight="medium" color={seatState(event).full ? palette.warningText : palette.fg2}>
          {count}
        </AText>
      </View>
      {live ? (
        <JoinButton event={event} />
      ) : mine || !upcoming ? (
        <OwnAnswerMark event={event} />
      ) : (
        <View testID="event-answer-open" style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.tonal, justifyContent: "center" }}>
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {t({ message: "Answer", context: "event answer" })}
          </AText>
        </View>
      )}
    </Pressable>
  );
});
