/**
 * ContextMenu: long press on something that is not a list row (server
 * icons in the rail, chips, cards). The element shrinks a little under the
 * finger, lifts (scale 1.04) when the press is long enough (300 ms), gives
 * a medium haptic and calls `onOpen`, which shows the menu (the app's
 * Sheet-based menus). Taps still reach the child's own onPress; once the
 * long press fires, the tap is cancelled. Reduce motion: no scaling, the
 * haptic stays.
 *
 * List rows get the same lift through PressableRow's onLongPress.
 *
 * The native SwiftUI menu from @expo/ui was looked at: it needs the trigger
 * to be a SwiftUI Host wrapping the React Native row, which inside
 * recycled FlashList cells sizes and recycles badly, and its system styling
 * cannot follow the web look; so the Reanimated version is used everywhere.
 */
import type { ReactNode } from "react";
import { GestureDetector, useLongPressGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { buzz } from "./haptics";
import { PRESS_SPRING, useReduceMotion } from "./motion";

/** How long a press must last before the menu opens (ms; matches the rows) */
export const MENU_DELAY = 300;

export function ContextMenu({ onOpen, children, enabled = true, lift = 1.04 }: { onOpen: () => void; children: ReactNode; enabled?: boolean; lift?: number }) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const open = () => {
    buzz("medium");
    onOpen();
  };
  const press = useLongPressGesture({
    enabled,
    minDuration: MENU_DELAY,
    maxDistance: 10,
    onBegin: () => {
      "worklet";
      if (!reduce) scale.set(withTiming(0.97, { duration: MENU_DELAY }));
    },
    onActivate: () => {
      "worklet";
      if (!reduce) scale.set(withSpring(lift, PRESS_SPRING));
      scheduleOnRN(open);
    },
    onFinalize: () => {
      "worklet";
      scale.set(withSpring(1, PRESS_SPRING));
    },
  });
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <GestureDetector gesture={press}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
