import { Trans, useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, Text, type TextInputInstance, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useAuth } from "@/auth/AuthProvider";
import { Captcha, type CaptchaHandle } from "@/auth/Captcha";
import { errorDetails, errorText } from "@/auth/errorText";
import { AuthError, signUp } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { checkConsent, checkEmail, checkLength } from "@/auth/validate";
import { API_URL, type InstanceConfig, fetchInstanceConfig } from "@/lib/apiUrl";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AText, AuthButton, ErrorBox, FlowActions, FlowTitle, TextField } from "@/ui/auth/parts";
import { openExternal } from "@/ui/kit/openLink";
import { fontFamily } from "@/theme/fonts";

/**
 * A link inside the consent line (web: SignUpConsent <a>): link colour,
 * 500, underlined. A plain nested run: it takes its size and line height
 * from the sentence around it, so a name that wraps onto the next line keeps
 * the same line box and never sits over the words beside it.
 */
function ConsentLink({ url, children }: { url: string; children?: ReactNode }) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  return (
    <Text
      accessibilityRole="link"
      suppressHighlighting={false}
      onPress={() => void openExternal(url)}
      style={{ color: palette.link, fontFamily: fontFamily(i18n.locale, "medium"), textDecorationLine: "underline" }}
    >
      {children}
    </Text>
  );
}

/** Create account (web: FlowCreate). The month and year of birth come at the first entry. */
export default function SignUp() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const { api, setPendingEmail } = useAuth();
  const [config, setConfig] = useState<InstanceConfig | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, string | undefined>>({});
  const { status, error, setError, run } = useSubmit();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const captchaRef = useRef<CaptchaHandle>(null);

  useEffect(() => {
    fetchInstanceConfig(API_URL).then(setConfig, () => setConfig(null));
  }, []);

  async function submit() {
    const next = {
      email: checkEmail(i18n, email),
      password: checkLength(i18n, password, 10),
      invite: config?.inviteOnly ? checkLength(i18n, invite, 1) : undefined,
      consent: checkConsent(i18n, accepted),
    };
    setChecks(next);
    if (next.email) return emailRef.current?.focus();
    if (next.password) return passwordRef.current?.focus();
    if (next.invite || next.consent) return;
    if (config?.captchaKey && !captcha) {
      setError(new AuthError("CaptchaFailed", "CaptchaFailed", { type: "CaptchaFailed" }));
      return;
    }
    const ok = await run(() =>
      signUp(api, { email, password, captcha: captcha ?? undefined, invite: invite || undefined }),
    );
    captchaRef.current?.reset();
    if (ok) {
      setPendingEmail(email.trim());
      router.replace({ pathname: "/check", params: { kind: "verify" } });
    }
  }

  const clear = (field: string) => checks[field] && setChecks((c) => ({ ...c, [field]: undefined }));
  return (
    <AuthPage switchTo="login">
      <FlowTitle subtitle={t`Set up your account and make yourself at home.`}>{t`Create account`}</FlowTitle>
      <View style={{ gap: 16 }}>
        <TextField
          ref={emailRef}
          label={t`Email`}
          placeholder={t`Please enter your email.`}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clear("email");
          }}
          error={checks.email}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          inputMode="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="signup-email"
        />
        <TextField
          ref={passwordRef}
          label={t`New password`}
          placeholder={t`Enter a new password.`}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clear("password");
          }}
          error={checks.password}
          password
          autoComplete="new-password"
          textContentType="newPassword"
          testID="signup-password"
        />
        {config?.inviteOnly ? (
          <TextField
            label={t`Invite code`}
            placeholder={t`Enter your invite code.`}
            value={invite}
            onChangeText={(v) => {
              setInvite(v);
              clear("invite");
            }}
            error={checks.invite}
            autoCapitalize="none"
            autoComplete="off"
            latin
          />
        ) : null}

        <View style={{ gap: 8 }}>
          <Pressable
            testID="signup-consent"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => {
              setAccepted((v) => !v);
              clear("consent");
            }}
            hitSlop={12}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: checks.consent ? palette.danger : accepted ? "transparent" : palette.borderStrong,
                backgroundColor: accepted ? palette.accent : palette.field,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {accepted ? (
                <Svg width={12} height={12} viewBox="0 0 12 12">
                  <Path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke={palette.onAccent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              ) : null}
            </View>
            <AText size={14} line={20} color={palette.fg2} style={{ flex: 1 }}>
              <Trans>
                I accept the <ConsentLink url="https://zrzur.com/legal/terms">Terms of Service</ConsentLink> and the{" "}
                <ConsentLink url="https://zrzur.com/legal/community-guidelines">Community Guidelines</ConsentLink> and have read the{" "}
                <ConsentLink url="https://zrzur.com/legal/privacy">Privacy Policy</ConsentLink>.
              </Trans>
            </AText>
          </Pressable>
          {checks.consent ? (
            <AText size={12} line={16} weight="semibold" color={palette.danger} style={{ paddingStart: 32 }}>
              {checks.consent}
            </AText>
          ) : null}
        </View>

        {config?.captchaKey ? (
          <Captcha ref={captchaRef} siteKey={config.captchaKey} onToken={setCaptcha} onError={() => setCaptcha(null)} />
        ) : null}
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions back={() => router.dismissTo("/login")}>
          <AuthButton status={status} onPress={submit} testID="signup-submit">
            {t`Create account`}
          </AuthButton>
        </FlowActions>
      </View>
    </AuthPage>
  );
}
