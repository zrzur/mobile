/**
 * Sheet v2 and SheetModal: the bottom sheets and bottom dialogs.
 *
 * Sheet (same props as the old one in ui/app/parts.tsx, plus optional
 * detents): web look (scrim, 20 px top corners, frame background, grabber,
 * 16 px padded scroll body with 12 px gaps) with iPhone behaviour:
 * - springs in, eases out; the backdrop fades with the sheet's position;
 * - drag down anywhere on it (or on the content once it is scrolled to the
 *   top) follows the finger; above the top it rubber-bands; letting go
 *   flings or snaps to the nearest detent (a tick on each snap) or
 *   dismisses (a soft tap);
 * - `detents` (fractions of the height, e.g. [0.5, 1]) give a resizable
 *   sheet; without them it is as tall as its content, at most 78 %;
 * - rides up with the keyboard on its curve; never under the home indicator;
 * - closes on a scrim tap, Android Back and the VoiceOver escape gesture;
 * - hides while its screen is not in front (`visible && focused`): a page
 *   that lost focus cannot re-render its own state, so a sheet left open
 *   there would stay over the next page;
 * - reduce motion: fades instead of sliding.
 *
 * SheetModal is the frame without the scroll body, used by ConfirmDialog
 * and other bottom dialogs so they move and dismiss the same way.
 * Both put a GestureRoot inside the Modal (its own native root on iOS).
 */
import { useLingui } from "@lingui/react/macro";
import { useIsFocused } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { type PanGesture, ScrollView as GHScrollView, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useTheme } from "@/theme/ThemeProvider";

import { GestureRoot } from "./GestureRoot";
import { haptics } from "./haptics";
import { KEYBOARD_OPTIONS, keyboardScrollProps } from "./keyboard";
import { FADE_MS, SHEET_SPRING, useReduceMotion } from "./motion";
import { detentOffsets, dragPosition, pickSnap } from "./sheetMath";

const ORIENTATIONS = ["portrait", "portrait-upside-down", "landscape", "landscape-left", "landscape-right"] as const;
/** Without detents a sheet is as tall as its content, at most this share of the screen */
const MAX_SHARE = 0.78;

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
  /** resizable sheet: heights as fractions of the screen (e.g. [0.5, 1]) */
  detents?: number[];
  /** index into the sorted detents (tallest first) to open at; default the smallest */
  initialDetent?: number;
  onDetentChange?: (index: number) => void;
  /** false: neither a drag nor a scrim tap dismisses it (a draft would be lost) */
  dismissible?: boolean;
  /** content-sized sheets stop at this share of the screen (default 0.78) */
  maxShare?: number;
};

/** Keeps the Modal mounted through the exit animation */
function usePresence(visible: boolean) {
  const focused = useIsFocused();
  const open = visible && focused;
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return { open, mounted, gone: () => setMounted(false) };
}

export function SheetModal({
  visible,
  onClose,
  children,
  testID,
  detents,
  initialDetent,
  onDetentChange,
  dismissible = true,
  scroll,
  grabber,
  handleOnly,
  maxShare,
  panelStyle,
  role,
}: SheetProps & {
  /** draw the grabber and the padded scroll body (Sheet) */
  scroll?: boolean;
  /** draw the grabber over custom content */
  grabber?: boolean;
  /**
   * only the top 28 px (the grabber area) drags the sheet: for custom content
   * that scrolls itself (an emoji grid, a form in its own ScrollView), whose
   * scrolling a whole-sheet drag would steal
   */
  handleOnly?: boolean;
  panelStyle?: StyleProp<ViewStyle>;
  role?: "alert";
}) {
  const { open, mounted, gone } = usePresence(visible);
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent supportedOrientations={[...ORIENTATIONS]}>
      <GestureRoot>
        <SheetBody
          open={open}
          onGone={gone}
          onClose={onClose}
          testID={testID}
          detents={detents}
          initialDetent={initialDetent}
          onDetentChange={onDetentChange}
          dismissible={dismissible}
          scroll={scroll}
          grabber={grabber}
          handleOnly={handleOnly}
          maxShare={maxShare}
          panelStyle={panelStyle}
          role={role}
        >
          {children}
        </SheetBody>
      </GestureRoot>
    </Modal>
  );
}

function SheetBody({
  open,
  onGone,
  onClose,
  children,
  testID,
  detents,
  initialDetent,
  onDetentChange,
  dismissible,
  scroll,
  grabber,
  handleOnly,
  maxShare = MAX_SHARE,
  panelStyle,
  role,
}: Omit<SheetProps, "visible"> & { open: boolean; onGone: () => void; scroll?: boolean; grabber?: boolean; handleOnly?: boolean; panelStyle?: StyleProp<ViewStyle>; role?: "alert" }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // tablet: a centred card, not a sheet across a 1024 px screen
  const tablet = windowWidth >= 768;
  const reduce = useReduceMotion();
  const available = Math.max(200, windowHeight - insets.top - 8);
  const points = detents?.length ? detentOffsets(detents, available) : [0];
  const panelHeight = detents?.length ? Math.round(Math.max(...detents.map((d) => Math.min(1, d))) * available) : undefined;
  const [measured, setMeasured] = useState(0);
  const closed = (measured || windowHeight) + 24;
  const startIndex = Math.min(points.length - 1, Math.max(0, initialDetent ?? points.length - 1));

  const y = useSharedValue(windowHeight);
  const fade = useSharedValue(reduce ? 0 : 1);
  const index = useSharedValue(startIndex);
  const start = useSharedValue(0);
  const base = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const keyboard = useAnimatedKeyboard(KEYBOARD_OPTIONS);

  // in and out
  useEffect(() => {
    if (!measured) return;
    if (open) {
      const target = points[index.get()] ?? 0;
      if (reduce) {
        y.set(target);
        fade.set(withTiming(1, { duration: FADE_MS }));
      } else {
        y.set(withSpring(target, SHEET_SPRING));
      }
      return;
    }
    const done = () => onGone();
    if (reduce) fade.set(withTiming(0, { duration: FADE_MS }));
    else y.set(withTiming(closed, { duration: 250, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(done, (reduce ? FADE_MS : 250) + 40);
    return () => clearTimeout(timer);
    // points are derived from the detents and the window; re-run only on these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, measured]);

  const snapped = (i: number) => {
    haptics.selection();
    onDetentChange?.(i);
  };
  const dismiss = () => {
    haptics.soft();
    onClose();
  };
  const settle = (i: number) => {
    const target = points[i] ?? 0;
    if (reduce) y.set(target);
    else y.set(withSpring(target, SHEET_SPRING));
    if (i !== index.get()) {
      index.set(i);
      snapped(i);
    }
  };

  const top = points[0] ?? 0;
  const pan: PanGesture = usePanGesture({
    enabled: dismissible !== false || points.length > 1,
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onActivate: (e) => {
      "worklet";
      start.set(y.get());
      base.set(e.translationY);
    },
    onUpdate: (e) => {
      "worklet";
      // the content is scrolled: it scrolls back first, the sheet waits
      if (scrollY.get() > 1) {
        start.set(y.get());
        base.set(e.translationY);
        return;
      }
      let next = dragPosition(start.get(), e.translationY - base.get(), top, closed);
      if (dismissible === false) next = Math.min(next, points[points.length - 1] + 24);
      y.set(next);
    },
    onDeactivate: (e) => {
      "worklet";
      let i = pickSnap(y.get(), e.velocityY, points, closed);
      if (i < 0 && dismissible === false) i = points.length - 1;
      if (i < 0) {
        y.set(withTiming(closed, { duration: 220, easing: Easing.out(Easing.cubic) }));
        scheduleOnRN(dismiss);
        return;
      }
      y.set(withSpring(points[i], { ...SHEET_SPRING, velocity: e.velocityY }));
      if (i !== index.get()) {
        index.set(i);
        scheduleOnRN(snapped, i);
      }
    },
  });

  const backdrop = useAnimatedStyle(() => ({
    opacity: fade.get() * interpolate(y.get(), [top, closed], [1, 0], Extrapolation.CLAMP),
  }));
  const frame = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.get() }));
  const panel = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateY: y.get() }],
    paddingBottom: keyboard.height.get() > 0 ? 12 : 16 + insets.bottom,
  }));

  const canStep = points.length > 1;
  const handle = !!handleOnly && !scroll;
  const sheet = (
    <Animated.View
      testID={testID}
      accessibilityViewIsModal
      accessibilityRole={role}
      onAccessibilityEscape={onClose}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h && Math.abs(h - measured) > 1) setMeasured(h);
      }}
      style={[
        {
          maxHeight: panelHeight ?? Math.round(windowHeight * maxShare),
          height: panelHeight,
          backgroundColor: palette.frame,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: scroll || grabber ? 12 : 0,
        },
        tablet ? { width: 560, alignSelf: "center" } : null,
        panelStyle,
        panel,
      ]}
    >
      {grabber && !scroll ? <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginBottom: 12 }} /> : null}
      {scroll ? (
        <>
          <View
            accessible={canStep}
            accessibilityRole={canStep ? "adjustable" : undefined}
            accessibilityLabel={canStep ? t`Resize` : undefined}
            accessibilityActions={canStep ? [{ name: "increment" }, { name: "decrement" }] : undefined}
            onAccessibilityAction={(e) => {
              const i = index.get() + (e.nativeEvent.actionName === "increment" ? -1 : 1);
              if (i >= 0 && i < points.length) settle(i);
            }}
            style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, marginBottom: 12 }}
          />
          <GHScrollView
            simultaneousWith={pan}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            bounces={false}
            {...keyboardScrollProps}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.set(e.nativeEvent.contentOffset.y);
            }}
          >
            {children}
          </GHScrollView>
        </>
      ) : (
        children
      )}
      {handle ? (
        <GestureDetector gesture={pan}>
          <View style={{ position: "absolute", top: 0, start: 0, end: 0, height: 28 }} />
        </GestureDetector>
      ) : null}
    </Animated.View>
  );
  return (
    <Animated.View style={[{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + 8 }, frame]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.sheetScrim }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={dismissible === false ? undefined : onClose} disabled={dismissible === false} accessibilityRole="button" accessibilityLabel={t`Close`} />
      </Animated.View>
      {handle ? sheet : <GestureDetector gesture={pan}>{sheet}</GestureDetector>}
    </Animated.View>
  );
}

/** The bottom sheet (see the file header) */
export function Sheet(props: SheetProps) {
  return <SheetModal {...props} scroll />;
}
