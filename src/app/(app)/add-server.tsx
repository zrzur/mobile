import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { AddServerFlow } from "@/ui/invite/CreateServer";
import { parseInviteCode } from "@/ui/invite/inviteLogic";

/**
 * Create or join a server (web: create_or_join_server), presented as a modal
 * card: swipe down or the X closes it. `?code=` opens straight on an
 * invite's preview card.
 */
export default function AddServer() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { palette } = useTheme();
  const linked = typeof code === "string" ? parseInviteCode(code) : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right"]}>
      <AddServerFlow code={linked} />
    </SafeAreaView>
  );
}
