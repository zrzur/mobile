import { router } from "expo-router";

import { ConversationList } from "@/ui/app/ConversationList";
import { MenuScreen } from "@/ui/app/MenuScreen";

/** First screen after login on a phone: the rail and the Messages list */
export default function Home() {
  return (
    <MenuScreen tab="messages">
      <ConversationList onAddFriend={() => router.push("/friends?add=1")} onCreateGroup={() => router.push("/new-group")} />
    </MenuScreen>
  );
}
