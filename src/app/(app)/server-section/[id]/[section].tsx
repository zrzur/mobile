import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";

import { useClient } from "@/client/ClientProvider";
import { useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { BansPage } from "@/ui/settings/server/Bans";
import { ChannelsPage } from "@/ui/settings/server/Channels";
import { EmojiPage } from "@/ui/settings/server/Emoji";
import { MembersPage } from "@/ui/settings/server/Members";
import { OverviewPage } from "@/ui/settings/server/Overview";
import { RolesPage } from "@/ui/settings/server/Roles";
import { AppsPage } from "@/ui/settings/server/Apps";
import { AuditLogPage } from "@/ui/settings/server/AuditLog";
import { InsightsPage } from "@/ui/settings/server/Insights";
import { JoiningPage } from "@/ui/settings/server/Joining";
import { SafetyPage } from "@/ui/settings/server/Safety";
import { SoundboardPage } from "@/ui/settings/server/Soundboard";
import { WingsPage } from "@/ui/settings/server/Wings";
import { ScreenLoading } from "@/ui/settings/server/controls";

/** One server-settings page */
export default function ServerSection() {
  const { id, section } = useLocalSearchParams<{ id: string; section: string }>();
  const client = useClient();
  const server = useServer(id);
  const ready = useSolid(useCallback(() => client.ready(), [client]));
  useEffect(() => {
    if (ready && !server) router.back();
  }, [ready, server]);
  if (!server) return <ScreenLoading />;
  switch (section) {
    case "overview":
      return <OverviewPage server={server} />;
    case "channels":
      return <ChannelsPage server={server} />;
    case "roles":
      return <RolesPage server={server} />;
    case "members":
      return <MembersPage server={server} />;
    case "bans":
      return <BansPage server={server} />;
    case "emoji":
      return <EmojiPage server={server} />;
    case "joining":
      return <JoiningPage server={server} />;
    case "safety":
      return <SafetyPage server={server} />;
    case "log":
      return <AuditLogPage server={server} />;
    case "insights":
      return <InsightsPage server={server} />;
    case "soundboard":
      return <SoundboardPage server={server} />;
    case "apps":
      return <AppsPage server={server} />;
    case "wings":
      return <WingsPage server={server} />;
    default:
      return <OverviewPage server={server} />;
  }
}
