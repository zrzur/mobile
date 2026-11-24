import { useLingui } from "@lingui/react/macro";
import type { Client } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";

import { checkBirth, isUnderMinimumAge } from "@/auth/age";
import { describeError } from "@/auth/errorText";
import { useAuth } from "@/auth/AuthProvider";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields } from "@/client/hooks";
import { secureStorage } from "@/lib/secureStorage";
import { useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { BirthMonthField } from "@/ui/auth/BirthMonthField";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { gateState, type MatureAccess, matureAccess, toBirthMonth } from "./onboardingLogic";

type Age = { mature_access?: string; band?: string } | null | undefined;

// the account's age answer, loaded once per signed-in client (web: client/age.ts)
let age: Age;
let ageOwner: Client | undefined;
const ageListeners = new Set<() => void>();
const setAge = (next: Age) => {
  age = next;
  for (const l of [...ageListeners]) l();
};

function useAccountAge(): MatureAccess {
  const client = useClient();
  useEffect(() => {
    if (ageOwner === client) return;
    ageOwner = client;
    age = undefined;
    client.account
      .fetchAge()
      .then((a) => setAge(a as Age))
      .catch(() => {
        // stay unknown: the server still enforces the age rules
      });
  }, [client]);
  const value = useSyncExternalStore(
    (l) => {
      ageListeners.add(l);
      return () => ageListeners.delete(l);
    },
    () => age,
    () => age,
  );
  return matureAccess(value);
}

/** Mature notices accepted, per channel, kept on this device (web: "<id>-nsfw" section state) */
const accepted = new Set<string>();
const matureKey = (channelId: string) => `zrzur.mature.${channelId}`;

/**
 * Age gate for a mature channel or a channel of a mature server (web:
 * AgeGate): closed until the server says the account may see mature
 * content, then a notice to press "Enter channel" once. Wrap the channel's
 * content with it.
 */
export function AgeGate({ channelId, children }: { channelId: string; children: ReactNode }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const channel = useChannel(channelId);
  const f = useFields(channel, (c) => ({ mature: c.mature || !!c.server?.mature, name: c.isVoice ? c.name : `#${c.name}` }));
  const access = useAccountAge();
  const [ok, setOk] = useState(() => accepted.has(channelId));
  const [prompt, setPrompt] = useState(false);
  const enabled = !!f?.mature;

  useEffect(() => {
    if (!enabled || accepted.has(channelId)) return;
    let live = true;
    secureStorage
      .get(matureKey(channelId))
      .catch(() => null)
      .then((v) => {
        if (live && v) {
          accepted.add(channelId);
          setOk(true);
        }
      });
    return () => {
      live = false;
    };
  }, [enabled, channelId]);

  const state = gateState(enabled, access, ok);
  if (state === "open") return <>{children}</>;

  const enter = () => {
    accepted.add(channelId);
    setOk(true);
    void secureStorage.set(matureKey(channelId), "1").catch(() => {});
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  const text =
    state === "age_unknown"
      ? t`This channel is marked as mature. Add your month and year of birth to open it.`
      : state === "verification_required"
        ? t`Content marked as mature needs an age check that Zrzur doesn't offer yet, so it is closed for everyone.`
        : state === "minor"
          ? t`This channel is marked as mature and is only open to adults.`
          : t`This channel is marked as mature. It may show content that is not suitable for everyone.`;

  const button = (label: string, onPress: () => void, filled: boolean, testID: string) => <Button testID={testID} label={label} onPress={onPress} variant={filled ? "primary" : "ghost"} />;

  return (
    <ScrollView testID="age-gate" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Icon name="warning" size={64} color={palette.warningText} />
      <AText size={20} line={28} weight="bold" color={palette.header} style={{ textAlign: "center" }} accessibilityRole="header">
        {f?.name ?? ""}
      </AText>
      <AText size={16} line={24} color={palette.fg} style={{ textAlign: "center" }}>
        {text}
      </AText>
      {state === "notice" ? (
        <AText size={13} line={18} color={palette.fg2} style={{ textAlign: "center" }}>
          {t`It is open to you because you stated that you are 18 or over. Zrzur does not verify ages.`}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 }}>
        {button(t`Back`, goBack, false, "age-gate-back")}
        {state === "age_unknown" ? button(t`Add month and year of birth`, () => setPrompt(true), true, "age-gate-add") : null}
        {state === "notice" ? button(t`Enter channel`, enter, true, "age-gate-enter") : null}
      </View>
      {prompt ? <AgePromptSheet onClose={() => setPrompt(false)} /> : null}
    </ScrollView>
  );
}

/**
 * "Add your month and year of birth" (web: AgePrompt): opened from the age
 * gate only; "Not now" closes it.
 */
function AgePromptSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const { signOut } = useAuth();
  const [month, setMonth] = useState<number>();
  const [year, setYear] = useState("");
  const [check, setCheck] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<"ask" | "confirm" | "restricted" | "refused">("ask");

  async function submit() {
    const problem = checkBirth(i18n, month, year);
    setCheck(problem);
    if (problem) return;
    // below 16: ask once more before sending it
    if (isUnderMinimumAge(Number(year), month!) && step !== "confirm") return setStep("confirm");
    setBusy(true);
    setError(undefined);
    try {
      const next = (await (client.account as unknown as { changeAge: (m: string) => Promise<Age> }).changeAge(toBirthMonth(Number(year), month!))) as Age;
      setAge(next);
      if (next?.band === "under_minimum") setStep("restricted");
      else onClose();
    } catch (err) {
      if (JSON.stringify(err ?? "").includes("AgeRequirementNotMet")) setStep("refused");
      else {
        setStep("ask");
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const action = (label: string, onPress: () => void, filled: boolean) =>
    filled ? <Button label={label} onPress={onPress} status={busy ? "submitting" : "ready"} /> : <Button label={label} onPress={onPress} variant="ghost" disabled={busy} />;

  return (
    <Sheet visible onClose={onClose} testID="age-prompt">
      {step === "refused" ? (
        <>
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {t`Sorry, we can't create your account`}
          </AText>
          <AText size={15} line={22} color={palette.fg2}>
            {t`Zrzur is only for people aged 16 and older. We did not keep anything from your sign-up.`}
          </AText>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>{action(t`OK`, () => void signOut(), true)}</View>
        </>
      ) : step === "confirm" ? (
        <>
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {t`The date you entered is under 16`}
          </AText>
          <AText size={15} line={22} color={palette.fg2}>
            {t`Zrzur is only for people aged 16 and older. If you continue, a new account is removed. An account that already exists is limited and our team reviews it; entering an older age afterwards does not lift the limit. If you made a mistake, go back.`}
          </AText>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            {action(t`Go back`, () => setStep("ask"), false)}
            {action(t`Continue`, () => void submit(), true)}
          </View>
        </>
      ) : step === "restricted" ? (
        <>
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {t`Your account is limited`}
          </AText>
          <AText size={15} line={22} color={palette.fg2}>
            {t`The month and year of birth on this account are below the minimum age for Zrzur. Content marked as mature is closed, and our team may review the account. If the date is wrong, write to privacy@zrzur.com.`}
          </AText>
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>{action(t`OK`, onClose, true)}</View>
        </>
      ) : (
        <>
          <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {t`Add your month and year of birth`}
          </AText>
          <AText size={15} line={22} color={palette.fg2}>
            {t`Zrzur now asks everyone for this, to keep younger people safe. We keep only the month and year. Until you add it, content marked as mature stays closed.`}
          </AText>
          <BirthMonthField month={month} year={year} onMonth={setMonth} onYear={setYear} error={check} />
          {error ? (
            <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
              {error}
            </AText>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            {action(t`Not now`, onClose, false)}
            {action(t`Save`, () => void submit(), true)}
          </View>
        </>
      )}
    </Sheet>
  );
}
