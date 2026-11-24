import { useLocalSearchParams } from "expo-router";

import { decodeParam } from "@/ui/events/eventFormat";
import { EventInvitationScreen } from "@/ui/events/EventLinkScreen";

/** An event invitation link (web: /e/join/:code) */
export default function EventInvitation() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <EventInvitationScreen code={decodeParam(code)} />;
}
