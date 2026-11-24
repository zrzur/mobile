import { useLocalSearchParams } from "expo-router";

import { ForumScreen } from "@/ui/forum/ForumScreen";

/** A forum channel: its posts, tags and New post */
export default function Forum() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ForumScreen key={id} id={id} />;
}
