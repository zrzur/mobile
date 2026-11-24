import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { lastServer } from "@/ui/app/lastServer";
import { MenuScreen } from "@/ui/app/MenuScreen";
import { ServerPanel } from "@/ui/app/ServerPanel";
import { ServerFirstOpen } from "@/ui/onboarding/ServerFirstOpen";
import { ServerSheet } from "@/ui/server/ServerSheet";

/** A server's channels beside the rail */
export default function ServerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (id) lastServer.set(id);
  }, [id]);
  return (
    <MenuScreen tab="servers" serverId={id}>
      <ServerPanel
        serverId={id}
        onServerMenu={() => setMenu(true)}
        onInvite={() => router.push({ pathname: "/invite/[serverId]", params: { serverId: id } })}
      />
      <ServerSheet serverId={id} visible={menu} onClose={() => setMenu(false)} />
      <ServerFirstOpen serverId={id} />
    </MenuScreen>
  );
}
