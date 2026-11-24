/**
 * GestureRoot: the gesture-handler root view. One sits at the app root
 * (src/app/_layout.tsx); every RN `Modal` is its own native root on iOS, so
 * each Modal-based surface (Sheet, ConfirmDialog, viewers, pickers) puts one
 * directly inside the Modal too. Without it, pans and swipes inside silently
 * never fire.
 *
 * It is also where a tap on empty space closes the keyboard, app-wide (see
 * kit/keyboard): it claims a touch only while the keyboard is up and only
 * when nothing deeper (a button, a row, a field, a scroll view) handled it.
 */
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { dismissKeyboardResponder } from "./keyboard";

export function GestureRoot({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <GestureHandlerRootView style={[{ flex: 1 }, style]} {...dismissKeyboardResponder}>
      {children}
    </GestureHandlerRootView>
  );
}
