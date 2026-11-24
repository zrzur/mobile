import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Appearance, Platform } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

/**
 * Keeps the phone's own UI in step with the app's theme. The app follows
 * the device (`userInterfaceStyle: automatic`), so:
 * - a chosen Dark or Light mode overrides the system appearance for this
 *   app (keyboard, alerts, pickers, menus match the app); "System" removes
 *   the override, so the device's choice comes through;
 * - the root view behind screens, keyboard and modal animations takes the
 *   theme's frame colour (no dark flash in the light theme).
 */
export function SystemAppearance() {
  const { palette, appearance } = useTheme();
  useEffect(() => {
    if (Platform.OS === "web") return;
    Appearance.setColorScheme(appearance.mode === "system" ? "auto" : appearance.mode);
  }, [appearance.mode]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.frame).catch(() => undefined);
  }, [palette.frame]);
  return null;
}
