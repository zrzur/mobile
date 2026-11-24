import type { ReactNode } from "react";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLingui } from "@lingui/react/macro";

import { useTheme } from "@/theme/ThemeProvider";

import { AText } from "../auth/parts";
import { ConnectionBanner } from "../ConnectionBanner";
import { Logo } from "../Logo";

import { PhoneTabs, type Tab } from "./PhoneTabs";
import { Rail } from "./Rail";
import { useWide } from "./useWide";
import { YouSheet } from "./YouSheet";

/**
 * The menu side of the phone layout (web: MainBar): the server rail, the
 * list panel (Messages or a server's channels) and the floating tab bar.
 */
export function MenuScreen({ serverId, tab, children }: { serverId?: string; tab: Tab; children: ReactNode }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const wide = useWide();
  const [you, setYou] = useState(false);
  if (wide) {
    // tablets: the menu sits on the left already (SideMenu)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <Logo size={72} color={palette.muted} />
        <AText size={15} line={22} color={palette.muted} style={{ textAlign: "center" }}>
          {t`Pick a conversation or a channel.`}
        </AText>
      </View>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ConnectionBanner />
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Rail selected={serverId} />
        <View
          style={{
            flex: 1,
            marginTop: 8,
            borderTopStartRadius: 10,
            borderTopWidth: 1,
            borderStartWidth: 1,
            borderColor: palette.borderSubtle,
            overflow: "hidden",
          }}
        >
          {children}
        </View>
      </View>
      <PhoneTabs current={tab} onYou={() => setYou(true)} />
      <YouSheet visible={you} onClose={() => setYou(false)} />
    </SafeAreaView>
  );
}
