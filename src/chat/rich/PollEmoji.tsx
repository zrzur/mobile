import { Image } from "expo-image";
import { Text } from "react-native";

import { emojiUrl } from "@/chat/MessageContent";
import { useClient } from "@/client/ClientProvider";

import { isCustomEmoji } from "./poll";

/** An answer's emoji: a custom one from the CDN, or the Unicode character */
export function PollEmoji({ emoji, size = 20 }: { emoji: string; size?: number }) {
  const client = useClient();
  if (isCustomEmoji(emoji)) {
    const url = emojiUrl(client.configuration?.features?.autumn?.url, emoji);
    if (!url) return null;
    return <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={url} />;
  }
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>{emoji}</Text>;
}
