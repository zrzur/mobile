import { useLingui } from "@lingui/react/macro";
import { ActivityIndicator, View } from "react-native";

import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";

import { Icon, type IconName } from "../Icon";
import { ChromeScale } from "./fontScale";
import { AText } from "./Text";
import { PressScale } from "./Press";

export type ButtonVariant = "primary" | "tonal" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

/**
 * The one button (web: Button). Every size keeps a 44 × 44 tap box:
 * - md: 44 px tall, radius 10, 15/600, 16 px side padding (web phone "xl")
 * - sm: a 36 px pill drawn inside the 44 px box, 14/600, 12 px padding (row
 *   controls such as "Change" or "Edit")
 * Variants: primary = accent fill, tonal = raised slate with a hairline,
 * danger = destructive fill, ghost = no fill (pressed tint only).
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  status = "ready",
  disabled,
  fill,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** submitting shows a spinner and ignores taps; success shows a check */
  status?: "ready" | "submitting" | "success";
  disabled?: boolean;
  /** stretch to the width of the parent */
  fill?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const busy = status !== "ready";
  const sm = size === "sm";
  const ink =
    variant === "primary" ? palette.onAccent : variant === "danger" ? palette.onAccent : variant === "ghost" ? palette.fg2 : palette.fg;
  const background = (pressed: boolean) => {
    const down = pressed && !busy && !disabled;
    switch (variant) {
      case "primary":
        return down ? palette.accentPressed : palette.accent;
      case "danger":
        return down ? palette.dangerFillPressed : palette.dangerFill;
      case "tonal":
        return down ? palette.tonalHover : palette.tonal;
      case "ghost":
        return down ? palette.navHover : "transparent";
    }
  };
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      scale={busy || disabled ? 1 : 0.96}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: status === "submitting" }}
      accessibilityHint={status === "submitting" ? t`Please wait…` : undefined}
      disabled={disabled}
      onPress={busy ? undefined : onPress}
      style={{
        minHeight: 44,
        minWidth: 44,
        justifyContent: "center",
        alignSelf: fill ? "stretch" : "auto",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {({ pressed }) => (
        <ChromeScale>
          <View
            style={{
              minHeight: sm ? 36 : 44,
              paddingHorizontal: sm ? 12 : 16,
              borderRadius: RADIUS,
              borderWidth: 1,
              borderColor: variant === "tonal" ? palette.tonalBorder : "transparent",
              backgroundColor: background(pressed),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {status === "submitting" ? (
              <ActivityIndicator size={16} color={ink} accessibilityElementsHidden />
            ) : status === "success" ? (
              <Icon name="check-circle" size={18} color={ink} />
            ) : icon ? (
              <Icon name={icon} size={sm ? 16 : 18} color={ink} />
            ) : null}
            <AText size={sm ? 14 : 15} line={20} weight="semibold" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </AText>
          </View>
        </ChromeScale>
      )}
    </PressScale>
  );
}
