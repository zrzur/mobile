import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { PressScale } from "@/ui/kit/Press";

export type Tone = "neutral" | "off" | "on" | "danger";

/**
 * A call control (web: VoiceCallCardActions ControlButton). In the phone
 * bar a 52 px rounded square (radius 18) and a wider hang up; in the
 * floating card a round 44 px button. "off" is the danger colour on its
 * muted surface, "on" the accent, hang up filled red.
 */
export function ControlButton({
  icon,
  label,
  tone = "neutral",
  disabled,
  pressed: isPressed,
  onPress,
  testID,
  size = 52,
  width,
  radius,
}: {
  icon: IconName;
  label: string;
  tone?: Tone;
  disabled?: boolean;
  /** aria-pressed: the control is in its "on" state */
  pressed?: boolean;
  onPress: () => void;
  testID?: string;
  size?: number;
  /** wider than tall (the bar's hang up) */
  width?: number;
  /** corner radius; round when left out */
  radius?: number;
}) {
  const { palette } = useTheme();
  const fill = tone === "danger" ? palette.dangerFill : tone === "off" ? dangerMuted(palette.danger) : tone === "on" ? palette.accent : palette.tonal;
  const color = tone === "danger" || tone === "on" ? palette.onAccent : tone === "off" ? palette.danger : palette.fg;
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: isPressed }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      scale={disabled ? 1 : 0.94}
      style={{ flexShrink: 0 }}
    >
      <View
        style={{
          width: width ?? size,
          height: size,
          borderRadius: radius ?? size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: fill,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name={icon} size={size >= 48 ? 22 : 20} color={color} />
      </View>
    </PressScale>
  );
}

/** The danger colour on a quiet surface (web: --z-danger-muted) */
export function dangerMuted(danger: string): string {
  return /^#[0-9a-f]{6}$/i.test(danger) ? `${danger}29` : danger;
}

/**
 * A 44 px tile of the call's top row (web: CallTop TopButton): the raised
 * surface; "off" (you hear nothing) in the danger colour on its muted
 * surface.
 */
export function TopButton({
  icon,
  label,
  onPress,
  onLongPress,
  off,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  off?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!off }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      scale={disabled ? 1 : 0.94}
      style={{ flexShrink: 0 }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: off ? dangerMuted(palette.danger) : palette.field,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name={icon} size={22} color={off ? palette.danger : palette.fg} />
      </View>
    </PressScale>
  );
}

/** The Join call action (web: VoiceChannel Retry[data-join]): 52 px tall, up to 360 px wide */
export function BigButton({
  label,
  icon,
  onPress,
  disabled,
  busy,
  testID,
  tone = "primary",
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  tone?: "primary" | "tonal";
}) {
  const { palette } = useTheme();
  const primary = tone === "primary";
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      scale={disabled || busy ? 1 : 0.96}
      style={{ flex: 1, maxWidth: 360 }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 52,
            borderRadius: 16,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: disabled ? 0.5 : 1,
            backgroundColor: primary ? (pressed ? palette.accentPressed : palette.accent) : pressed ? palette.tonalHover : palette.tonal,
          }}
        >
          {busy ? <ActivityIndicator color={primary ? palette.onAccent : palette.fg} /> : icon ? <Icon name={icon} size={20} color={primary ? palette.onAccent : palette.fg} /> : null}
          <AText size={16} line={22} weight="semibold" color={primary ? palette.onAccent : palette.fg}>
            {label}
          </AText>
        </View>
      )}
    </PressScale>
  );
}

/**
 * A 44 px action in the stage and room sheets: the kit Button, so these
 * match every other button (danger = the destructive fill with white text,
 * text = the ghost button).
 */
export function PillButton({ label, icon, onPress, disabled, testID, tone = "tonal" }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; testID?: string; tone?: "tonal" | "primary" | "danger" | "text" }) {
  return <Button label={label} icon={icon} onPress={onPress} disabled={disabled} testID={testID} variant={tone === "text" ? "ghost" : tone} />;
}

/** A line of muted text, or an alert in the danger colour */
export function Note({ children, alert, center, size = 14 }: { children: ReactNode; alert?: boolean; center?: boolean; size?: 13 | 14 | 15 }) {
  const { palette } = useTheme();
  return (
    <AText
      size={size}
      line={size === 13 ? 18 : size === 15 ? 22 : 20}
      color={alert ? palette.danger : palette.muted}
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "assertive" : "polite"}
      style={center ? { textAlign: "center" } : undefined}
    >
      {children}
    </AText>
  );
}

/** Section title inside a sheet */
export function SheetTitle({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingBottom: 4 }}>
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {children}
      </AText>
    </View>
  );
}
