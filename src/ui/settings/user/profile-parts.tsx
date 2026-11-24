import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { SkeletonRows } from "@/ui/kit/Skeleton";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { ChromeScale } from "@/ui/kit/fontScale";

import { Tabs } from "./userParts";

/**
 * Small pieces shared by the Profile, Sessions, Connections, Connected apps
 * and My data pages (web SettingsStatus, outlined/text buttons, pills, tabs).
 */

/** Placeholder rows (shimmer) while a page's list loads */
export function Loading({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={{ paddingVertical: 16 }}>
      <SkeletonRows count={4} avatar={36} padding={0} />
    </View>
  );
}

/** Web SettingsStatus error box: what failed, the server's words, Try again */
export function LoadError({ title, error, onRetry, testID }: { title: string; error: unknown; onRetry: () => void; testID?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View testID={testID} accessibilityRole="alert" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ marginTop: 2 }}>
          <Icon name="warning-circle" size={16} color={palette.danger} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={15} line={20} weight="semibold" color={palette.fg}>
            {title}
          </AText>
          <AText size={13} line={18} color={palette.muted}>
            {describeError(error)}
          </AText>
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        <OutlinedButton label={t`Try again`} onPress={onRetry} testID={testID ? `${testID}-retry` : undefined} />
      </View>
    </View>
  );
}

/** Outlined sm button (web variant "outlined") */
export function OutlinedButton({
  label,
  onPress,
  disabled,
  busy,
  danger,
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  icon?: IconName;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const colour = danger ? palette.danger : palette.fg;
  // the kit Button has no outlined variant: same metrics here (a 36 px face in a 44 px tap box)
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{ minHeight: 44, minWidth: 44, justifyContent: "center", opacity: disabled ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <ChromeScale>
          <View
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.outlineBorder,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: pressed && !disabled && !busy ? palette.navHover : "transparent",
              transform: [{ scale: pressed && !disabled && !busy ? 0.98 : 1 }],
            }}
          >
            {busy ? <ActivityIndicator size={16} color={colour} /> : icon ? <Icon name={icon} size={16} color={colour} /> : null}
            <AText size={14} line={20} weight="semibold" color={colour} numberOfLines={1} style={{ flexShrink: 1 }}>
              {label}
            </AText>
          </View>
        </ChromeScale>
      )}
    </Pressable>
  );
}

/** Text sm button (web variant "text") */
export function TextButton({
  label,
  onPress,
  disabled,
  danger,
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: IconName;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const colour = danger ? palette.danger : palette.accentText;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 8,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? palette.navHover : "transparent",
      })}
    >
      {icon ? <Icon name={icon} size={16} color={colour} /> : null}
      <AText size={14} line={20} weight="semibold" color={colour}>
        {label}
      </AText>
    </Pressable>
  );
}

/** Danger-filled sm button (web variant "error") */
export function DangerButton({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return <Button label={label} onPress={onPress} disabled={disabled} testID={testID} variant="danger" size="sm" />;
}

/** A small status pill next to a title */
export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "accent" | "danger" }) {
  const { palette } = useTheme();
  const colour = tone === "success" ? palette.onlineText : tone === "accent" ? palette.accentText : tone === "danger" ? palette.danger : palette.fg2;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: palette.pill, alignSelf: "flex-start" }}>
      <AText size={12} line={16} weight="semibold" color={colour}>
        {label}
      </AText>
    </View>
  );
}

/** Muted small text (notes, footers) */
export function Note({ children, testID }: { children: ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <AText testID={testID} size={13} line={18} color={palette.muted}>
      {children}
    </AText>
  );
}

/** The web SettingsTabs (the one look lives in userParts) */
export function TabsBar<T extends string>(props: { label: string; tabs: { id: T; title: string }[]; value: T; onChange: (id: T) => void }) {
  return <Tabs {...props} />;
}

/** A tick box row: the whole row is the 44 px target */
export function CheckRow({
  checked,
  onChange,
  label,
  children,
  disabled,
  first,
  testID,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  first?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: disabled ? 0.5 : 1,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: pressed ? palette.navSelected : "transparent",
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: checked ? palette.accent : palette.borderStrong,
          backgroundColor: checked ? palette.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke={palette.onAccent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
    </Pressable>
  );
}

/** A tappable row with a title, a line under it and a caret (web navigational SettingsRow) */
export function NavRow({
  icon,
  leading,
  title,
  description,
  onPress,
  first,
  danger,
  expanded,
  testID,
}: {
  icon?: IconName;
  leading?: ReactNode;
  title: string;
  description?: string;
  onPress: () => void;
  first?: boolean;
  danger?: boolean;
  /** collapsible row (web): caret down while closed, up while open */
  expanded?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: pressed ? palette.navSelected : "transparent",
      })}
    >
      {leading ?? (icon ? (
        <View style={{ width: 24, alignItems: "center" }}>
          <Icon name={icon} size={20} color={danger ? palette.danger : palette.iconNeutral} />
        </View>
      ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={14} line={20} weight="medium" color={danger ? palette.danger : palette.fg} numberOfLines={1}>
          {title}
        </AText>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
      </View>
      <Icon name={expanded === undefined ? "caret-right" : expanded ? "caret-up" : "caret-down"} size={16} color={palette.iconMuted} />
    </Pressable>
  );
}

/** The empty line inside a row group ("No other device is signed in.") */
export function EmptyRow({ children, icon }: { children: string; icon?: IconName }) {
  const { palette } = useTheme();
  return (
    <View style={{ minHeight: 52, paddingVertical: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      {icon ? <Icon name={icon} size={20} color={palette.muted} /> : null}
      <AText size={14} line={20} color={palette.muted} style={{ flex: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/** A short note at the bottom of the page (web snackbar / toast) */
export function Toast({ text, testID = "settings-toast" }: { text: string | null; testID?: string }) {
  const { palette } = useTheme();
  if (!text) return null;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={{
        position: "absolute",
        start: 16,
        end: 16,
        bottom: 16,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
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
      <AText size={14} line={20} weight="medium" color={palette.fg}>
        {text}
      </AText>
    </View>
  );
}

/** Show a toast for 3.2 s: `[text, show]` */
export function useToast(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [text, show];
}

/**
 * Load something once (and again on `reload`): `fetcher` must be stable
 * (useCallback). State changes only inside the promise callbacks.
 */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: unknown }>({});
  useEffect(() => {
    let live = true;
    fetcher()
      .then((data) => live && setState({ data }))
      .catch((error: unknown) => live && setState((s) => ({ ...s, error })));
    return () => {
      live = false;
    };
  }, [fetcher]);
  const reload = useCallback(async () => {
    try {
      const data = await fetcher();
      setState({ data });
    } catch (error) {
      setState((s) => ({ ...s, error }));
    }
  }, [fetcher]);
  const update = useCallback((fn: (data: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  return { data: state.data, error: state.error, reload, update };
}
