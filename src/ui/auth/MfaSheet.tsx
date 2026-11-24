import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import type { MfaMethod } from "@/auth/flow";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetModal } from "@/ui/kit/Sheet";

import { GroupRow, RowGroup } from "../app/parts";
import { Icon, type IconName } from "../Icon";
import { Button } from "../kit/Button";
import { AText, TextField } from "./parts";

const ICON: Record<MfaMethod, IconName> = {
  Password: "password",
  Totp: "device-mobile",
  Recovery: "key",
};

/**
 * The web's "Confirm action" dialog as a phone bottom sheet: pick a method
 * (the first that is not a recovery code is picked for you), type the code,
 * Confirm. Cancel ends the login.
 *
 * Keyboard: the modal is edge-to-edge on Android (status and navigation bar
 * translucent), so the KeyboardAvoidingView pads on both platforms, and the
 * sheet body scrolls, so the field and Confirm stay above the keyboard on a
 * short phone.
 */
export function MfaSheet({
  methods,
  visible,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  methods: MfaMethod[];
  visible: boolean;
  busy: boolean;
  error?: string;
  onSubmit: (method: MfaMethod, value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const first = methods.find((m) => m !== "Recovery");
  const [method, setMethod] = useState<MfaMethod | undefined>(first);
  const [value, setValue] = useState("");

  const label = (m: MfaMethod) => (m === "Password" ? t`Password` : m === "Totp" ? t`Authenticator app` : t`Recovery code`);

  return (
    <SheetModal visible={visible} onClose={onCancel} testID="mfa-sheet" handleOnly maxShare={0.88} panelStyle={{ paddingTop: 24 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="shield" size={24} color={palette.iconNeutral} />
              <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
                {t`Confirm action`}
              </AText>
            </View>
            <AText size={15} line={22} color={palette.fg2}>
              {method ? t`Please confirm this action using the selected method.` : t`Please select a method to authenticate your request.`}
            </AText>

            {method ? (
              <TextField
                key={method}
                label={label(method)}
                value={value}
                onChangeText={setValue}
                password={method === "Password"}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={method === "Totp" ? "number-pad" : "default"}
                textContentType={method === "Totp" ? "oneTimeCode" : method === "Password" ? "password" : undefined}
                autoComplete={method === "Totp" ? "one-time-code" : undefined}
                returnKeyType="go"
                onSubmitEditing={() => value.trim() && onSubmit(method, value)}
                testID="mfa-code"
              />
            ) : (
              <RowGroup>
                {methods.map((m, i) => (
                  <GroupRow key={m} first={i === 0} icon={ICON[m]} label={label(m)} onPress={() => setMethod(m)} chevron testID={`mfa-method-${m}`} />
                ))}
              </RowGroup>
            )}

            {error ? (
              <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
                <Icon name="warning-circle" size={16} color={palette.danger} />
                <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
                  {error}
                </AText>
              </View>
            ) : null}

            {/* stacked full width, Confirm on top (web: column-reverse) */}
            <View style={{ gap: 8 }}>
              {method ? (
                <Button
                  testID="mfa-submit"
                  icon="shield"
                  label={t`Confirm`}
                  onPress={() => onSubmit(method, value)}
                  disabled={!value.trim()}
                  status={busy ? "submitting" : "ready"}
                  fill
                />
              ) : null}
              {method && methods.length > 1 ? (
                <Button
                  variant="tonal"
                  label={t`Back`}
                  onPress={() => {
                    setMethod(undefined);
                    setValue("");
                  }}
                  fill
                />
              ) : (
                <Button variant="tonal" label={t`Cancel`} onPress={onCancel} fill />
              )}
            </View>
          </ScrollView>
    </SheetModal>
  );
}
