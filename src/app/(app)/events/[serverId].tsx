import { useLocalSearchParams } from "expo-router";

import { EventsScreen } from "@/ui/events/EventsScreen";

/** A server's events (web: /server/:server/events) */
export default function Events() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  return <EventsScreen serverId={serverId} />;
}
