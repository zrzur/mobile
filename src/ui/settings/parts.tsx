import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { describeError } from "@/auth/errorText";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { KeyboardSafeScreen, keyboardScrollProps } from "@/ui/kit/keyboard";
import { SheetModal } from "@/ui/kit/Sheet";
import { useLeaveGuard } from "@/ui/kit/leaveGuard";

/**
 * A settings page as the web shows it on a phone: "← Settings" on top, the
 * page title (and description for top-level pages), then sections 32 apart.
 */
export function SettingsPage({
  title,
  description,
  backLabel,
  children,
  footer,
  testID,
  onBack,
}: {
  title: string;
  /** a nested page inside the same screen (role editor) */
  onBack?: () => void;
  description?: string;
  backLabel?: string;
  children: ReactNode;
  /** pinned under the page (save bar) */
  footer?: ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      {/* the page ends above the keyboard (both platforms: SDK 58 Android is edge-to-edge); the save bar rides with it */}
      <KeyboardSafeScreen inset={insets.bottom}>
        <ScrollView testID={testID} contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 32 }} {...keyboardScrollProps}>
          <View style={{ gap: 8 }}>
            <Pressable
              testID="settings-back"
              accessibilityRole="button"
              onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace("/home"))}
              style={({ pressed }) => ({
                minHeight: 44,
                paddingStart: 8,
                paddingEnd: 12,
                marginStart: -8,
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                alignSelf: "flex-start",
                backgroundColor: pressed ? palette.navHover : "transparent",
              })}
            >
              <Icon name="arrow-left" size={20} color={palette.muted} />
              <AText size={15} line={20} weight="semibold" color={palette.muted}>
                {backLabel ?? t`Settings`}
              </AText>
            </Pressable>
            <AText size={22} line={30} weight="bold" color={palette.header} accessibilityRole="header">
              {title}
            </AText>
            {description ? (
              <AText size={15} line={24} color={palette.fg2}>
                {description}
              </AText>
            ) : null}
          </View>
          {children}
        </ScrollView>
        {footer}
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

/** A section (web Settings Section): label 13/20 600 secondary, description 13/20, 8 px to its content */
export function SettingsSection({
  title,
  description,
  aside,
  readOnly,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  /** missing permission: dimmed with a note, still visible (web) */
  readOnly?: string;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: 8 }}>
      {/* a wide aside (a button) moves under the title on a narrow phone */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 4 }}>
          <AText size={13} line={20} weight="semibold" color={palette.fg2} accessibilityRole="header">
            {title}
          </AText>
          {description ? (
            <AText size={13} line={20} color={palette.fg2}>
              {description}
            </AText>
          ) : null}
        </View>
        {aside}
      </View>
      {readOnly ? (
        <AText size={13} line={18} color={palette.fg2}>
          {t`You can see this but not change it. It needs the permission "${readOnly}".`}
        </AText>
      ) : null}
      <View style={readOnly ? { opacity: 0.6 } : undefined} pointerEvents={readOnly ? "none" : "auto"}>
        {children}
      </View>
    </View>
  );
}

/** The web Toggle: a 40 × 24 pill, pink-red when on, inside a 44 × 44 tap box */
export function Toggle({ value, onChange, label, disabled, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onChange(!value);
      }}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          paddingHorizontal: 4,
          backgroundColor: value ? palette.accent : palette.borderStrong,
          alignItems: value ? "flex-end" : "flex-start",
          justifyContent: "center",
        }}
      >
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: palette.knob }} />
      </View>
    </Pressable>
  );
}

/** A row with a title, a description and a control at the end */
export function ControlRow({ title, description, control, icon, first }: { title: string; description?: string; control: ReactNode; icon?: IconName; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View
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
      {control}
    </View>
  );
}

/** The web SettingsChoices: a radio list, each option a title and a line */
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: T;
  options: { value: T; title: string; text?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <AText size={13} line={20} weight="semibold" color={palette.fg2}>
          {label}
        </AText>
      ) : null}
      <View accessibilityRole="radiogroup" style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden", opacity: disabled ? 0.6 : 1 }}>
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              testID={`choice-${o.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              aria-checked={on}
              disabled={disabled}
              onPress={() => {
                if (!on) haptics.selection();
                onChange(o.value);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 52,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: palette.divider,
                backgroundColor: pressed ? palette.navSelected : "transparent",
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <AText size={14} line={20} weight="medium" color={palette.fg}>
                  {o.title}
                </AText>
                {o.text ? (
                  <AText size={13} line={18} color={palette.muted}>
                    {o.text}
                  </AText>
                ) : null}
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A red line under a control that failed to save (role alert) */
export function InlineError({ message }: { message?: string }) {
  const { palette } = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingTop: 8 }}>
      <Icon name="warning-circle" size={16} color={palette.danger} />
      <AText size={13} line={18} color={palette.danger} style={{ flex: 1 }}>
        {message}
      </AText>
    </View>
  );
}

/**
 * A small button used as a row control (web: Button size sm, 32 px, tonal
 * with a hairline, 15/600). The tap box is 44 × 44; see kit/Button.
 */
export function SmallButton({ label, onPress, disabled, testID, accessibilityLabel, primary }: { label: string; onPress: () => void; disabled?: boolean; testID?: string; accessibilityLabel?: string; primary?: boolean }) {
  return <Button label={label} onPress={onPress} disabled={disabled} testID={testID} accessibilityLabel={accessibilityLabel} variant={primary ? "primary" : "tonal"} size="sm" />;
}

/** Sticky save bar: "Unsaved changes", Reset, Save changes */
export function SaveBar({
  dirty,
  saving,
  error,
  onReset,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  error?: string;
  onReset: () => void;
  onSave: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  // every settings form with a save bar: leaving with unsaved changes asks first (web SettingsForm)
  useLeaveGuard(dirty && !saving);
  if (!dirty && !saving) return null;
  return (
    <View
      testID="save-bar"
      style={{
        position: "absolute",
        start: 16,
        end: 16,
        bottom: 16,
        borderRadius: 10,
        padding: 12,
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
      {error ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Icon name="warning-circle" size={16} color={palette.danger} />
          <AText size={13} line={18} color={palette.danger} style={{ flex: 1 }}>
            {error}
          </AText>
        </View>
      ) : (
        <AText size={14} line={20} weight="semibold" color={palette.fg}>
          {t`Unsaved changes`}
        </AText>
      )}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button label={t`Reset`} onPress={onReset} disabled={saving} variant="ghost" />
        <Button testID="save-changes" label={saving ? t`Saving…` : t`Save changes`} onPress={onSave} status={saving ? "submitting" : "ready"} />
      </View>
    </View>
  );
}

/**
 * The web ConfirmDialog (danger tone): title, text, an optional body
 * (typed confirmation), Cancel and the confirm button. A failure shows
 * inside and the dialog stays open.
 */
export function ConfirmDialog({
  visible,
  title,
  text,
  confirm,
  onConfirm,
  onClose,
  children,
  disabled,
  danger = true,
  cancel,
}: {
  /** the cancel button's words (web: "Keep as is" and the like) */
  cancel?: string;
  visible: boolean;
  title: string;
  text?: string;
  confirm: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  children?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a destructive question gets the warning tap as it opens
  useEffect(() => {
    if (visible && danger) haptics.warning();
  }, [visible, danger]);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      if (danger) haptics.success();
      onClose();
    } catch (err) {
      haptics.error();
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    // the shared sheet frame: springs in, drags down to dismiss, rides the keyboard (typed confirmation)
    <SheetModal visible={visible} onClose={onClose} testID="confirm-dialog" role="alert" dismissible={!busy} panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
          <AText size={18} line={26} weight="bold" color={palette.header}>
            {title}
          </AText>
          {text ? (
            <AText size={15} line={22} color={palette.fg2}>
              {text}
            </AText>
          ) : null}
          {children}
          {error ? (
            <View style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
              <Icon name="warning-circle" size={16} color={palette.danger} />
              <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                {error}
              </AText>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Button testID="confirm-ok" label={confirm} onPress={run} status={busy ? "submitting" : "ready"} disabled={disabled} variant={danger ? "danger" : "primary"} fill />
            <Button label={cancel ?? t`Cancel`} onPress={onClose} variant="tonal" fill />
          </View>
    </SheetModal>
  );
}
