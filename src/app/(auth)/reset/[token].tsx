import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { errorDetails, errorText } from "@/auth/errorText";
import { confirmPasswordReset } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkLength } from "@/auth/validate";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, ErrorBox, FlowActions, FlowTitle, TextField } from "@/ui/auth/parts";

/** Choose the new password from the reset link (web: FlowConfirmReset) */
export default function ConfirmReset() {
  const { t, i18n } = useLingui();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { api } = useAuth();
  const [password, setPassword] = useState("");
  const [check, setCheck] = useState<string>();
  const { status, error, run } = useSubmit();

  async function submit() {
    const problem = checkLength(i18n, password, 10);
    setCheck(problem);
    if (problem) return;
    if (await run(() => confirmPasswordReset(api, { token, password }))) router.dismissTo("/login");
  }

  return (
    <AuthPage>
      <FlowTitle subtitle={t`Choose a new password for your Zrzur account.`}>{t`Reset password`}</FlowTitle>
      <View style={{ gap: 16 }}>
        <TextField
          label={t`New password`}
          placeholder={t`Enter a new password.`}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setCheck(undefined);
          }}
          error={check}
          password
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions back={() => router.dismissTo("/login")}>
          <AuthButton status={status} onPress={submit}>
            {t`Reset`}
          </AuthButton>
        </FlowActions>
      </View>
    </AuthPage>
  );
}
