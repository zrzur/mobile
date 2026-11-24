import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

/** A step's button: the kit Button sharing the row (quiet = tonal) */
export function StepButton({
  label,
  onPress,
  tone = "quiet",
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "danger" | "quiet";
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Button testID={testID} label={label} onPress={onPress} variant={tone === "quiet" ? "tonal" : tone} disabled={disabled} status={busy ? "submitting" : "ready"} fill />
    </View>
  );
}

/** An error line inside a step (the step stays open) */
export function StepError({ message }: { message?: string }) {
  const { palette } = useTheme();
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, backgroundColor: palette.field }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name="warning-circle" size={16} color={palette.danger} />
      </View>
      <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
        {message}
      </AText>
    </View>
  );
}

/**
 * One step in the profile sheet (web: a confirm dialog): title, text,
 * body, then Cancel and the action. A failure shows inside; success leaves.
 */
export function StepPanel({
  title,
  text,
  children,
  confirm,
  tone = "danger",
  onConfirm,
  onCancel,
  disabled,
  testID,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
  confirm: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };
  return (
    <View testID={testID} style={{ gap: 16 }}>
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {title}
      </AText>
      {text ? (
        <AText size={15} line={22} color={palette.fg2}>
          {text}
        </AText>
      ) : null}
      {children}
      <StepError message={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StepButton testID="step-cancel" label={t`Cancel`} onPress={onCancel} disabled={busy} />
        <StepButton testID="step-confirm" label={confirm} tone={tone} busy={busy} disabled={disabled} onPress={() => void run()} />
      </View>
    </View>
  );
}

/** A radio-style choice row (44 px, aria-checked) */
export function RadioRow({ label, checked, onPress, first, testID }: { label: string; checked: boolean; onPress: () => void; first?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      aria-checked={checked}
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
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: checked ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
        {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent }} /> : null}
      </View>
      <AText size={16} line={22} weight="medium" color={palette.fg} style={{ flex: 1 }}>
        {label}
      </AText>
    </Pressable>
  );
}
