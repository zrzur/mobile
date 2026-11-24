/**
 * The keyboard, one way everywhere (owner, 2026-11-23: bottom bars stay above
 * the keyboard; a tap on empty space closes it).
 *
 * - Tap to close: the app root (GestureRoot, also inside every Modal) closes
 *   the keyboard when a tap lands on nothing that handles it. Buttons, rows,
 *   links and fields still get their taps (the deepest responder wins).
 *   <DismissKeyboard> does the same for a part of a screen.
 * - Scroll views: spread `keyboardScrollProps` (interactive drag-to-close on
 *   iOS, close on drag on Android, taps on buttons keep working).
 * - <KeyboardFooter>: a bottom action bar (Back / Continue, Save) that rides
 *   on top of the keyboard, on its own curve (reanimated useAnimatedKeyboard).
 * - <KeyboardSafeScreen>: a whole screen whose content ends above the keyboard
 *   (instead of KeyboardAvoidingView, which measures wrong inside iOS sheet
 *   modals and pads nothing on edge-to-edge Android). Use one of the two per
 *   screen, not both.
 *
 * The chat composer keeps its own handling (chat/keyboardPin).
 */
import type { ReactNode } from "react";
import { Keyboard, Platform, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { footerPadding, keyboardLift } from "./keyboardMath";

/** The same options everywhere (the sheet uses them too): Android is edge-to-edge */
export const KEYBOARD_OPTIONS = { isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true } as const;

/** Scroll view props: drag closes the keyboard, taps on controls still land */
export const keyboardScrollProps = {
  keyboardDismissMode: Platform.OS === "ios" ? ("interactive" as const) : ("on-drag" as const),
  keyboardShouldPersistTaps: "handled" as const,
};

/** Whether the keyboard is up (false on the web, which has no such API) */
export function keyboardShown(): boolean {
  if (Platform.OS === "web") return false;
  return typeof Keyboard.isVisible === "function" ? Keyboard.isVisible() : false;
}

/**
 * Responder props that close the keyboard on a tap nothing else handled.
 * Claims the touch only while the keyboard is up, so nothing changes otherwise.
 */
export const dismissKeyboardResponder = {
  onStartShouldSetResponder: () => keyboardShown(),
  onResponderRelease: () => Keyboard.dismiss(),
} as const;

/** A view whose empty space closes the keyboard when tapped */
export function DismissKeyboard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1 }, style]} {...dismissKeyboardResponder}>
      {children}
    </View>
  );
}

/**
 * A bottom action bar that stays visible above the keyboard. Put it last in a
 * column that reaches the screen bottom; the content above (flex: 1) gets
 * shorter. It pads itself for the home indicator when the keyboard is down.
 */
export function KeyboardFooter({
  children,
  style,
  gap = 12,
  inset = 0,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** bottom padding under the bar's content */
  gap?: number;
  /** the container already ends this far above the screen bottom (SafeAreaView with the bottom edge: insets.bottom) */
  inset?: number;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard(KEYBOARD_OPTIONS);
  const safe = insets.bottom;
  const pad = useAnimatedStyle(() => ({ paddingBottom: footerPadding(keyboard.height.get(), safe, inset, gap) }));
  return (
    <Animated.View testID={testID} style={[style, pad]}>
      {children}
    </Animated.View>
  );
}

/**
 * A screen whose content ends above the keyboard. Absolutely placed bars
 * inside (the settings save bar) ride up with it. A tap on empty space closes
 * the keyboard.
 */
export function KeyboardSafeScreen({ children, inset = 0, style }: { children: ReactNode; inset?: number; style?: StyleProp<ViewStyle> }) {
  const keyboard = useAnimatedKeyboard(KEYBOARD_OPTIONS);
  const lift = useAnimatedStyle(() => ({ paddingBottom: keyboardLift(keyboard.height.get(), inset) }));
  return (
    <Animated.View style={[{ flex: 1 }, lift]}>
      {/* the inner view shrinks, so absolute children (bottom: 16) move up with it */}
      <View style={[{ flex: 1 }, style]} {...dismissKeyboardResponder}>
        {children}
      </View>
    </Animated.View>
  );
}
