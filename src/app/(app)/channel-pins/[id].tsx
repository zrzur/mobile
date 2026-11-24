import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatToast } from "@/chat/ChatOverlays";
import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { PinsList } from "@/ui/search/PinsList";

/** The channel's pinned messages; a tap opens the message in its channel */
export default function Pins() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }}>
          {t`Pinned messages`}
        </AText>
      </ScreenHeader>
      <PinsList key={id} channelId={id} />
      <ChatToast />
    </SafeAreaView>
  );
}
