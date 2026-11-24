import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { fontFamily } from "@/theme/fonts";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";

import { inputDirStyle } from "../kit/bidi";
import { AText } from "../kit/Text";
import { CHROME_MAX_FONT_SCALE, ChromeScale } from "../kit/fontScale";
import { Icon, type IconName } from "../Icon";
import { PressableRow, PressScale } from "../kit/Press";

/** Mention / unread count bubble (mention badge, white 11/700, "99+") */
export function CountBadge({ count, ring }: { count: number; ring?: boolean }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  if (count <= 0) return null;
  return (
    <View
      accessibilityLabel={t`${count} unread`}
      style={{
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        borderRadius: 999,
        backgroundColor: palette.mentionBadge,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 2 : 0,
        borderColor: palette.frame,
      }}
    >
      {/* a fixed 18 px bubble: the number stops growing at the chrome cap */}
      <AText size={11} line={13} weight="bold" color={palette.onAccent} maxFontSizeMultiplier={1.2}>
        {count > 99 ? "99+" : String(count)}
      </AText>
    </View>
  );
}

/**
 * The one search field.
 * - default: 44 px box, radius 10, field border (web: search in pages, friends, settings)
 * - compact: a 36 px pill without border next to 36 px tools (web: Messages and
 *   channel list headers). The input still spans 44 px, so the tap box is 44.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  testID,
  compact,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID?: string;
  compact?: boolean;
  /** open with the keyboard up (a page whose whole job is this search) */
  autoFocus?: boolean;
}) {
  const { palette } = useTheme();
  const { i18n, t } = useLingui();
  const [focused, setFocused] = useState(false);
  const radius = compact ? 12 : RADIUS;
  return (
    <View style={{ flex: 1, minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
      {/* the visible box sits behind the input */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          start: 0,
          end: 0,
          top: compact ? 4 : 0,
          bottom: compact ? 4 : 0,
          borderRadius: radius,
          backgroundColor: palette.field,
          borderWidth: compact && !focused ? 0 : 1,
          borderColor: focused ? palette.focus : palette.fieldBorder,
        }}
      />
      <View style={{ flexShrink: 0 }}>
        <Icon name="magnifying-glass" size={compact ? 20 : 18} color={palette.muted} />
      </View>
      <TextInput
        testID={testID}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={palette.muted}
        selectionColor={palette.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        keyboardAppearance={palette.dark ? "dark" : "light"}
        maxFontSizeMultiplier={compact ? CHROME_MAX_FONT_SCALE : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          width: 0,
          minHeight: 44,
          // above the absolutely placed box (the web paints positioned boxes over static ones)
          position: "relative",
          zIndex: 1,
          fontSize: 16,
          paddingVertical: 0,
          paddingHorizontal: 0,
          color: palette.fg,
          fontFamily: fontFamily(i18n.locale),
          // the query takes its own direction, like dir="auto" on the web
          ...inputDirStyle(value),
        }}
      />
      {value ? (
        <Pressable
          testID={testID ? `${testID}-clear` : undefined}
          accessibilityRole="button"
          accessibilityLabel={t`Clear search`}
          onPress={() => onChange("")}
          style={{ flexShrink: 0, width: 44, height: 44, marginEnd: -12, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="x" size={16} color={palette.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A 36 px square tool next to a compact search field (primary = accent
 * fill), drawn inside a 44 × 44 tap box. The box overhangs 4 px on each
 * side, so a row gap of 8 still shows 8 px between the visible squares.
 */
export function ToolButton({
  icon,
  label,
  onPress,
  primary,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.92}
      style={{ width: 44, height: 44, marginHorizontal: -4, alignItems: "center", justifyContent: "center" }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: primary ? (pressed ? palette.accentPressed : palette.accent) : pressed ? palette.navSelected : palette.field,
          }}
        >
          <Icon name={icon} size={22} color={primary ? palette.onAccent : palette.fg2} />
        </View>
      )}
    </PressScale>
  );
}

/** 44 px icon button for headers (radius 6, pressed tint) */
export function HeaderButton({
  icon,
  label,
  onPress,
  size = 20,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.92}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      <Icon name={icon} size={size} color={palette.iconMuted} />
    </PressScale>
  );
}

/**
 * The 64 px screen header (56 + 8 px top gap), hairline at the bottom. It
 * grows with very large system text instead of clipping; text inside stops
 * at the chrome font cap.
 */
export function ScreenHeader({
  children,
  back,
  modal,
}: {
  children: ReactNode;
  back?: boolean | (() => void);
  /** the page is presented as a modal task: the back arrow becomes a close X */
  modal?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <ChromeScale>
      <View
        style={{
          minHeight: 64,
          paddingTop: 8,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: palette.frame,
          borderBottomWidth: 1,
          borderBottomColor: palette.borderSubtle,
        }}
      >
        {back ? (
          // web PhoneBack: the 44 px target pulls toward the edge, so the arrow starts 20 px in (web ~19)
          <View style={{ marginStart: -4 }}>
            <HeaderButton
              icon={modal ? "x" : "arrow-left"}
              label={modal ? t`Close` : t`Back`}
              testID="header-back"
              onPress={typeof back === "function" ? back : () => (router.canGoBack() ? router.back() : router.replace("/home"))}
            />
          </View>
        ) : null}
        {children}
      </View>
    </ChromeScale>
  );
}

/** The bottom sheet: Sheet v2 lives in the kit (drag, detents, keyboard); same props as before */
export { Sheet, type SheetProps } from "../kit/Sheet";

/** A grouped card of rows (radius 14, sheet-group background, hairlines) */
export function RowGroup({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>{children}</View>;
}

/**
 * The one list row inside a RowGroup: 52 px, 12/16 padding, 20 px icon in a
 * 24 px slot, 16/500 label, value and chevron (or another end icon).
 */
export function GroupRow({
  icon,
  leading,
  label,
  value,
  onPress,
  danger,
  first,
  chevron,
  end,
  testID,
  selected,
  link,
}: {
  icon?: IconName;
  /** a custom start mark (a status dot) in the icon slot */
  leading?: ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
  chevron?: boolean;
  /** an end icon instead of the chevron (caret-down for an inline menu) */
  end?: IconName;
  testID?: string;
  selected?: boolean;
  /** opens a page outside the app (read as a link) */
  link?: boolean;
}) {
  const { palette } = useTheme();
  const colour = danger ? palette.danger : palette.fg;
  const endIcon = end ?? (chevron ? "caret-right" : undefined);
  return (
    <PressableRow
      testID={testID}
      accessibilityRole={link ? "link" : "button"}
      accessibilityState={selected === undefined ? undefined : { selected }}
      highlight={palette.navSelected}
      onPress={onPress}
      style={{
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: selected ? palette.navSelected : "transparent",
      }}
    >
      {icon || leading ? (
        <View style={{ width: 24, alignItems: "center", justifyContent: "center" }}>
          {leading ?? <Icon name={icon!} size={20} color={danger ? palette.danger : palette.iconNeutral} />}
        </View>
      ) : null}
      <AText size={16} line={22} weight="medium" color={colour} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </AText>
      {value ? (
        <AText size={14} line={20} color={palette.muted} numberOfLines={1}>
          {value}
        </AText>
      ) : null}
      {endIcon ? <Icon name={endIcon} size={16} color={palette.muted} /> : null}
    </PressableRow>
  );
}

/** Centered empty / error message (14/1.6 muted, padding 48 24) */
export function CenterNote({ icon, children }: { icon?: IconName; children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: "center", gap: 12 }}>
      {icon ? <Icon name={icon} size={24} color={palette.muted} /> : null}
      <AText size={14} line={22} color={palette.muted} style={{ textAlign: "center" }}>
        {children}
      </AText>
    </View>
  );
}
