/**
 * Screen transitions: each kind of screen gets the motion a native app uses.
 *
 *   tab     Messages, Servers (a server's page), Discover: switched
 *           in place with a short cross-fade, never pushed (PhoneTabs and the
 *           rail navigate with replace, so history does not grow).
 *   push    drill-in pages (chat, details, settings, profile, members,
 *           search, threads, forum): the platform's own push ("default": iOS
 *           parallax push with interactive swipe-back, Android's system one).
 *   modal   a task to finish or cancel (add server, new group, forward,
 *           invite): presented from the bottom (iOS card, swipe down to
 *           dismiss; Android slides up).
 *
 * Reduce motion: every kind becomes a short fade. Wide layout (tablet split
 * view): the side menu stays, the right pane cross-fades; modals stay
 * modal (an iPad shows them as a centred card).
 */
import { Platform } from "react-native";

export type ScreenKind = "tab" | "push" | "modal";

export type ScreenMotion = {
  animation: "default" | "fade" | "none" | "slide_from_bottom";
  animationDuration?: number;
  presentation?: "card" | "modal";
  gestureEnabled?: boolean;
  fullScreenGestureEnabled?: boolean;
};

/** Cross-fade length for tabs and reduced motion (ms; iOS honours it, Android uses its own) */
export const FADE_DURATION = 150;

export function screenMotion(kind: ScreenKind, { reduce, wide, os = Platform.OS }: { reduce: boolean; wide: boolean; os?: string }): ScreenMotion {
  if (kind === "modal") {
    if (reduce) return { animation: "fade", animationDuration: FADE_DURATION, presentation: os === "ios" ? "modal" : "card" };
    // iOS: the system card with swipe-down; Android has no sheet card, so it slides up
    return os === "ios" ? { animation: "default", presentation: "modal", gestureEnabled: true } : { animation: "slide_from_bottom", presentation: "card" };
  }
  if (kind === "tab") return { animation: "fade", animationDuration: FADE_DURATION, gestureEnabled: false };
  if (reduce || wide) return { animation: "fade", animationDuration: FADE_DURATION };
  return { animation: "default", gestureEnabled: true };
}

/** Routes in the (app) stack and their kind; anything not listed is a push */
export const SCREEN_KINDS: Record<string, ScreenKind> = {
  home: "tab",
  discover: "tab",
  // the web opens Notifications as a page with a close X over the current tab
  notifications: "modal",
  "server/[id]": "tab",
  "add-server": "modal",
  "new-group": "modal",
  "forward/[messageId]": "modal",
  "invite/[serverId]": "modal",
  "invite-preview/[code]": "modal",
  "bot/[id]": "modal",
  saved: "modal",
  reminders: "modal",
  find: "modal",
};
