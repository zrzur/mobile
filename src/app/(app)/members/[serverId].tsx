import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { MemberList } from "@/ui/profile/MemberList";

/** A server's members (web member sidebar, a page of its own on a phone) */
export default function Members() {
  const { serverId, channel } = useLocalSearchParams<{ serverId: string; channel?: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }}>
          {t`Members`}
        </AText>
      </ScreenHeader>
      <MemberList key={`${serverId}:${channel ?? ""}`} serverId={serverId} channelId={channel} />
    </SafeAreaView>
  );
}
