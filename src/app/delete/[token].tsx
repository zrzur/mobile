import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { confirmAccountDeletion } from "@/auth/flow";
import { AuthPage } from "@/ui/auth/AuthPage";
import { AuthButton, FlowActions, FlowText, FlowTitle } from "@/ui/auth/parts";

/**
 * The link from the "delete your account" email (web: FlowDelete at
 * /login/delete/{token}): confirms at once, then says what happened.
 * Works signed out; the token is the proof.
 */
export default function DeleteAccount() {
  const { t } = useLingui();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { api } = useAuth();
  const [state, setState] = useState<"waiting" | "done" | "error">("waiting");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    confirmAccountDeletion(api, token).then(
      () => setState("done"),
      () => setState("error"),
    );
  }, [api, token]);

  return (
    <AuthPage switchTo={null}>
      <FlowTitle>{t`Delete account`}</FlowTitle>
      <View style={{ gap: 16 }} accessibilityLiveRegion="polite" testID={`delete-${state}`}>
        <FlowText>
          {state === "error"
            ? t`Something went wrong. Please contact support.`
            : state === "done"
              ? t`Your account has been queued for deletion.`
              : t`Please wait…`}
        </FlowText>
        {state !== "waiting" ? (
          <FlowActions>
            <AuthButton onPress={() => router.dismissTo("/login")}>{t`Go to login`}</AuthButton>
          </FlowActions>
        ) : null}
      </View>
    </AuthPage>
  );
}
