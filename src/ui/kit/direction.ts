import { I18nManager, Platform } from "react-native";

/**
 * Whether the layout runs right-to-left. On a phone that is I18nManager
 * (fixed at start); the web build sets `dir` on <html> instead and leaves
 * I18nManager.isRTL false, so read the document there.
 */
export function isRTL(): boolean {
  if (Platform.OS === "web") {
    return typeof document !== "undefined" && document.documentElement?.dir === "rtl";
  }
  return I18nManager.isRTL;
}

/** A transform that turns a directional glyph around in right-to-left */
export function mirrorStyle(): { transform: [{ scaleX: -1 }] } | undefined {
  return isRTL() ? { transform: [{ scaleX: -1 }] } : undefined;
}

/**
 * The web build sets `dir` on <html> only, so react-native-web resolves
 * start/end (paddingStart, `start: 16`) in inline styles as left/right even in
 * Arabic. A `dir` on a View gives everything inside it (sheets and dialogs in
 * portals too: they keep the React context) the right direction. The root
 * layout sets it once. Phones read I18nManager and need nothing.
 */
export function webDir(): { dir?: "rtl" | "ltr" } {
  return Platform.OS === "web" ? { dir: isRTL() ? "rtl" : "ltr" } : {};
}
