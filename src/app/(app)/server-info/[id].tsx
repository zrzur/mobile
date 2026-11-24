import { useLocalSearchParams } from "expo-router";

import { ServerInfoScreen } from "@/ui/server/ServerInfo";

/** Server information (web: ServerInfo modal, a page on a phone) */
export default function ServerInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ServerInfoScreen serverId={id} />;
}
