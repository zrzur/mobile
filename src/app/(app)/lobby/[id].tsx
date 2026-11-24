import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { ChatToast } from "@/chat/ChatOverlays";

import { LobbyScreen } from "@/ui/lobby/LobbyScreen";

/** A server's lobby (web: /server/:server/lobby) */
export default function Lobby() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1 }}>
      <LobbyScreen serverId={id} />
      <ChatToast />
    </View>
  );
}
