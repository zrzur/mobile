/**
 * Skeleton: placeholder blocks while a list's first page loads, instead of
 * a bare spinner (spinners stay for button busy states and pull-to-refresh).
 *
 *   <Skeleton width={120} height={14} />      one block (field colour, radius 6)
 *   <SkeletonRows count={8} avatar={44} />    rows shaped like the real ones
 *                                             (avatar, two lines); `square`
 *                                             for server icons, `avatar={0}`
 *                                             for text-only rows
 *
 * Every block on screen pulses with one shared value (no animation per
 * block). Reduce motion: the blocks stay still. Hidden from screen readers;
 * pass `label` to SkeletonRows to announce "Loading…".
 */
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { type DimensionValue, View } from "react-native";
import Animated, { cancelAnimation, Easing, makeMutable, useAnimatedStyle, withRepeat, withTiming } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

import { useReduceMotion } from "./motion";

const pulse = makeMutable(0);
let users = 0;

function useSharedPulse(still: boolean) {
  useEffect(() => {
    if (still) return;
    users++;
    if (users === 1) pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => {
      users--;
      if (users === 0) {
        cancelAnimation(pulse);
        pulse.set(0);
      }
    };
  }, [still]);
}

export function Skeleton({ width, height, radius = 6, round }: { width: DimensionValue; height: number; radius?: number; round?: boolean }) {
  const { palette } = useTheme();
  const still = useReduceMotion();
  useSharedPulse(still);
  const style = useAnimatedStyle(() => ({ opacity: still ? 0.8 : 0.5 + pulse.get() * 0.5 }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: round ? height / 2 : radius, backgroundColor: palette.field }, style]}
    />
  );
}

/** Rows shaped like the list's real rows */
export function SkeletonRows({
  count = 6,
  avatar = 44,
  square,
  lines = 2,
  gap = 12,
  padding = 16,
  label = true,
  testID,
}: {
  count?: number;
  /** avatar size; 0 = no avatar */
  avatar?: number;
  square?: boolean;
  lines?: 1 | 2;
  gap?: number;
  padding?: number;
  label?: boolean;
  testID?: string;
}) {
  const { t } = useLingui();
  // varied line lengths read as text, not as bars
  const widths: DimensionValue[] = ["62%", "48%", "71%", "55%", "66%", "44%"];
  return (
    <View testID={testID} accessible={label} accessibilityLabel={label ? t`Loading…` : undefined} accessibilityRole={label ? "progressbar" : undefined} style={{ paddingHorizontal: padding, paddingVertical: 8, gap }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: Math.max(avatar, 20) + 16 }}>
          {avatar ? <Skeleton width={avatar} height={avatar} radius={square ? 14 : avatar / 2} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={widths[i % widths.length]} height={14} />
            {lines === 2 ? <Skeleton width={widths[(i + 3) % widths.length]} height={12} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
