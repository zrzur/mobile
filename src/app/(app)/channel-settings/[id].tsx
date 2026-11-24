import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";

import { useClient } from "@/client/ClientProvider";
import { useChannel } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { ScreenLoading } from "@/ui/settings/server/controls";
import { ChannelSettings } from "@/ui/settings/channel/ChannelSettings";

/** Channel settings (gear on a channel) */
export default function ChannelSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useClient();
  const channel = useChannel(id);
  const ready = useSolid(useCallback(() => client.ready(), [client]));
  useEffect(() => {
    if (ready && !channel) {
      if (router.canGoBack()) router.back();
      else router.replace("/home");
    }
  }, [ready, channel]);
  if (!channel) return <ScreenLoading />;
  return <ChannelSettings key={channel.id} channel={channel} />;
}
