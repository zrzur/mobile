import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { inputDirStyle } from "@/ui/kit/bidi";
import { fontFamily } from "@/theme/fonts";
import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/**
 * Small pieces shared by search, threads, forum and the channel details
 * screen (web: Segmented, the phone filter chips, the empty states).
 */

/** Equal choices in one 44 px row (web: Segmented on a phone) */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (value: T) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", padding: 4, gap: 4, borderRadius: 12, backgroundColor: palette.field }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 8,
              paddingHorizontal: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: on ? palette.navSelected : pressed ? palette.navHover : "transparent",
            })}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? palette.fg : palette.fg2} /> : null}
            <AText size={14} line={20} weight={on ? "semibold" : "medium"} color={on ? palette.fg : palette.fg2} numberOfLines={1}>
              {o.label}
            </AText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A tag or filter that can be switched on and off (web: ForumTag Tag, filter
 * Pick): the kit Chip look (44 px pill, 16 px sides, 14/600; on = raised),
 * plus a leading emoji and the removable form (a chosen filter).
 */
export function Pill({
  label,
  on,
  onPress,
  icon,
  leading,
  testID,
  removable,
  a11y,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  icon?: IconName;
  /** drawn before the label (a tag's emoji) */
  leading?: ReactNode;
  testID?: string;
  /** a chosen filter: a tap takes it away (web: ChipButton) */
  removable?: boolean;
  a11y?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={removable ? undefined : { selected: !!on }}
      aria-pressed={removable ? undefined : !!on}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        maxWidth: "100%",
        paddingStart: 16,
        paddingEnd: removable ? 12 : 16,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: on || removable ? palette.navSelected : pressed ? palette.navHover : palette.field,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={on || removable ? palette.fg : palette.fg2} /> : null}
      {leading}
      <AText size={14} line={20} weight="semibold" color={on || removable ? palette.fg : palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </AText>
      {removable ? <Icon name="x" size={16} color={palette.iconMuted} /> : null}
    </Pressable>
  );
}

/** A row of pills that scrolls sideways (forum tags, filter chips) */
export function PillRow({ children, label, wrap }: { children: ReactNode; label: string; wrap?: boolean }) {
  if (wrap) {
    return (
      <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}
      {...keyboardScrollProps}
    >
      {children}
    </ScrollView>
  );
}

/** The one empty state of a page: 44 px icon, 18/600 title, 14/22 text (web: Empty data-middle) */
export function EmptyState({
  icon,
  title,
  text,
  action,
  testID,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View testID={testID} accessibilityRole="text" style={{ paddingVertical: 48, paddingHorizontal: 32, alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={44} color={palette.iconMuted} />
      <AText size={18} line={24} weight="semibold" color={palette.fg} style={{ marginTop: 4, textAlign: "center" }}>
        {title}
      </AText>
      {text ? (
        <AText size={14} line={22} color={palette.muted} style={{ textAlign: "center" }}>
          {text}
        </AText>
      ) : null}
      {action}
    </View>
  );
}

/** A quiet line in a box: why something can't be done here (web: Reason) */
export function ReasonNote({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View accessibilityRole="text" style={{ marginHorizontal: 16, padding: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.field }}>
      <AText size={14} line={20} color={palette.fg2}>
        {children}
      </AText>
    </View>
  );
}

/** A quiet action under a message ("Try again"): the kit's tonal button */
export function TextButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return <Button testID={testID} variant="tonal" label={label} onPress={onPress} />;
}

/** Labelled input for sheets: one line, or several (`lines`), with a counter */
export function SheetField({
  label,
  value,
  onChange,
  max,
  lines,
  testID,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  lines?: number;
  testID?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AText size={13} line={20} weight="semibold" color={focused ? palette.fg : palette.fg2} style={{ flex: 1 }}>
          {label}
        </AText>
        <AText size={12} line={16} color={palette.muted}>
          {`${[...value].length}/${max}`}
        </AText>
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        maxLength={max}
        multiline={!!lines}
        numberOfLines={lines}
        autoFocus={autoFocus}
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        selectionColor={palette.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          // the kit field (TextField): 44 px, radius 10, field border, accent while focused
          minHeight: lines ? 20 * lines + 24 : 44,
          maxHeight: lines ? 20 * 8 + 24 : undefined,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: RADIUS,
          borderWidth: 1,
          borderColor: focused ? palette.accent : palette.fieldBorder,
          backgroundColor: palette.field,
          color: palette.fg,
          fontSize: 16,
          lineHeight: 20,
          textAlignVertical: lines ? "top" : "center",
          fontFamily: fontFamily(i18n.locale),
          ...inputDirStyle(value),
        }}
      />
    </View>
  );
}
