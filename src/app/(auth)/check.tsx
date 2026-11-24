import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { mapMailProvider } from "@/auth/mailProvider";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, FlowActions, FlowTitle } from "@/ui/auth/parts";

/** Check your email (web: FlowCheck), after sign-up, resend or reset */
export default function Check() {
  const { t } = useLingui();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { pendingEmail } = useAuth();
  const provider = mapMailProvider(pendingEmail);
  return (
    <AuthPage>
      <FlowTitle
        subtitle={
          kind === "reset"
            ? t`If an account uses this address, we've sent it a link to choose a new password. Please allow up to 10 minutes for it to arrive.`
            : t`We've sent you a verification email. Please allow up to 10 minutes for it to arrive.`
        }
      >
        {t`Check your email`}
      </FlowTitle>
      <FlowActions back={() => router.dismissTo("/login")}>
        {provider ? (
          <AuthButton onPress={() => Linking.openURL(provider[1])} testID="check-open-mail">
            {t`Open ${provider[0]}`}
          </AuthButton>
        ) : null}
      </FlowActions>
    </AuthPage>
  );
}
