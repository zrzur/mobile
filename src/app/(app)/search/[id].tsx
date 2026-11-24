import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { ChatToast } from "@/chat/ChatOverlays";

import { MessageSearch } from "@/ui/search/MessageSearch";

/**
 * Message search from a channel: `id` is the channel; `scope=server` starts
 * with the whole server, `q` with words or filters (`from:alice has:image`).
 */
export default function Search() {
  const { id, q, scope } = useLocalSearchParams<{ id: string; q?: string; scope?: string }>();
  return (
    <View style={{ flex: 1 }}>
      <MessageSearch key={id} channelId={id} initialQuery={q} initialScope={scope === "server" ? "server" : "channel"} />
      <ChatToast />
    </View>
  );
}
