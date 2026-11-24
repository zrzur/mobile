import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { deviceName } from "@/auth/deviceName";
import { errorDetails, errorText } from "@/auth/errorText";
import { type AuthError, confirmVerify, loginWithTicket, toAuthError, verifyNeedsPassword } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkLength } from "@/auth/validate";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, ErrorBox, FlowActions, FlowText, FlowTitle, TextField } from "@/ui/auth/parts";

type Phase =
  | { kind: "verifying" }
  | { kind: "password" }
  | { kind: "error"; error: AuthError }
  | { kind: "success"; ticket: string | null; loginError?: AuthError };

/** The email link opened in the app (web: FlowVerify) */
export default function Verify() {
  const { t, i18n } = useLingui();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { api, acceptLogin } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });
  const [password, setPassword] = useState("");
  const [check, setCheck] = useState<string>();
  const submit = useSubmit();
  const login = useSubmit();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    (async () => {
      try {
        if (await verifyNeedsPassword(api, token)) return setPhase({ kind: "password" });
        setPhase({ kind: "success", ticket: await confirmVerify(api, { token }) });
      } catch (err) {
        setPhase({ kind: "error", error: toAuthError(err) });
      }
    })();
  }, [api, token]);

  if (phase.kind === "verifying") {
    return (
      <AuthPage>
        <FlowTitle>{t`Verifying your account…`}</FlowTitle>
      </AuthPage>
    );
  }

  if (phase.kind === "password") {
    const save = async () => {
      const problem = checkLength(i18n, password, 10);
      setCheck(problem);
      if (problem) return;
      await submit.run(async () => {
        setPhase({ kind: "success", ticket: await confirmVerify(api, { token, password }) });
      });
    };
    return (
      <AuthPage>
        <FlowTitle
          subtitle={t`Your email is confirmed once you choose a password. You'll use it to log in on other devices.`}
        >
          {t`Choose a password`}
        </FlowTitle>
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
          />
          {submit.error ? (
            <ErrorBox message={errorText(i18n, submit.error)} details={errorDetails(submit.error)} />
          ) : null}
          <FlowActions>
            <AuthButton status={submit.status} onPress={save}>
              {t`Save and continue`}
            </AuthButton>
          </FlowActions>
        </View>
      </AuthPage>
    );
  }

  if (phase.kind === "error") {
    return (
      <AuthPage>
        <FlowTitle
          subtitle={
            phase.error.type === "InvalidToken"
              ? t`This link is invalid or has already been used. Request a new one if your account still needs verifying.`
              : errorText(i18n, phase.error)
          }
        >
          {t`Failed to verify!`}
        </FlowTitle>
        <FlowActions back={() => router.dismissTo("/login")}>
          <AuthButton onPress={() => router.replace("/resend")}>{t`Resend verification`}</AuthButton>
        </FlowActions>
      </AuthPage>
    );
  }

  const ticket = phase.ticket;
  return (
    <AuthPage>
      <FlowTitle>{t`Your account has been verified!`}</FlowTitle>
      {login.error ? <FlowText>{errorText(i18n, login.error)}</FlowText> : null}
      {ticket ? (
        <FlowActions back={() => router.dismissTo("/login")}>
          <AuthButton
            status={login.status}
            onPress={() =>
              login.run(async () => {
                await acceptLogin(await loginWithTicket(api, { ticket, friendlyName: deviceName(i18n) }));
              })
            }
          >
            {t`Continue to app`}
          </AuthButton>
        </FlowActions>
      ) : (
        <FlowActions>
          <AuthButton onPress={() => router.dismissTo("/login")}>{t`Log in`}</AuthButton>
        </FlowActions>
      )}
    </AuthPage>
  );
}
