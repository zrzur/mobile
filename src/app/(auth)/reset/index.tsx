import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Captcha, type CaptchaHandle } from "@/auth/Captcha";
import { errorDetails, errorText } from "@/auth/errorText";
import { AuthError, requestPasswordReset } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkEmail } from "@/auth/validate";
import { API_URL, fetchInstanceConfig } from "@/lib/apiUrl";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, ErrorBox, FlowActions, FlowTitle, TextField } from "@/ui/auth/parts";

/** Forgot password (web: FlowReset) */
export default function Reset() {
  const { t, i18n } = useLingui();
  const { api, setPendingEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [check, setCheck] = useState<string>();
  const [siteKey, setSiteKey] = useState<string>();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const { status, error, setError, run } = useSubmit();
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    fetchInstanceConfig(API_URL).then((c) => setSiteKey(c.captchaKey), () => {});
  }, []);

  async function submit() {
    const problem = checkEmail(i18n, email);
    setCheck(problem);
    if (problem) return;
    if (siteKey && !captcha) {
      setError(new AuthError("CaptchaFailed", "CaptchaFailed", { type: "CaptchaFailed" }));
      return;
    }
    const ok = await run(() => requestPasswordReset(api, { email, captcha: captcha ?? undefined }));
    captchaRef.current?.reset();
    if (ok) {
      setPendingEmail(email.trim());
      router.replace({ pathname: "/check", params: { kind: "reset" } });
    }
  }

  return (
    <AuthPage>
      <FlowTitle subtitle={t`We'll email you a secure link to choose a new password.`}>{t`Reset password`}</FlowTitle>
      <View style={{ gap: 16 }}>
        <TextField
          label={t`Email`}
          placeholder={t`Please enter your email.`}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setCheck(undefined);
          }}
          error={check}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          inputMode="email"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="reset-email"
        />
        {siteKey ? <Captcha ref={captchaRef} siteKey={siteKey} onToken={setCaptcha} onError={() => setCaptcha(null)} /> : null}
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions back={() => router.dismissTo("/login")}>
          <AuthButton status={status} onPress={submit} testID="reset-submit">
            {t`Reset`}
          </AuthButton>
        </FlowActions>
      </View>
    </AuthPage>
  );
}
