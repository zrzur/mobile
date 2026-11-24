import { useLocalSearchParams } from "expo-router";

import { decodeParam } from "@/ui/events/eventFormat";
import { EventLinkScreen } from "@/ui/events/EventLinkScreen";

/** An event's share link (web: /e/:path) */
export default function EventLink() {
  const { path } = useLocalSearchParams<{ path: string }>();
  return <EventLinkScreen path={decodeParam(path)} />;
}
