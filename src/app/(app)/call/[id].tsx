import { useLocalSearchParams } from "expo-router";

import { VoicePage } from "@/voice/ui/VoicePage";

/** A DM or group call: start or join it, or the call when you are in it */
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VoicePage id={id} />;
}
