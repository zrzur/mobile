import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RADIUS } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { Button, Chip, ChromeScale, GroupRow, Icon, type IconName, RowGroup, Sheet } from "@/ui/kit";
import { AText } from "@/ui/kit/Text";
import { keyboardScrollProps } from "@/ui/kit/keyboard";

/**
 * Small controls the server, channel and category settings share. They are
 * built from the kit's measures (44 px tap boxes, radius 10, 12/16 rows) and
 * stay local to this area because the kit has no select or empty card yet.
 */

/** Options in a bottom sheet (web: select). Rows are the kit settings row: 52 px, 12/16. */
export function PickerSheet<T extends string | number>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
  onClose: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID}>
      <AText size={16} line={22} weight="semibold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      <RowGroup>
        <View accessibilityRole="radiogroup">
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => {
                  onPick(o.value);
                  onClose();
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: palette.divider,
                  backgroundColor: pressed ? palette.navSelected : "transparent",
                })}
              >
                <AText size={16} line={22} weight={on ? "semibold" : "medium"} color={palette.fg} style={{ flex: 1 }}>
                  {o.label}
                </AText>
                {on ? <Icon name="check-circle" size={20} color={palette.accentText} /> : null}
              </Pressable>
            );
          })}
        </View>
      </RowGroup>
    </Sheet>
  );
}

/**
 * A compact select (filters, slow mode, a row's value): a 36 px tonal pill
 * with a hairline and a caret, inside a 44 × 44 tap box (like kit Button sm).
 */
export function SelectPill({
  label,
  value,
  onPress,
  disabled,
  icon,
  testID,
}: {
  /** what is being chosen, for screen readers */
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 44, minWidth: 44, maxWidth: 240, flexShrink: 1, justifyContent: "center", alignSelf: "flex-start", opacity: disabled ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <ChromeScale>
          <View
            style={{
              minHeight: 36,
              paddingStart: 12,
              paddingEnd: 8,
              borderRadius: RADIUS,
              borderWidth: 1,
              borderColor: palette.tonalBorder,
              backgroundColor: pressed && !disabled ? palette.tonalHover : palette.tonal,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            {icon ? <Icon name={icon} size={16} color={palette.fg2} /> : null}
            <AText size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
              {value}
            </AText>
            <Icon name="caret-down" size={16} color={palette.iconMuted} />
          </View>
        </ChromeScale>
      )}
    </Pressable>
  );
}

/** A form select: the kit text-field box (44 px, radius 10, 12 px padding) with a caret */
export function SelectField({
  label,
  value,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        borderRadius: RADIUS,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: palette.field,
        borderWidth: 1,
        borderColor: pressed ? palette.fieldBorderHover : palette.fieldBorder,
      })}
    >
      <AText size={16} line={20} color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </AText>
      <Icon name="caret-down" size={16} color={palette.iconMuted} />
    </Pressable>
  );
}

/** An empty list: a card with an icon, a strong line and a hint (web empty states) */
export function EmptyCard({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: 24, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.field, alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={24} color={palette.iconMuted} />
      <AText size={14} line={20} weight="semibold" color={palette.fg} style={{ textAlign: "center" }}>
        {title}
      </AText>
      {text ? (
        <AText size={13} line={20} color={palette.muted} style={{ textAlign: "center" }}>
          {text}
        </AText>
      ) : null}
      {children}
    </View>
  );
}

/** Loading a list: placeholder rows (shimmer) under a line saying what loads */
export function Loading({ text }: { text?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={text ?? t`Loading…`} style={{ paddingVertical: 16, gap: 8 }}>
      <AText size={13} line={20} color={palette.muted} style={{ paddingHorizontal: 16 }}>
        {text ?? t`Loading…`}
      </AText>
      <SkeletonRows count={4} avatar={32} label={false} />
    </View>
  );
}

/** A list that failed to load: the reason in plain words and Try again */
export function LoadError({ text, onRetry, testID }: { text: string; onRetry?: () => void; testID?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View testID={testID} accessibilityRole="alert" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Icon name="warning-circle" size={20} color={palette.danger} />
        <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
          {text}
        </AText>
      </View>
      {onRetry ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button label={t`Try again`} onPress={onRetry} variant="tonal" size="sm" icon="arrow-clockwise" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A notice box (web Discoverable banner): the icon in a 36 px tinted square,
 * a strong line 14/600 and a muted text, on the field surface with a hairline.
 */
export function Notice({ icon, tone, strong, text, extra, testID }: { icon: IconName; tone: string; strong: string; text?: string; extra?: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, paddingEnd: 16, borderRadius: 14, backgroundColor: palette.field, borderWidth: 1, borderColor: palette.borderSoft }}
    >
      <View style={{ width: 36, height: 36, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", backgroundColor: palette.tonal }}>
        <Icon name={icon} size={20} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 4, paddingTop: 2 }}>
        <AText size={14} line={20} weight="semibold" color={palette.fg}>
          {strong}
        </AText>
        {text ? (
          <AText size={13} line={20} color={palette.fg2}>
            {text}
          </AText>
        ) : null}
        {extra ? (
          <AText size={13} line={20} color={palette.fg}>
            {extra}
          </AText>
        ) : null}
      </View>
    </View>
  );
}

/** A muted note with the info icon (web Note) */
export function Note({ children, icon = "info" }: { children: string; icon?: IconName }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Icon name={icon} size={16} color={palette.iconMuted} />
      <AText size={13} line={20} color={palette.muted} style={{ flex: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/** A form label 13/600 with an optional counter and hint (web form labels) */
export function FieldLabel({ children, counter, hint }: { children: string; counter?: string; hint?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ flexShrink: 1 }}>
          {children}
        </AText>
        {counter ? (
          <AText size={12} line={20} color={palette.muted}>
            {counter}
          </AText>
        ) : null}
      </View>
      {hint ? (
        <AText size={13} line={20} color={palette.muted}>
          {hint}
        </AText>
      ) : null}
    </View>
  );
}

/** A radio dot (20 px ring, 10 px accent dot when on), for rows that pick one */
export function RadioDot({ on }: { on: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent }} /> : null}
    </View>
  );
}

/** A checkbox square (20 px, radius 6, accent fill with a check when on) */
export function CheckBox({ on }: { on: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: on ? palette.accent : palette.borderStrong, backgroundColor: on ? palette.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
      {on ? <Icon name="check" size={14} color={palette.onAccent} /> : null}
    </View>
  );
}

/** A 44 px icon tool at a row's end (gear, trash, copy) */
export function RowTool({ icon, label, onPress, danger, disabled, testID }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1, backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      <Icon name={icon} size={20} color={danger ? palette.danger : palette.iconMuted} />
    </Pressable>
  );
}

/*
 * The settings list as the web shows it on a phone (web settings Sidebar):
 * "← Back", a card naming what is edited, then categories of 50 px rows in
 * one rounded group each. The user settings list draws the same rows.
 */

/** The whole list screen: frame background, 12 px gutters, 16 between blocks */
export function ListScreen({ children, testID }: { children: ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView testID={testID} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 48, gap: 16 }} {...keyboardScrollProps}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Loading a settings screen: the frame with a spinner (instead of a blank page) */
export function ScreenLoading() {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={palette.muted} accessibilityLabel={t`Loading…`} />
    </SafeAreaView>
  );
}

/** "← Back" (web BackCard) and the card under it (web ServerCard / ChannelCard), 4 apart */
export function ListHead({ leading, name, sub, onBack, backTestID }: { leading: ReactNode; name: string; sub: string; onBack: () => void; backTestID?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        testID={backTestID}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingHorizontal: 12,
          borderRadius: RADIUS,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          alignSelf: "stretch",
          backgroundColor: pressed ? palette.navHover : "transparent",
        })}
      >
        <Icon name="arrow-left" size={20} color={palette.fg2} />
        <AText size={15} line={20} weight="medium" color={palette.fg2}>
          {t`Back`}
        </AText>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, padding: 8 }}>
        {leading}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText autoDir size={14} line={18} weight="semibold" color={palette.fg} numberOfLines={1}>
            {name}
          </AText>
          <AText autoDir size={12} line={16} weight="medium" color={palette.muted} numberOfLines={1}>
            {sub}
          </AText>
        </View>
      </View>
    </View>
  );
}

/** A category: its title 13/20 600 muted, then its rows in one group (radius 14) */
export function ListCategory({ title, children }: { title?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {title ? (
        <AText size={13} line={20} weight="semibold" color={palette.muted} numberOfLines={1} accessibilityRole="header" style={{ paddingHorizontal: 8 }}>
          {title}
        </AText>
      ) : null}
      <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

/**
 * A page row of a settings list: the kit GroupRow (52 px, 12/16 padding,
 * 20 px icon, 16/500 name, the arrow at the end). The user settings list and
 * the server, channel and category lists all draw this one row.
 */
export function ListRow({
  icon,
  title,
  value,
  onPress,
  first,
  danger,
  external,
  testID,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress: () => void;
  first?: boolean;
  danger?: boolean;
  /** opens a page outside the app */
  external?: boolean;
  testID?: string;
}) {
  return <GroupRow icon={icon} label={title} value={value} onPress={onPress} first={first} danger={danger} link={external} testID={testID} chevron />;
}

/** A labelled row of radio chips (one choice), used inside sheets and dialogs instead of a second sheet */
export function ChipChoice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {label}
      </AText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => (
          <Chip key={String(o.value)} radio selected={o.value === value} label={o.label} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}
