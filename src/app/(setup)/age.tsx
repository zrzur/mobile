import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { checkBirth, isUnderMinimumAge } from "@/auth/age";
import { useAuth } from "@/auth/AuthProvider";
import { errorDetails, errorText } from "@/auth/errorText";
import { declareAge, toAuthError } from "@/auth/flow";
import { useSubmit } from "@/auth/useSubmit";
import { AuthPage } from "@/ui/auth/AuthPage";
import { BirthMonthField } from "@/ui/auth/BirthMonthField";
import { AuthButton, ErrorBox, FlowActions, FlowTitle } from "@/ui/auth/parts";

/** Month and year of birth, asked once (web: FlowLogin, AgeRequired state) */
export default function Age() {
  const { t, i18n } = useLingui();
  const { api, refreshAccount, signOut } = useAuth();
  const [month, setMonth] = useState<number>();
  const [year, setYear] = useState("");
  const [check, setCheck] = useState<string>();
  const [confirmUnder16, setConfirmUnder16] = useState(false);
  const [refused, setRefused] = useState(false);
  const { status, error, setError, run } = useSubmit();

  async function send() {
    await run(async () => {
      try {
        await declareAge(api, Number(year), month!);
      } catch (err) {
        if (toAuthError(err).type === "AgeRequirementNotMet") {
          setConfirmUnder16(false);
          setRefused(true);
          return;
        }
        throw err;
      }
      await refreshAccount();
    });
  }

  async function submit() {
    const problem = checkBirth(i18n, month, year);
    setCheck(problem);
    if (problem) return;
    if (isUnderMinimumAge(Number(year), month!)) {
      setConfirmUnder16(true);
      return;
    }
    await send();
  }

  if (refused) {
    return (
      <AuthPage switchTo={null}>
        <FlowTitle subtitle={t`Zrzur is only for people aged 16 and older. We did not keep anything from your sign-up.`}>
          {t`Sorry, we can't create your account`}
        </FlowTitle>
        <FlowActions>
          <AuthButton onPress={signOut} testID="age-refused-ok">
            {t`OK`}
          </AuthButton>
        </FlowActions>
      </AuthPage>
    );
  }

  if (confirmUnder16) {
    return (
      <AuthPage switchTo={null}>
        <FlowTitle
          subtitle={t`Zrzur is only for people aged 16 and older. If you continue, a new account is removed. An account that already exists is limited and our team reviews it; entering an older age afterwards does not lift the limit. If you made a mistake, go back.`}
        >
          {t`The date you entered is under 16`}
        </FlowTitle>
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions
          back={() => {
            setConfirmUnder16(false);
            setError(null);
          }}
          backLabel={t`Go back`}
        >
          <AuthButton status={status} onPress={send} testID="age-under16-continue">
            {t`Continue`}
          </AuthButton>
        </FlowActions>
      </AuthPage>
    );
  }

  return (
    <AuthPage switchTo={null}>
      <FlowTitle subtitle={t`We ask everyone once, to keep younger people safe.`}>
        {t`Add your month and year of birth`}
      </FlowTitle>
      <View style={{ gap: 16 }}>
        <BirthMonthField
          month={month}
          year={year}
          onMonth={(m) => {
            setMonth(m);
            setCheck(undefined);
          }}
          onYear={(y) => {
            setYear(y);
            setCheck(undefined);
          }}
          error={check}
        />
        {error ? <ErrorBox message={errorText(i18n, error)} details={errorDetails(error)} /> : null}
        <FlowActions back={signOut} backLabel={t`Log out`}>
          <AuthButton status={status} onPress={submit} testID="age-submit">
            {t`Continue`}
          </AuthButton>
        </FlowActions>
      </View>
    </AuthPage>
  );
}
