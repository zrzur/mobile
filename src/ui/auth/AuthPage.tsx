import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";

import { Icon } from "../Icon";
import { Logo } from "../Logo";
import { AText, FlowEnter } from "./parts";
import { Sky } from "./Sky";
import { KeyboardSafeScreen, keyboardScrollProps } from "@/ui/kit/keyboard";
import { openExternal } from "@/ui/kit/openLink";

const GITHUB =
  "M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 6.69539e-07 48.9043 4.309e-07C21.8203 1.92261e-07 -1.9479e-07 22.1074 -4.3343e-07 49.1914C-6.20631e-07 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z";

/** Phone below 600 px wide, like the web's `_phone` */
export function useIsPhone() {
  return useWindowDimensions().width <= 600;
}

/**
 * The shared layout of every signed-out screen, as on app.zrzur.com: the
 * sky of birds, the brand and the account switch on top, one column of at
 * most 400 px, and the legal links at the bottom.
 *
 * `switchTo`: which account link the top bar offers ("signup" on login
 * screens, "login" on sign-up); `null` hides it (username and age steps).
 */
export function AuthPage({
  children,
  switchTo = "signup",
}: {
  children: ReactNode;
  switchTo?: "signup" | "login" | null;
}) {
  const { palette, toggle } = useTheme();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const phone = width <= 600;
  const card = width > 480;

  const footerLink = (label: string, url: string) => (
    <Pressable
      key={url}
      accessibilityRole="link"
      onPress={() => void openExternal(url)}
      style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
    >
      <AText size={13} line={20} color={palette.fg2}>
        {label}
      </AText>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "bottom", "left", "right"]}>
      <KeyboardSafeScreen inset={insets.bottom}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: phone ? 8 : 16,
            paddingHorizontal: phone ? 16 : 24,
            paddingBottom: 16,
          }}
          {...keyboardScrollProps}
        >
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: phone ? 176 : 320, overflow: "hidden" }}>
            <Sky color={palette.muted} />
          </View>

          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, gap: 12 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
              <Logo size={32} color={palette.mark} />
              <AText size={22} line={30} weight="bold" color={palette.header} numberOfLines={1}>
                {t`Zrzur`}
              </AText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: width <= 460 ? 8 : 12 }}>
              {switchTo ? (
                <Pressable
                  testID={switchTo === "signup" ? "switch-signup" : "switch-login"}
                  accessibilityRole="link"
                  onPress={() => router.replace(switchTo === "signup" ? "/signup" : "/login")}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    backgroundColor: pressed ? palette.navSelected : palette.frame,
                    borderWidth: 1,
                    borderColor: palette.outlineBorder,
                    borderRadius: RADIUS,
                  })}
                >
                  <AText size={13} line={20} weight="semibold" color={palette.fg}>
                    {switchTo === "signup" ? t`Create account` : t`Log in`}
                  </AText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t`Toggle colour theme`}
                onPress={toggle}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? palette.navHover : "transparent",
                })}
              >
                <Icon name="moon" size={20} color={palette.iconMuted} />
              </Pressable>
            </View>
          </View>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: phone ? "flex-start" : "center",
              paddingTop: phone ? 32 : 40,
              paddingBottom: phone ? 16 : 32,
            }}
          >
            {/* web: margin "auto 0", centred in the free height when there is room */}
            <View style={{ width: "100%", maxWidth: 400, marginVertical: "auto" }}>
              <FlowEnter>
                <View
                  style={[
                    { gap: 24 },
                    card
                      ? { padding: 24, borderWidth: 1, borderColor: palette.borderSoft, borderRadius: 14, backgroundColor: palette.frame }
                      : null,
                  ]}
                >
                  {children}
                </View>
              </FlowEnter>
            </View>
          </View>

          <View
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 16, minHeight: 44 }}
          >
            <View accessibilityLabel={t`Legal`} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16 }}>
              {footerLink(t`Terms`, "https://zrzur.com/legal/terms")}
              {footerLink(t`Privacy`, "https://zrzur.com/legal/privacy")}
              {footerLink(t`Help`, "https://zrzur.com/guide")}
            </View>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="GitHub"
              onPress={() => void openExternal("https://github.com/zrzur/web")}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Svg width={20} height={20} viewBox="0 0 98 96">
                <Path d={GITHUB} fill={palette.fg2} />
              </Svg>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}
