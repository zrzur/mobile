/**
 * Haptics: the only way the app vibrates.
 *
 *   haptics.selection()  a tick: tab change, toggle, chip, snap, threshold
 *   haptics.light()      small impact: message sent, reaction removed
 *   haptics.medium()     long-press menu opens, call controls
 *   haptics.heavy()      hang up
 *   haptics.soft()       sheet dismissed, pull-to-refresh armed
 *   haptics.success() / warning() / error()   outcome of an action
 *
 * Every call is a no-op on the web, when the person switched haptics off
 * (Settings > Appearance > Haptics, kept on this device with the other
 * device prefs) and when the phone refuses (errors are swallowed). Haptics
 * do not follow Reduce Motion: they are not movement, and iOS keeps system
 * haptics on with Reduce Motion too; the setting is the one switch.
 */
import * as Haptics from "expo-haptics";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";

import { secureStorage } from "@/lib/secureStorage";

import { useDevicePrefs } from "../settings/user/devicePrefs";
import { HAPTICS_DEFAULTS, HAPTICS_KEY, readPrefs } from "../settings/user/userPrefs";

let enabled = true;
let loading: Promise<void> | undefined;

/** Read the saved switch once (called on first use and at app start) */
export function loadHapticsPref(): Promise<void> {
  loading ??= secureStorage
    .get(HAPTICS_KEY)
    .then((raw) => {
      enabled = readPrefs(raw, HAPTICS_DEFAULTS).enabled;
    })
    .catch(() => {});
  return loading;
}

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function hapticsEnabled() {
  return enabled;
}

function run(fn: () => Promise<void>) {
  if (Platform.OS === "web") return;
  void loadHapticsPref();
  if (!enabled) return;
  try {
    void fn().catch(() => {});
  } catch {
    // a phone without a haptic engine
  }
}

export type HapticKind = "selection" | "light" | "medium" | "heavy" | "soft" | "rigid" | "success" | "warning" | "error";

const impact = (style: Haptics.ImpactFeedbackStyle) => () => run(() => Haptics.impactAsync(style));
const notify = (type: Haptics.NotificationFeedbackType) => () => run(() => Haptics.notificationAsync(type));

export const haptics: Record<HapticKind, () => void> = {
  selection: () => run(() => Haptics.selectionAsync()),
  light: impact(Haptics.ImpactFeedbackStyle.Light),
  medium: impact(Haptics.ImpactFeedbackStyle.Medium),
  heavy: impact(Haptics.ImpactFeedbackStyle.Heavy),
  soft: impact(Haptics.ImpactFeedbackStyle.Soft),
  rigid: impact(Haptics.ImpactFeedbackStyle.Rigid),
  success: notify(Haptics.NotificationFeedbackType.Success),
  warning: notify(Haptics.NotificationFeedbackType.Warning),
  error: notify(Haptics.NotificationFeedbackType.Error),
};

/** Fire a haptic by name (handy from worklets through scheduleOnRN) */
export function buzz(kind: HapticKind) {
  haptics[kind]();
}

/** The settings switch: the saved value plus a setter that also updates the helper at once */
export function useHapticsSetting(): [boolean, (on: boolean) => void] {
  const [prefs, setPrefs, ready] = useDevicePrefs(HAPTICS_KEY, HAPTICS_DEFAULTS);
  useEffect(() => {
    if (ready) setHapticsEnabled(prefs.enabled);
  }, [ready, prefs.enabled]);
  const set = useCallback(
    (on: boolean) => {
      setHapticsEnabled(on);
      setPrefs({ enabled: on });
      if (on) haptics.selection();
    },
    [setPrefs],
  );
  return [prefs.enabled, set];
}
