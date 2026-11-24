import "../polyfills";
import "@/notifications/backgroundTask";

import { I18nProvider } from "@lingui/react";
import { useFonts } from "expo-font";
import { Stack, router, useRootNavigationState, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { i18n, initI18n, reloadApp } from "@/i18n/i18n";
import { FONT_FILES } from "@/theme/fonts";
import { webDir } from "@/ui/kit/direction";
import { needsRedirect, redirectReady } from "@/auth/redirect";
import { SystemAppearance } from "@/ui/SystemAppearance";
import { GestureRoot } from "@/ui/kit/GestureRoot";
import { loadHapticsPref } from "@/ui/kit/haptics";
import { FADE_DURATION } from "@/ui/app/transitions";
import { useReduceMotion } from "@/ui/kit/motion";
import { useBrowserTheme } from "@/ui/kit/openLink";

SplashScreen.preventAutoHideAsync().catch(() => {});
void loadHapticsPref();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    initI18n()
      .then(({ reload }) => (reload ? reloadApp() : setLanguageReady(true)))
      .catch(() => setLanguageReady(true));
  }, []);

  if ((!fontsLoaded && !fontError) || !languageReady) return null;

  return (
    // one gesture root for the whole app (swipe rows, sheets, viewers)
    <GestureRoot>
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <Routes />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </I18nProvider>
    </GestureRoot>
  );
}

function Routes() {
  const { state } = useAuth();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  useBrowserTheme();

  const segments = useSegments();
  const navigation = useRootNavigationState();

  const signedOut = state.status === "signedOut";
  const account = state.status === "signedIn" ? state.account : undefined;
  // a signed-in account whose step is still being asked for: stay where the address points
  const checking = account === "checking";
  const step = typeof account === "object" ? account.step : undefined;
  const setup = step === "username" || step === "age";
  const inside = state.status === "signedIn" && !setup;
  const group = signedOut ? "(auth)" : setup ? "(setup)" : "(app)";
  const home = signedOut ? "/login" : step === "username" ? "/username" : step === "age" ? "/age" : "/home";

  // the splash stays while the account's step is asked for (the app waits for it)
  useEffect(() => {
    if (state.status !== "loading" && !checking) SplashScreen.hideAsync().catch(() => {});
  }, [state.status, checking]);

  // each state lives in its own group: send the person there when it changes,
  // once the root navigator is ready and lists that group (a guard that just
  // opened registers its group a render later; navigating before that sends
  // REMOVE_ROUTES / ROUTE_NAMES_CHANGED to a navigator that is going away)
  const routeNames = (navigation?.routeNames ?? []).join(",");
  useEffect(() => {
    if (state.status === "loading" || checking || !navigation?.key) return;
    if (!redirectReady(routeNames.split(","), group)) return;
    if (needsRedirect(segments, group, setup ? home.slice(1) : undefined)) router.replace(home);
  }, [state.status, checking, navigation?.key, routeNames, segments, group, home, setup]);

  if (state.status === "loading") return null;

  return (
    // web: one `dir` for the whole app (react-native-web reads start/end from it)
    // the frame colour behind every screen: nothing white or black shows mid-transition
    <View {...webDir()} style={{ flex: 1, backgroundColor: palette.frame }}>
    <StatusBar style={palette.dark ? "light" : "dark"} />
    <SystemAppearance />
    <Stack
      screenOptions={{
        headerShown: false,
        // signed out, setup, signed in: a quiet cross-fade between the groups
        animation: reduce ? "none" : "fade",
        animationDuration: FADE_DURATION,
        contentStyle: { backgroundColor: palette.frame },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* account links from email: the token is the proof, so they open signed in or out */}
      <Stack.Screen name="delete/[token]" options={{ animation: reduce ? "fade" : "default" }} />
      <Stack.Screen name="confirm-change/[token]" options={{ animation: reduce ? "fade" : "default" }} />
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={setup}>
        <Stack.Screen name="(setup)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={inside}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
    </View>
  );
}
