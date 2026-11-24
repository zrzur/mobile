import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { AText, ScreenHeader } from "@/ui/kit";
import { InviteCard } from "@/ui/invite/InviteCard";

/**
 * The server behind an invite link (web: /invite/{code}), before joining:
 * opened by zrzur.cc links, app links and invites in chat. A modal card:
 * the X or a swipe down closes it.
 */
export default function InvitePreview() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right"]}>
      <ScreenHeader back modal>
        <AText size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Join a server`}
        </AText>
      </ScreenHeader>
      <InviteCard code={typeof code === "string" ? code : ""} />
    </SafeAreaView>
  );
}
