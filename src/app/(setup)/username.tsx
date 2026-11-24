import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { errorDetails, errorText } from "@/auth/errorText";
import { chooseUsername } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkLength } from "@/auth/validate";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, ErrorBox, FlowActions, FlowTitle, TextField } from "@/ui/auth/parts";

/** Choose a username (web: FlowLogin, Onboarding state) */
export default function Username() {
  const { t, i18n } = useLingui();
  const { api, refreshAccount, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<string>();
  const { status, error, run } = useSubmit();

  async function submit() {
    const problem = checkLength(i18n, username, 2);
    setCheck(problem);
    if (problem) return;
    await run(async () => {
      await chooseUsername(api, username);
      await refreshAccount();
    });
  }

  return (
    <AuthPage switchTo={null}>
      {/* the explanation sits under the title like the age step's (web FlowTitle subtitle: 4 px) */}
      <FlowTitle subtitle={t`Pick a username that you want people to be able to find you by. This can be changed later in your user settings.`}>{t`Choose a username`}</FlowTitle>
      <View style={{ gap: 16 }}>
        <TextField
          label={t`Username`}
          placeholder={t`Enter your preferred username.`}
          value={username}
          onChangeText={(v) => {
            setUsername(v);
            setCheck(undefined);
          }}
          error={check}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="username-input"
        />
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions back={signOut} backLabel={t`Cancel`}>
          <AuthButton status={status} onPress={submit} testID="username-submit">
            {t`Confirm`}
          </AuthButton>
        </FlowActions>
      </View>
    </AuthPage>
  );
}
