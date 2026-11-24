/**
 * SwipeRow: swipe a list row sideways to reveal actions (iOS Mail style).
 *
 *   <SwipeRow start={[markRead]} end={[close, mute]}>{row}</SwipeRow>
 *
 * - `start` actions sit at the start edge (left in English, right in
 *   Arabic) and show when the row is pulled toward the end; `end` actions
 *   the other way. Each list goes from the edge inward; the first is the
 *   edge action.
 * - A full swipe (past 55 % of the row) runs the edge action of that side
 *   when `full` is set for it; a tick when it arms, a success tap when it
 *   runs. A partial swipe opens the buttons; tapping one runs it and closes.
 * - Up-and-down movement stays a scroll; the first 24 px from the screen's
 *   back edge belong to the system back-swipe.
 * - One row open at a time; `closeSwipeRows()` closes it (call it when the
 *   list starts scrolling). A tap on an open row closes it.
 * - Colours come from palette tokens (`color` the fill, `ink` the icon and
 *   label). Reduce motion: settles with short timings instead of springs.
 * - VoiceOver cannot swipe: spread `swipeA11y(actions)` on the row's own
 *   pressable so the same actions are in its actions rotor.
 */
import { type ReactNode, useState } from "react";
import { type AccessibilityActionEvent, I18nManager, Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useTheme } from "@/theme/ThemeProvider";

import { Icon, type IconName } from "../Icon";
import { haptics } from "./haptics";
import { PRESS_SPRING, useReduceMotion } from "./motion";
import { AText } from "./Text";
import { ACTION_WIDTH, BACK_EDGE, fullSwipeArmed, logicalOffset, settleSwipe, swipeOffset } from "./swipeMath";

export type SwipeAction = {
  key: string;
  label: string;
  icon: IconName;
  /** fill colour (a palette token) */
  color: string;
  /** icon and label colour on the fill */
  ink: string;
  onPress: () => void;
  testID?: string;
};

/** the open row's close function (one open row at a time) */
const openRow: { close: (() => void) | null } = { close: null };

function claimOpen(close: () => void) {
  if (openRow.close && openRow.close !== close) openRow.close();
  openRow.close = close;
}

function releaseOpen(close: () => void) {
  if (openRow.close === close) openRow.close = null;
}

/** Close the open swipe row, if any */
export function closeSwipeRows() {
  openRow.close?.();
  openRow.close = null;
}

/** Accessibility actions for the same buttons (spread on the row's pressable) */
export function swipeA11y(actions: SwipeAction[], extra: { name: string; label?: string }[] = [], onExtra?: (name: string) => void) {
  return {
    accessibilityActions: [...extra, ...actions.map((a) => ({ name: a.key, label: a.label }))],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      const name = e.nativeEvent.actionName;
      const action = actions.find((a) => a.key === name);
      if (action) action.onPress();
      else onExtra?.(name);
    },
  };
}

export function SwipeRow({
  start = [],
  end = [],
  fullStart = false,
  fullEnd = false,
  enabled = true,
  background,
  children,
}: {
  /** the row's own fill, so the buttons only show beside it (default: frame) */
  background?: string;
  start?: SwipeAction[];
  end?: SwipeAction[];
  /** a full swipe toward the end runs start[0] */
  fullStart?: boolean;
  /** a full swipe toward the start runs end[0] */
  fullEnd?: boolean;
  enabled?: boolean;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const rtl = I18nManager.isRTL;
  const reduce = useReduceMotion();
  const startWidth = start.length * ACTION_WIDTH;
  const endWidth = end.length * ACTION_WIDTH;
  const offset = useSharedValue(0);
  const base = useSharedValue(0);
  const width = useSharedValue(0);
  const armed = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const settleTo = (to: number) => {
    "worklet";
    offset.set(reduce ? withTiming(to, { duration: 160 }) : withSpring(to, PRESS_SPRING));
  };
  const close = () => {
    settleTo(0);
    setOpen(false);
  };
  const opened = () => {
    claimOpen(close);
    setOpen(true);
  };
  const closed = () => {
    releaseOpen(close);
    setOpen(false);
  };
  const commit = (side: number) => {
    const action = side > 0 ? start[0] : end[0];
    haptics.success();
    action?.onPress();
  };
  const tick = () => haptics.selection();

  const pan = usePanGesture({
    enabled: enabled && (startWidth > 0 || endWidth > 0),
    activeOffsetX: [-10, 10],
    failOffsetY: [-10, 10],
    // the back-swipe edge stays the system's (left in LTR, right in RTL)
    hitSlop: rtl ? { right: -BACK_EDGE } : { left: -BACK_EDGE },
    onActivate: () => {
      "worklet";
      base.set(offset.get());
    },
    onUpdate: (e) => {
      "worklet";
      const raw = base.get() + logicalOffset(e.translationX, rtl);
      const next = swipeOffset(raw, startWidth, endWidth, width.get(), fullStart, fullEnd);
      offset.set(next);
      const full = (next > 0 && fullStart) || (next < 0 && fullEnd) ? fullSwipeArmed(next, width.get()) : false;
      if (full !== !!armed.get()) scheduleOnRN(tick);
      armed.set(full ? 1 : 0);
    },
    onDeactivate: (e) => {
      "worklet";
      const now = offset.get();
      if (armed.get()) {
        armed.set(0);
        settleTo(0);
        scheduleOnRN(commit, now > 0 ? 1 : -1);
        scheduleOnRN(closed);
        return;
      }
      const to = settleSwipe(now, logicalOffset(e.velocityX, rtl), startWidth, endWidth);
      settleTo(to);
      scheduleOnRN(to === 0 ? closed : opened);
    },
  });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? -offset.get() : offset.get() }] }));
  const startTray = useAnimatedStyle(() => ({ width: Math.max(0, offset.get()) }));
  const endTray = useAnimatedStyle(() => ({ width: Math.max(0, -offset.get()) }));

  const button = (a: SwipeAction, i: number, side: SwipeAction[]) => (
    <Pressable
      key={a.key}
      testID={a.testID}
      accessibilityRole="button"
      accessibilityLabel={a.label}
      onPress={() => {
        close();
        a.onPress();
      }}
      // the edge action grows to fill a long pull
      style={{ flexGrow: i === 0 ? 1 : 0, flexShrink: 0, width: side.length > 1 && i > 0 ? ACTION_WIDTH : undefined, minWidth: ACTION_WIDTH, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: a.color, overflow: "hidden" }}
    >
      <Icon name={a.icon} size={22} color={a.ink} />
      <AText size={12} line={16} weight="semibold" color={a.ink} numberOfLines={1}>
        {a.label}
      </AText>
    </Pressable>
  );

  if (!startWidth && !endWidth) return <>{children}</>;
  return (
    <View
      onLayout={(e) => {
        width.set(e.nativeEvent.layout.width);
      }}
      style={{ overflow: "hidden" }}
    >
      {startWidth ? (
        // drawn from the start edge inward: the edge action is first
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, start: 0, flexDirection: "row", overflow: "hidden" }, startTray]}>{start.map((a, i) => button(a, i, start))}</Animated.View>
      ) : null}
      {endWidth ? (
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, end: 0, flexDirection: "row-reverse", overflow: "hidden" }, endTray]}>{end.map((a, i) => button(a, i, end))}</Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: background ?? palette.frame }, row]}>
          {children}
          {open ? <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} /> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
