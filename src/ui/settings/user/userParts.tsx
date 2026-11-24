import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, type GestureResponderEvent, type LayoutChangeEvent, Pressable, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { snap } from "./userPrefs";
import { PressableRow } from "@/ui/kit/Press";
import { haptics } from "@/ui/kit/haptics";

/**
 * Small building blocks shared by the user settings pages written here
 * (Feather, Support, Feedback, Notifications, Appearance, Language, Save
 * data, Voice). They follow the phone look of src/ui/settings/parts.tsx.
 */

/**
 * SettingsTabs (web): words in a row 24 apart over a hairline; the open tab
 * is primary text with a 2 px accent line under it. Each tab is a 44 px tap box.
 */
export function Tabs<T extends string>({ label, value, tabs, onChange }: { label: string; value: T; tabs: { id: T; title: string }[]; onChange: (id: T) => void }) {
  const { palette } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: "row", gap: 24, borderBottomWidth: 1, borderBottomColor: palette.borderSubtle }}>
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            testID={`tab-${tab.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => {
              if (!on) haptics.selection();
              onChange(tab.id);
            }}
            style={{ minHeight: 44, minWidth: 44, justifyContent: "flex-end", marginBottom: -1 }}
          >
            {({ pressed }) => (
              <View style={{ paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: on ? palette.accent : "transparent" }}>
                <AText size={15} line={22} weight={on ? "semibold" : "medium"} color={on || pressed ? palette.fg : palette.muted} numberOfLines={1}>
                  {tab.title}
                </AText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row with icon, title, description and a caret (or an external-link mark) */
export function NavRow({
  icon,
  title,
  description,
  onPress,
  first,
  external,
  danger,
  testID,
  aside,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  onPress: () => void;
  first?: boolean;
  external?: boolean;
  danger?: boolean;
  testID?: string;
  aside?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <PressableRow
      testID={testID}
      accessibilityRole={external ? "link" : "button"}
      highlight={palette.navSelected}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
      }}
    >
      {icon ? (
        <View style={{ width: 24, alignItems: "center" }}>
          <Icon name={icon} size={20} color={danger ? palette.danger : palette.iconNeutral} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={14} line={20} weight="medium" color={danger ? palette.danger : palette.fg}>
          {title}
        </AText>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
      </View>
      {aside}
      <Icon name={external ? "arrow-square-out" : "caret-right"} size={16} color={palette.iconMuted} />
    </PressableRow>
  );
}

/** A plain info row: icon + text, no control */
export function InfoRow({ icon, text, first }: { icon: IconName; text: string; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ width: 24, height: 20, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={palette.iconNeutral} />
      </View>
      <AText size={14} line={20} color={palette.fg2} style={{ flex: 1 }}>
        {text}
      </AText>
    </View>
  );
}

/** A small status pill */
export function Pill({ children, tone }: { children: string; tone?: "accent" | "ok" | "warn" | "danger" }) {
  const { palette } = useTheme();
  const colour = tone === "accent" ? palette.accentText : tone === "ok" ? palette.onlineText : tone === "warn" ? palette.warningText : tone === "danger" ? palette.danger : palette.fg2;
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: palette.pill, alignSelf: "flex-start" }}>
      <AText size={12} line={16} weight="semibold" color={colour}>
        {children}
      </AText>
    </View>
  );
}

/** A segmented radio group (Dark | Light | System) */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; disabled?: boolean }) {
  const { palette } = useTheme();
  return (
    // web Segmented: a soft field track with a hairline; the choice is raised out of it
    // (tonal, primary text). Each option keeps a 44 px tap box with a 36 px face inside.
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", borderRadius: 12, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.field, opacity: disabled ? 0.5 : 1 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`segment-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            aria-checked={on}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 44, minWidth: 44, padding: 4 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flex: 1,
                  minHeight: 36,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: on ? palette.tonalBorder : "transparent",
                  backgroundColor: on ? palette.tonal : pressed ? palette.navHover : "transparent",
                }}
              >
                {o.icon ? <Icon name={o.icon} size={16} color={on ? palette.fg : palette.iconMuted} /> : null}
                <AText size={14} line={20} weight={on ? "semibold" : "medium"} color={on ? palette.fg : palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {o.label}
                </AText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row whose control sits under the text (segmented groups, sliders) */
export function StackRow({ icon, title, description, children, first }: { icon?: IconName; title: string; description?: string; children: ReactNode; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {icon ? (
          <View style={{ width: 24, alignItems: "center" }}>
            <Icon name={icon} size={20} color={palette.iconNeutral} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={14} line={20} weight="medium" color={palette.fg}>
            {title}
          </AText>
          {description ? (
            <AText size={13} line={18} color={palette.muted}>
              {description}
            </AText>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * A slider (role adjustable): drag or tap the track; screen readers use
 * increment / decrement. Built here because RN has no slider of its own.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueText,
  disabled,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueText: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  const [width, setWidth] = useState(0);
  const rtl = i18n.locale === "ar";
  const ratio = max === min ? 0 : (value - min) / (max - min);
  const pick = (e: GestureResponderEvent) => {
    if (!width || disabled) return;
    const x = e.nativeEvent.locationX;
    const r = Math.min(1, Math.max(0, x / width));
    onChange(snap(min + (rtl ? 1 - r : r) * (max - min), min, max, step));
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: disabled ? 0.5 : 1 }}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: valueText }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          if (disabled) return;
          onChange(snap(value + (e.nativeEvent.actionName === "increment" ? step : -step), min, max, step));
        }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={pick}
        onResponderMove={pick}
        style={{ flex: 1, height: 44, justifyContent: "center" }}
      >
        <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: palette.borderStrong }}>
          <View style={{ position: "absolute", start: 0, top: 0, bottom: 0, width: `${ratio * 100}%`, borderRadius: 2, backgroundColor: palette.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{ position: "absolute", start: `${ratio * 100}%`, marginStart: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: palette.knob, borderWidth: 2, borderColor: palette.accent }}
        />
      </View>
      <AText size={12} line={16} weight="medium" color={palette.fg2} style={{ minWidth: 48, textAlign: "center", writingDirection: "ltr" }}>
        {valueText}
      </AText>
    </View>
  );
}

/** A spinner line, an error with Try again, or nothing */
export function LoadLine({ state, error, onRetry, loadingText }: { state: "loading" | "error" | "ready"; error?: string; onRetry: () => void; loadingText?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  if (state === "ready") return null;
  return (
    <View accessibilityRole={state === "error" ? "alert" : undefined} style={{ paddingVertical: 16, paddingHorizontal: 16, gap: 8, alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {state === "loading" ? <ActivityIndicator size={16} color={palette.muted} /> : <Icon name="warning-circle" size={16} color={palette.danger} />}
        <AText size={14} line={20} color={state === "error" ? palette.danger : palette.muted} style={{ flexShrink: 1 }}>
          {state === "loading" ? (loadingText ?? t`Loading…`) : error}
        </AText>
      </View>
      {state === "error" ? <Button label={t`Try again`} onPress={onRetry} variant="tonal" size="sm" /> : null}
    </View>
  );
}
