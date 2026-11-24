import { useLocalSearchParams } from "expo-router";

import { VoicePage } from "@/voice/ui/VoicePage";

/** A server voice or stage channel: the lobby, or the call when you are in it */
export default function VoiceChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VoicePage id={id} />;
}
