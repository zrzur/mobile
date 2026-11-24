import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";

import { useClient } from "@/client/ClientProvider";
import { useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { ScreenLoading } from "@/ui/settings/server/controls";
import { CategorySettings } from "@/ui/settings/channel/CategorySettings";

/** Category settings (gear on a category in Server settings › Channels) */
export default function CategorySettingsScreen() {
  const { id, category } = useLocalSearchParams<{ id: string; category: string }>();
  const client = useClient();
  const server = useServer(id);
  const ready = useSolid(useCallback(() => client.ready(), [client]));
  useEffect(() => {
    if (ready && !server) {
      if (router.canGoBack()) router.back();
      else router.replace("/home");
    }
  }, [ready, server]);
  if (!server) return <ScreenLoading />;
  return <CategorySettings key={`${server.id}/${category}`} server={server} categoryId={category} />;
}
