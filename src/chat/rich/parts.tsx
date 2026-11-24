import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import {
  Pressable,
  type StyleProp,
  Text,
  type TextProps,
  type TextStyle,
  useWindowDimensions,
} from "react-native";

import { type Weight, fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";

/** `#RRGGBB` with an alpha, for the web's color-mix() tints */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The phone's box (web `--z-box-*` at ≤600 px): sheet-group fill, no frame, radius 14 */
export const BOX_RADIUS = 14;
/** `--z-radius-sm` */
export const RADIUS_SM = 8;

/**
 * The width a message's media and cards may take: the screen less the 12 px
 * gutters, the 48 px avatar column and the 8 px end padding (as MessageRow)
 */
export function useRoom(max = 420) {
  const { width } = useWindowDimensions();
  return Math.max(120, Math.min(max, width - 12 * 2 - 48 - 8));
}

/**
 * Text in the web's sizes with the app font. `dir` sets the writing
 * direction of a card's own words; without it the app language decides.
 */
export function RText({
  size,
  line,
  weight = "regular",
  color,
  dir,
  style,
  children,
  ...rest
}: {
  size: number;
  line: number;
  weight?: Weight;
  color: string;
  dir?: "rtl" | "ltr";
  style?: StyleProp<TextStyle>;
  children: ReactNode;
} & Omit<TextProps, "style">) {
  const { i18n } = useLingui();
  const rtl = dir ? dir === "rtl" : i18n.locale === "ar";
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: fontFamily(i18n.locale, weight),
          fontSize: size,
          lineHeight: line + (i18n.locale === "ar" ? 2 : 0),
          color,
          writingDirection: rtl ? "rtl" : "ltr",
          textAlign: dir ? (rtl ? "right" : "left") : "auto",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * The app's bottom sheet (scrim, 20 px top corners, frame fill, grabber),
 * with a fixed height when the content scrolls itself (GIF grid) and the
 * keyboard pushing it up (poll fields)
 */
export function RichSheet({
  visible,
  onClose,
  children,
  testID,
  height,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
  /** share of the screen, e.g. 0.72; omitted: as tall as the content (≤ 90 %) */
  height?: number;
  /** false while a draft would be lost: the scrim no longer closes it */
  dismissable?: boolean;
}) {
  // Sheet v2's frame: drag to dismiss, keyboard curve, spring in and out
  return (
    <SheetModal visible={visible} onClose={onClose} testID={testID} grabber handleOnly detents={height ? [height] : undefined} maxShare={0.9} dismissible={dismissable}>
      {children}
    </SheetModal>
  );
}

/** A full-width 44 px button for sheet actions (primary = accent fill, tonal otherwise) */
export function SheetButton({
  label,
  onPress,
  primary,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: primary ? (pressed ? palette.accentPressed : palette.accent) : pressed ? palette.tonalHover : palette.tonal,
      })}
    >
      <RText size={15} line={20} weight="semibold" color={primary ? palette.onAccent : palette.fg}>
        {label}
      </RText>
    </Pressable>
  );
}
