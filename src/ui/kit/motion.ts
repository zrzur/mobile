/**
 * Motion: the one reduce-motion hook and the shared spring curves.
 *
 * `useReduceMotion()` is true when the app setting says "Reduce", or when it
 * says "Follow device" and the phone asks for less motion. Every new
 * animation reads it: movement and zoom become a short fade or nothing.
 */
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

export function useReduceMotion(): boolean {
  const { appearance } = useTheme();
  const device = useReducedMotion();
  if (appearance.reduceMotion === "reduce") return true;
  if (appearance.reduceMotion === "full") return false;
  return device;
}

/** Press feedback: quick and firm, no visible bounce */
export const PRESS_SPRING = { damping: 20, stiffness: 400, mass: 1 } as const;
/** Sheets and dialogs coming in or snapping (close to the iOS sheet curve) */
export const SHEET_SPRING = { damping: 28, stiffness: 300, mass: 1 } as const;
/** Short fades used instead of movement when motion is reduced */
export const FADE_MS = 160;
