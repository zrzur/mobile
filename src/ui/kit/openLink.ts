/**
 * Opening links outside the app.
 *
 *   openExternal(url)  http(s) opens in the in-app browser (SFSafariViewController
 *                      as a page sheet on iPhone, a form sheet on iPad; Chrome
 *                      Custom Tabs on Android) in the theme's colours; mailto:,
 *                      tel:, otpauth: and store links go to the system.
 *   openLink(href)     a link from content people wrote (messages, profiles,
 *                      bios): own links open inside the app, others pass the
 *                      "External links can be dangerous!" warning first, then
 *                      openExternal. Re-exported from chat/overlays.
 *
 * useBrowserTheme() keeps the browser colours in step with the theme; it is
 * mounted once in the root layout.
 */
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { Linking, Platform } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

let colours: { controls?: string; toolbar?: string } = {};

export function useBrowserTheme() {
  const { palette } = useTheme();
  useEffect(() => {
    colours = { controls: palette.accent, toolbar: palette.frame };
  }, [palette.accent, palette.frame]);
}

/** True for links the in-app browser can show (http and https) */
export function isWebLink(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** A store link opens the store app, not a web page */
function isStoreLink(url: string): boolean {
  return /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com|play\.google\.com\/store)\//i.test(url.trim());
}

/** Open a link outside the app's screens (no warning: use openLink for links people wrote) */
export async function openExternal(url: string): Promise<void> {
  if (!isWebLink(url) || isStoreLink(url) || Platform.OS === "web") {
    await Linking.openURL(url).catch(() => {});
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colours.controls,
      toolbarColor: colours.toolbar,
      dismissButtonStyle: "close",
      enableBarCollapsing: true,
      presentationStyle: Platform.OS === "ios" && Platform.isPad ? WebBrowser.WebBrowserPresentationStyle.FORM_SHEET : WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    // no browser available (rare on Android): hand it to the system
    await Linking.openURL(url).catch(() => {});
  }
}
