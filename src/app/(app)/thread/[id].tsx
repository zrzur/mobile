import { useLocalSearchParams } from "expo-router";

import { ThreadScreen } from "@/ui/threads/ThreadScreen";

/** A thread or forum post as its own chat screen; `message` (or the older `jump`) scrolls to a message */
export default function Thread() {
  const { id, message, jump } = useLocalSearchParams<{ id: string; message?: string; jump?: string }>();
  return <ThreadScreen key={id} id={id} jump={message || jump || undefined} />;
}
