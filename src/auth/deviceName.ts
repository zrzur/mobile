import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import * as Device from "expo-device";
import { Platform } from "react-native";

/** How this session is named in "Sessions" (e.g. "Zrzur for Android (Pixel 8)") */
export function deviceName(i18n: I18n): string {
  const device = Device.modelName ?? Device.deviceName ?? undefined;
  const platform =
    Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web";
  return device
    ? i18n._(msg`Zrzur for ${platform} (${device})`)
    : i18n._(msg`Zrzur for ${platform}`);
}
