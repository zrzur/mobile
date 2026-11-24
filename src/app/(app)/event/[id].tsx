import { useLocalSearchParams } from "expo-router";

import { EventScreen } from "@/ui/events/EventScreen";

/** One event (web: /server/:server/events/:event); `server` is the server id */
export default function Event() {
  const { id, server } = useLocalSearchParams<{ id: string; server: string }>();
  return <EventScreen serverId={server} eventId={id} />;
}
