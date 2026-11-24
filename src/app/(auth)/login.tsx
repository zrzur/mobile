import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { type TextInputInstance, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Captcha, type CaptchaHandle } from "@/auth/Captcha";
import { deviceName } from "@/auth/deviceName";
import { errorDetails, errorText } from "@/auth/errorText";
import { AuthError, type MfaMethod, login, submitMfa, toAuthError } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkEmail, required } from "@/auth/validate";
import { API_URL, fetchInstanceConfig } from "@/lib/apiUrl";
import { AuthPage } from "@/ui/auth/AuthPage";
import { MfaSheet } from "@/ui/auth/MfaSheet";
import {
  AuthButton,
  ErrorBox,
  FlowActions,
  FlowLink,
  FlowLinks,
  FlowTitle,
  TextField,
} from "@/ui/auth/parts";

/** Log in (web: FlowLogin), with the "logged out" state and the second step */
export default function Login() {
  const { t, i18n } = useLingui();
  const { api, acceptLogin, mfa, cancelMfa, sessionEnded, dismissSessionEnded } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checks, setChecks] = useState<{ email?: string; password?: string }>({});
  const [captchaKey, setCaptchaKey] = useState<string>();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string>();
  const [mfaBusy, setMfaBusy] = useState(false);
  const { status, error, setError, run } = useSubmit();
  const passwordRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const captchaRef = useRef<CaptchaHandle>(null);

  if (sessionEnded) {
    return (
      <AuthPage>
        <FlowTitle
          subtitle={t`Your session ended, possibly because you logged out on another device. Log in again to continue.`}
        >
          {t`You've been logged out`}
        </FlowTitle>
        <FlowActions>
          <AuthButton onPress={dismissSessionEnded} testID="login-again">
            {t`Log in again`}
          </AuthButton>
        </FlowActions>
      </AuthPage>
    );
  }

  async function submit() {
    const next = { email: checkEmail(i18n, email), password: required(i18n, password) };
    setChecks(next);
    if (next.email) return emailRef.current?.focus();
    if (next.password) return passwordRef.current?.focus();
    await run(async () => {
      try {
        const result = await login(api, {
          email,
          password,
          friendlyName: deviceName(i18n),
          captcha: captcha ?? undefined,
        });
        const outcome = await acceptLogin(result);
        if (outcome === "disabled") throw new AuthError("Disabled", "Disabled", { type: "Disabled" });
      } catch (err) {
        const failure = toAuthError(err);
        // many wrong passwords: the server asks for the security check
        if (failure.type === "CaptchaFailed") {
          const config = await fetchInstanceConfig(API_URL).catch(() => null);
          if (config?.captchaKey) setCaptchaKey(config.captchaKey);
        }
        captchaRef.current?.reset();
        throw failure;
      }
    });
  }

  async function confirmMfa(method: MfaMethod, value: string) {
    if (!mfa) return;
    setMfaBusy(true);
    setMfaError(undefined);
    try {
      const result = await submitMfa(api, {
        ticket: mfa.ticket,
        method,
        value,
        friendlyName: deviceName(i18n),
      });
      await acceptLogin(result);
    } catch (err) {
      setMfaError(errorText(i18n, toAuthError(err)));
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <AuthPage>
      <FlowTitle subtitle={t`Log in to pick up right where you left off.`}>{t`Welcome back`}</FlowTitle>
      <View style={{ gap: 16 }}>
        <TextField
          ref={emailRef}
          label={t`Email`}
          placeholder={t`Please enter your email.`}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (checks.email) setChecks((c) => ({ ...c, email: undefined }));
          }}
          error={checks.email}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          inputMode="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="login-email"
        />
        <TextField
          ref={passwordRef}
          label={t`Password`}
          placeholder={t`Enter your current password.`}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (checks.password) setChecks((c) => ({ ...c, password: undefined }));
          }}
          error={checks.password}
          password
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="login-password"
        />
        {captchaKey ? (
          <Captcha ref={captchaRef} siteKey={captchaKey} onToken={setCaptcha} onError={() => setCaptcha(null)} />
        ) : null}
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions>
          <AuthButton status={status} onPress={submit} testID="login-submit">
            {t`Log in`}
          </AuthButton>
        </FlowActions>
      </View>
      <FlowLinks label={t`Account help`}>
        <FlowLink onPress={() => router.push({ pathname: "/reset" })} testID="link-reset">
          {t`Forgot password?`}
        </FlowLink>
        <FlowLink onPress={() => router.push("/resend")} testID="link-resend">
          {t`Resend verification`}
        </FlowLink>
      </FlowLinks>

      <MfaSheet
        key={mfa?.ticket ?? "none"}
        visible={!!mfa}
        methods={mfa?.methods ?? []}
        busy={mfaBusy}
        error={mfaError}
        onSubmit={confirmMfa}
        onCancel={() => {
          cancelMfa();
          setMfaError(undefined);
          setError(new AuthError("Unknown", "Cancelled", { type: "Cancelled" }));
        }}
      />
    </AuthPage>
  );
}
