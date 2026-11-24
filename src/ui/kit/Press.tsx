/**
 * Press feedback for every tappable thing.
 *
 * PressScale: buttons, chips, tabs and cards outside lists. The press is
 * instant; the element springs down to `scale` (0.96 default) and back.
 * With reduce motion it dims to 0.7 instead of scaling.
 *
 * PressableRow: rows inside scrolling lists. The highlight waits 80 ms, so
 * starting a scroll never flashes it (iOS table behaviour), then fades in
 * (90 ms) and out (200 ms) as a colour layer behind the content. A pointer
 * (iPad trackpad or mouse) hovering shows the same layer at half strength.
 * `onLongPress` lifts the row (scale 1.02, reduce motion: none) and gives a
 * medium haptic before calling it, which is what ContextMenu builds on.
 *
 * Both take the usual Pressable props. `style` may be a function of
 * `{ pressed }` like RN Pressable; `haptic` fires on press.
 */
import { type ReactNode, useState } from "react";
import { type GestureResponderEvent, Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { buzz, type HapticKind } from "./haptics";
import { PRESS_SPRING, useReduceMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type State = { pressed: boolean; hovered: boolean };
type StyleProp2 = StyleProp<ViewStyle> | ((state: State) => StyleProp<ViewStyle>);
type ChildrenProp = ReactNode | ((state: State) => ReactNode);

export type PressProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp2;
  children?: ChildrenProp;
  /** haptic on press (none by default) */
  haptic?: HapticKind;
};

function usePressState() {
  const [state, setState] = useState<State>({ pressed: false, hovered: false });
  return [state, setState] as const;
}

const resolve = <T,>(value: T | ((s: State) => T), state: State): T => (typeof value === "function" ? (value as (s: State) => T)(state) : value);

/** Spring-scale press feedback for buttons, chips, tabs and cards */
export function PressScale({
  scale = 0.96,
  haptic,
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressProps & {
  /** pressed size; 0.96 for buttons, 0.97 for cards, 0.94 for small round tabs */
  scale?: number;
}) {
  const reduce = useReduceMotion();
  const [state, setState] = usePressState();
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }], opacity: o.get() }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        setState((x) => ({ ...x, pressed: true }));
        if (reduce) o.set(withTiming(0.7, { duration: 90 }));
        else s.set(withSpring(scale, PRESS_SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setState((x) => ({ ...x, pressed: false }));
        o.set(withTiming(1, { duration: 200 }));
        s.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(e);
      }}
      onPress={
        onPress
          ? (e: GestureResponderEvent) => {
              if (haptic) buzz(haptic);
              onPress(e);
            }
          : undefined
      }
      style={[resolve(style, state), anim]}
    >
      {resolve(children, state)}
    </AnimatedPressable>
  );
}

/** A list row: delayed highlight that fades, hover layer, long-press lift */
export function PressableRow({
  highlight,
  delay = 80,
  haptic,
  lift = true,
  style,
  children,
  onPressIn,
  onPressOut,
  onPress,
  onLongPress,
  onHoverIn,
  onHoverOut,
  ...rest
}: PressProps & {
  /** the pressed colour (a palette token: navHover, navSelected, field) */
  highlight: string;
  /** ms before the highlight shows; 0 for rows outside a scroll view */
  delay?: number;
  /** scale up a little while a long press opens its menu */
  lift?: boolean;
}) {
  const reduce = useReduceMotion();
  const [state, setState] = usePressState();
  const layer = useSharedValue(0);
  const s = useSharedValue(1);
  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.get() }));
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const resolved = StyleSheet.flatten(resolve(style, state)) ?? {};
  const radius = {
    borderRadius: resolved.borderRadius,
    borderTopStartRadius: resolved.borderTopStartRadius,
    borderTopEndRadius: resolved.borderTopEndRadius,
    borderBottomStartRadius: resolved.borderBottomStartRadius,
    borderBottomEndRadius: resolved.borderBottomEndRadius,
  };
  return (
    <AnimatedPressable
      {...rest}
      unstable_pressDelay={delay}
      onPressIn={(e: GestureResponderEvent) => {
        setState((x) => ({ ...x, pressed: true }));
        layer.set(withTiming(1, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setState((x) => ({ ...x, pressed: false }));
        layer.set(withTiming(state.hovered ? 0.5 : 0, { duration: 200 }));
        s.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        setState((x) => ({ ...x, hovered: true }));
        if (!state.pressed) layer.set(withTiming(0.5, { duration: 90 }));
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setState((x) => ({ ...x, hovered: false }));
        if (!state.pressed) layer.set(withTiming(0, { duration: 200 }));
        onHoverOut?.(e);
      }}
      onPress={
        onPress
          ? (e: GestureResponderEvent) => {
              if (haptic) buzz(haptic);
              onPress(e);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (e: GestureResponderEvent) => {
              buzz("medium");
              if (lift && !reduce) s.set(withSpring(1.02, PRESS_SPRING));
              onLongPress(e);
            }
          : undefined
      }
      style={[resolved, rowStyle]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, radius, { backgroundColor: highlight }, layerStyle]} />
      {resolve(children, state)}
    </AnimatedPressable>
  );
}
