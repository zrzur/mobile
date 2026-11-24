import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { ScreenHeader } from "@/ui/app/parts";
import { useWide } from "@/ui/app/useWide";
import { AText } from "@/ui/auth/parts";
import { ProfileView } from "@/ui/profile/ProfileView";

/** A person's full profile as a page (links from notifications, deep links) */
export default function ProfilePage() {
  const { id, server } = useLocalSearchParams<{ id: string; server?: string }>();
  const { t } = useLingui();
  const { palette } = useTheme();
  const window = useWindowDimensions();
  const wide = useWide();
  // the page's own width: on a tablet the side menu takes its part first
  const [room, setRoom] = useState<number | null>(null);
  const page = room ?? window.width;
  // tablets: the profile keeps the dialog's width, never wider than the page
  const width = wide ? Math.min(460, page) : page;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]} onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} style={{ flex: 1 }}>
          {t`Profile`}
        </AText>
      </ScreenHeader>
      <ProfileView
        key={`${id}:${server ?? ""}`}
        userId={id}
        serverId={server}
        width={width}
        onLeave={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        wrap={(children, surface) => (
          <ScrollView style={{ flex: 1, backgroundColor: surface }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: "center" }}>
            <View testID="profile-page" style={{ width }}>
              {children}
            </View>
          </ScrollView>
        )}
      />
    </SafeAreaView>
  );
}
