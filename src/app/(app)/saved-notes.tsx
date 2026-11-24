import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";

/** Opens your saved notes (a channel only you can see; the server makes it on first use) */
export default function SavedNotes() {
  const client = useClient();
  const selfId = useSelfId();
  const { palette } = useTheme();
  const opened = useRef(false);

  useEffect(() => {
    // waits for the account to be ready, then opens once
    if (!selfId || opened.current) return;
    opened.current = true;
    const existing = client.channels.find((c) => c.type === "SavedMessages");
    if (existing) {
      router.replace({ pathname: "/channel/[id]", params: { id: existing.id } });
      return;
    }
    client.api
      .get(`/users/${selfId}/dm` as never)
      .then((channel) => router.replace({ pathname: "/channel/[id]", params: { id: (channel as unknown as { _id: string })._id } }))
      .catch(() => router.back());
  }, [client, selfId]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.frame }}>
      <ActivityIndicator color={palette.accent} />
    </View>
  );
}
