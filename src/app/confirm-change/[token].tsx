import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { type SecurityChange, answerSecurityChange, readSecurityChange } from "@/auth/flow";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AText, AuthButton, FlowText, FlowTitle } from "@/ui/auth/parts";
import { Button } from "@/ui/kit";

type State = { state: "loading" } | { state: "invalid" } | { state: "open"; change: SecurityChange } | { state: "done"; accepted: boolean; kind: SecurityChange["kind"] };

/**
 * Confirm or decline an email or two-factor change that Zrzur support asked
 * for (web: FlowConfirmChange at /login/confirm-change/{token}). Reached from
 * the link sent to the account's current email; works signed out, once.
 */
export default function ConfirmChange() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { api } = useAuth();
  const [state, setState] = useState<State>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    readSecurityChange(api, token).then(setState);
  }, [api, token]);

  async function answer(accept: boolean) {
    if (state.state !== "open" || !token) return;
    setBusy(true);
    setFailed(false);
    try {
      await answerSecurityChange(api, token, accept);
      setState({ state: "done", accepted: accept, kind: state.change.kind });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const toLogin = () => router.dismissTo("/login");

  if (state.state === "loading") {
    return (
      <AuthPage switchTo={null}>
        <FlowTitle>{t`Please wait…`}</FlowTitle>
      </AuthPage>
    );
  }
  if (state.state === "invalid") {
    return (
      <AuthPage switchTo={null}>
        <FlowTitle subtitle={t`This link has expired, was already used, or was withdrawn. Nothing was changed. Contact Zrzur support if you still need help.`}>
          {t`This link no longer works`}
        </FlowTitle>
        <Button variant="ghost" label={t`Go back to login`} onPress={toLogin} testID="change-invalid" />
      </AuthPage>
    );
  }
  if (state.state === "done") {
    return (
      <AuthPage switchTo={null}>
        <FlowTitle>
          {!state.accepted
            ? t`Declined. Nothing was changed.`
            : state.kind === "two_factor"
              ? t`Two-factor authentication is off. Sign in with your email and password.`
              : t`Almost done: open the link we sent to your new email to finish the change.`}
        </FlowTitle>
        <View style={{ flexDirection: "row" }}>
          <AuthButton onPress={toLogin} testID="change-done">
            {t`Go to login`}
          </AuthButton>
        </View>
      </AuthPage>
    );
  }
  const change = state.change;
  return (
    <AuthPage switchTo={null}>
      <FlowTitle subtitle={t`Nothing changes unless you confirm. If you didn't ask Zrzur for this, decline it and change your password.`}>
        {change.kind === "two_factor" ? t`Turn off two-factor authentication?` : t`Change your sign-in email?`}
      </FlowTitle>
      <View style={{ gap: 12 }} testID="change-open">
        {change.kind === "email" && change.new_email ? (
          <AText size={16} line={22} weight="semibold" color={palette.fg} style={{ writingDirection: "ltr", textAlign: "left" }} selectable>
            {change.new_email}
          </AText>
        ) : null}
        {change.kind === "two_factor" ? <FlowText>{t`You'll be signed out on every device. You can turn two-factor on again in your settings.`}</FlowText> : null}
        {change.reason ? (
          <AText autoDir size={15} line={22} color={palette.fg2}>
            {change.reason}
          </AText>
        ) : null}
        {failed ? (
          <AText size={14} line={20} color={palette.danger} accessibilityRole="alert">
            {t`That didn't work. Try again in a moment.`}
          </AText>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <AuthButton status={busy ? "submitting" : "ready"} onPress={() => void answer(true)} testID="change-confirm">
            {t`Confirm`}
          </AuthButton>
        </View>
        <Button variant="ghost" label={t`Decline`} disabled={busy} onPress={() => void answer(false)} testID="change-decline" fill />
      </View>
    </AuthPage>
  );
}
