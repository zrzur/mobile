/**
 * Pull-to-refresh with the native control (iOS spinner and rubber band,
 * Android's material circle) in theme colours.
 *
 *   const pull = usePullRefresh(async () => { await reload(); return changed; });
 *   <FlashList refreshControl={pull.control} onScroll={pull.onScroll} … />
 *
 * A soft tap when the pull passes the point where letting go refreshes
 * (iOS gives none by default; Android taps when the refresh starts), and a
 * success tap at the end when `onRefresh` resolves to true (something
 * changed). Not for the chat itself.
 */
import { useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, RefreshControl } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { haptics } from "./haptics";

/** How far (px) past the top the pull goes before letting go refreshes (iOS) */
export const PULL_ARM = 70;

let armed = false;

export function usePullRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const { palette } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const run = async () => {
    if (Platform.OS !== "ios") haptics.soft();
    setRefreshing(true);
    try {
      const changed = await onRefresh();
      if (changed === true) haptics.success();
    } catch {
      haptics.error();
    } finally {
      setRefreshing(false);
    }
  };
  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void run()}
      tintColor={palette.muted}
      colors={[palette.accent]}
      progressBackgroundColor={palette.floating}
    />
  );
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y <= -PULL_ARM && !armed && !refreshing) {
      armed = true;
      haptics.soft();
    } else if (y >= 0) armed = false;
  };
  return { control, onScroll, refreshing };
}
