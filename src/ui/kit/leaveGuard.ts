/**
 * Leaving a form with unsaved changes.
 *
 *   useLeaveGuard(dirty)  on a screen with a form: while `dirty`, Back, the
 *                         header arrow, the swipe-back edge and a modal's
 *                         swipe-down stop and ask (the native stack keeps the
 *                         screen); "Discard" leaves anyway.
 *   confirmDiscard(go)    the same question for a form inside a Modal
 *                         (event editor): calls `go` when the person discards.
 *
 * The text is the web's SettingsForm nudge: "Unsaved changes" / "Save or
 * reset your changes first.", with a warning tap.
 */
import { msg } from "@lingui/core/macro";
import { usePreventRemove } from "expo-router";
import { Alert } from "react-native";

import { i18n } from "@/i18n/i18n";

import { haptics } from "./haptics";

export function confirmDiscard(go: () => void) {
  haptics.warning();
  Alert.alert(i18n._(msg`Unsaved changes`), i18n._(msg`Save or reset your changes first.`), [
    { text: i18n._(msg`Cancel`), style: "cancel" },
    { text: i18n._(msg`Discard`), style: "destructive", onPress: go },
  ]);
}

export function useLeaveGuard(dirty: boolean) {
  usePreventRemove(dirty, ({ repeat }) => confirmDiscard(repeat));
}
