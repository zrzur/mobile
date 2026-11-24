import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { haptics } from "@/ui/kit/haptics";
import { useReduceMotion } from "@/ui/kit/motion";
import { AText } from "@/ui/kit/Text";

import { closeSnack, pressSnack, useSnack } from "./snack";

/** Room for the floating tab bar under the message (56 bar + 8 gap + 16) */
const ABOVE_TABS = 80;

/**
 * The short message with one button (web: snackbar, bottom placement):
 * words on two lines at most, the button in the action colour, and a close
 * X. It rises above the floating tab bar.
 */
export function NoticeSnack() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const snack = useSnack();

  useEffect(() => {
    if (snack?.action) haptics.light();
  }, [snack]);

  if (!snack) return null;
  return (
    <Animated.View
      key={snack.id}
      entering={reduce ? undefined : FadeInDown.duration(200)}
      exiting={reduce ? undefined : FadeOutDown.duration(160)}
      testID="notice-snack"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        start: 16,
        end: 16,
        bottom: insets.bottom + ABOVE_TABS,
        minHeight: 52,
        paddingStart: 16,
        paddingEnd: 4,
        paddingVertical: 4,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: palette.floating,
        borderWidth: 1,
        borderColor: palette.popoverBorder,
        shadowColor: palette.shadow,
        shadowOpacity: 0.45,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      }}
    >
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={2}>
          {snack.message}
        </AText>
      </View>
      {snack.action ? (
        <Pressable
          testID="notice-snack-action"
          accessibilityRole="button"
          onPress={pressSnack}
          style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 6, justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
        >
          <AText size={14} line={20} weight="semibold" color={palette.accentText}>
            {snack.action}
          </AText>
        </Pressable>
      ) : null}
      <Pressable
        testID="notice-snack-close"
        accessibilityRole="button"
        accessibilityLabel={t`Close`}
        onPress={() => closeSnack()}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
      >
        <Icon name="x" size={18} color={palette.iconMuted} />
      </Pressable>
    </Animated.View>
  );
}
