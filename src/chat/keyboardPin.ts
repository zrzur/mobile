import { useEffect, useRef } from "react";
import { Keyboard, Platform } from "react-native";

/** Something with `scrollToEnd` (a FlashList or ScrollView ref) */
type Scrollable = { scrollToEnd: (options?: { animated?: boolean }) => void } | null;

/** The keyboard event to follow: iOS announces the keyboard before it moves, Android only after */
export function keyboardShowEvent(os: string): "keyboardWillShow" | "keyboardDidShow" {
  return os === "ios" ? "keyboardWillShow" : "keyboardDidShow";
}

/** How dragging a chat list lowers the keyboard (iMessage / WhatsApp behaviour) */
export const chatKeyboardDismissMode: "interactive" | "on-drag" = Platform.OS === "ios" ? "interactive" : "on-drag";

/**
 * Keeps a chat list on its newest message when the keyboard opens: the
 * keyboard-avoiding view shrinks the list from the bottom and the list
 * keeps its offset, so without this the newest messages slide under the
 * composer. Only while `pinned` (the reader is at the bottom of the present).
 */
export function useKeepBottomOnKeyboard(list: { current: Scrollable }, pinned: boolean) {
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  });
  useEffect(() => {
    const sub = Keyboard.addListener(keyboardShowEvent(Platform.OS), () => {
      if (!pinnedRef.current) return;
      // after the layout change the keyboard caused (on Android the
      // keyboard-avoiding view adds its padding on the same event)
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), Platform.OS === "ios" ? 0 : 80);
    });
    return () => sub.remove();
  }, [list]);
}
