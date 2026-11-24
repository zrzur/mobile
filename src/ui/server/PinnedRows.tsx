import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useEffect } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { JoinButton } from "@/ui/events/EventCard";
import { placeChannel } from "@/ui/events/eventFormat";
import { fetchServerEvents, useEventsLoaded, useLiveEventId, useServerEvent, useServerEventIds } from "@/ui/events/eventsStore";
import { Icon, type IconName } from "@/ui/Icon";

import { lobbyShown, serverEventsOn } from "./home";
import { canManageEvents } from "@/ui/events/permission";

/** One row pinned above the channels: the same row as a channel (44 px on a phone) */
function PinnedRow({ icon, label, onPress, aside, testID }: { icon: IconName; label: string; onPress: () => void; aside?: ReactNode; testID: string }) {
  const { palette } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ marginHorizontal: 8, minHeight: 44, paddingVertical: 4 }}>
      {({ pressed }) => (
        <View style={{ minHeight: 36, borderRadius: 10, paddingStart: 12, paddingEnd: 8, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed ? palette.navHover : "transparent" }}>
          <Icon name={icon} size={20} color={palette.fg2} />
          <AText size={15} line={20} weight="semibold" color={palette.fg2} numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </AText>
          {aside}
        </View>
      )}
    </Pressable>
  );
}

/** "Happening now" under the Events row while an event runs */
function LiveBanner({ serverId, eventId }: { serverId: string; eventId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const event = useServerEvent(eventId);
  if (!event) return null;
  const channelId = placeChannel(event.place);
  const placeName = channelId ? client.channels.get(channelId)?.name : undefined;
  return (
    <View testID="event-banner" accessibilityLiveRegion="polite" style={{ marginHorizontal: 8, marginTop: 4, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/event/[id]", params: { id: eventId, server: serverId } })} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 2 }}>
        <AText autoDir size={15} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
          {event.title}
        </AText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.online }} />
          <AText size={13} line={18} color={palette.onlineText} numberOfLines={1} style={{ flexShrink: 1 }}>
            {placeName ? `${t`Happening now`} · ${placeName}` : t`Happening now`}
          </AText>
        </View>
      </Pressable>
      <JoinButton event={event} />
    </View>
  );
}

/**
 * Events and Lobby rows at the top of a server's channel list (web:
 * EventsLink, LobbyLink); no Rules row, the rules channel is already in
 * the list. Put it as the first thing of the list header, under the
 * search row.
 */
export function PinnedRows({ serverId }: { serverId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(serverId);
  const f = useFields(server, (s) => ({ lobby: lobbyShown(s), events: serverEventsOn(client, s), manage: canManageEvents(s) }));
  const ids = useServerEventIds(serverId);
  const live = useLiveEventId(serverId);
  const loaded = useEventsLoaded(serverId);
  const on = !!f?.events;
  const manage = !!f?.manage;
  useEffect(() => {
    // load once per server; the gateway keeps the list current afterwards
    if (on && !loaded) void fetchServerEvents(client, serverId, manage).catch(() => undefined);
  }, [on, loaded, client, serverId, manage]);
  if (!f || (!f.lobby && !f.events)) return null;
  const list = ids ? ids.split(",") : [];
  return (
    <View style={{ paddingTop: 8 }}>
      {f.events ? (
        <>
          <PinnedRow
            testID="events-link"
            icon="calendar"
            label={t({ message: "Events", context: "scheduled events" })}
            onPress={() => router.push({ pathname: "/events/[serverId]", params: { serverId } })}
            aside={
              list.length ? (
                <View testID="events-count" style={{ minWidth: 20, height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}>
                  <AText size={12} line={16} weight="bold" color={palette.fg}>
                    {String(list.length)}
                  </AText>
                </View>
              ) : null
            }
          />
          {live ? <LiveBanner serverId={serverId} eventId={live} /> : null}
        </>
      ) : null}
      {f.lobby ? <PinnedRow testID="lobby-link" icon="house" label={t`Lobby`} onPress={() => router.push({ pathname: "/lobby/[id]", params: { id: serverId } })} /> : null}
    </View>
  );
}
