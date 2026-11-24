/**
 * Settings > Notifications > Alerts on the phone (web: the Alerts section,
 * "Push notifications"). On: asks the system once more if needed and sends
 * the device token; off: the server stops pushing to this session. When the
 * system refused, the row explains it and opens the app's system settings.
 */
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { RowGroup } from "@/ui/app/parts";
import { ControlRow, InlineError, SettingsSection, SmallButton, Toggle } from "@/ui/settings/parts";

import { type PermissionState, askPermission, ensureAndroidChannels, readPermission, readPushChoiceStored, registerDevice, storePushChoice, unregisterDevice } from "./push";
import type { PushChoice } from "./register";

export function PushSettingsSection() {
  const { t, i18n } = useLingui();
  const client = useClient();
  const [choice, setChoice] = useState<PushChoice>();
  const [permission, setPermission] = useState<PermissionState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    const read = () =>
      void Promise.all([readPushChoiceStored(), readPermission()]).then(([c, p]) => {
        if (!live) return;
        setChoice(c);
        setPermission(p);
      });
    read();
    // back from the system settings: the permission may have changed
    const sub = AppState.addEventListener("change", (next) => next === "active" && read());
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (Platform.OS === "web" || !permission) return null;

  const on = choice !== "off" && permission.status === "granted";
  const blocked = permission.status === "denied" && !permission.canAskAgain;

  const change = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (next) {
        await ensureAndroidChannels(i18n).catch(() => {});
        const answer = permission.status === "granted" ? permission : await askPermission();
        setPermission(answer);
        if (answer.status !== "granted") {
          setError(t`Failed to enable notifications. Zrzur does not have notification permission.`);
          return;
        }
        await storePushChoice("on");
        setChoice("on");
        try {
          await registerDevice(client);
        } catch {
          setError(t`Failed to enable push notifications. Please try again later.`);
        }
      } else {
        await storePushChoice("off");
        setChoice("off");
        await unregisterDevice(client).catch((err: unknown) => setError(describeError(err)));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title={t`Alerts`}>
      <RowGroup>
        <ControlRow
          first
          icon="bell"
          title={t`Push notifications`}
          description={t`Show notifications while the app is open or in the background.`}
          control={<Toggle label={t`Push notifications`} value={on} disabled={busy} onChange={(v) => void change(v)} testID="push-notifications" />}
        />
      </RowGroup>
      {blocked ? <SmallButton label={t`Open settings`} onPress={() => void Linking.openSettings()} testID="push-open-settings" /> : null}
      <InlineError message={error} />
    </SettingsSection>
  );
}
