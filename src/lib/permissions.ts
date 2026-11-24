import { msg } from "@lingui/core/macro";
import { Alert, Linking } from "react-native";

import { i18n } from "@/i18n/i18n";

/** What a permission request answered (expo `PermissionResponse` has both fields) */
export type PermissionAnswer = { granted: boolean; canAskAgain: boolean };

/**
 * - `granted`: go on
 * - `denied`: the person said no this time; the system may ask again later
 * - `blocked`: the system will not ask again; only the phone's settings can allow it
 */
export type PermissionOutcome = "granted" | "denied" | "blocked";

export function permissionOutcome(answer: PermissionAnswer): PermissionOutcome {
  if (answer.granted) return "granted";
  return answer.canAskAgain ? "denied" : "blocked";
}

/** Which feature asked, for the explanation */
export type PermissionUse = "camera-photo" | "camera-call" | "microphone-call" | "photos-save";

function texts(use: PermissionUse): { title: string; body: string } {
  switch (use) {
    case "camera-photo":
      return {
        title: i18n._(msg`Camera`),
        body: i18n._(msg`Camera access is blocked. Allow it in your phone's settings to take photos.`),
      };
    case "camera-call":
      return {
        title: i18n._(msg`Camera`),
        body: i18n._(msg`Camera access is blocked. Allow it in your phone's settings to turn on your camera in calls.`),
      };
    case "photos-save":
      return {
        title: i18n._(msg`Photos`),
        body: i18n._(msg`Photo library access is blocked. Allow it in your phone's settings to save photos and videos.`),
      };
    case "microphone-call":
      return {
        title: i18n._(msg`Microphone`),
        body: i18n._(msg`Microphone access is blocked. You joined muted. Allow it in your phone's settings to talk.`),
      };
  }
}

/**
 * Tell the person why a feature did nothing. When the system will not
 * ask again, offer "Open settings" (the only way back); after a plain "no"
 * the next try asks again, so only the call (which goes on muted) says so.
 */
export function explainPermission(use: PermissionUse, outcome: PermissionOutcome): void {
  if (outcome === "granted") return;
  const { title, body } = texts(use);
  if (outcome === "blocked") {
    Alert.alert(title, body, [
      { text: i18n._(msg`Cancel`), style: "cancel" },
      { text: i18n._(msg`Open settings`), onPress: () => void Linking.openSettings() },
    ]);
  } else if (use === "microphone-call") {
    // the call goes on muted: say so, or the silence looks like a fault
    Alert.alert(title, body, [{ text: i18n._(msg`OK`) }]);
  }
}
