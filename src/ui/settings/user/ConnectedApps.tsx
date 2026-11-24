import { useLingui } from "@lingui/react/macro";
import { File as SdkFile } from "@zrzur/sdk/solid";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { longDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";

import { InlineError, SettingsPage } from "../parts";
import { DangerButton, EmptyRow, LoadError, Loading, Note, OutlinedButton, TextButton, useLoad } from "./profile-parts";

type AuthorizedApp = {
  application: { _id: string; username: string; display_name?: string | null; avatar?: { _id: string; tag: string; metadata: unknown } | null };
  scopes: string[];
  authorized_at: string;
};

/** Connected apps (web settings › Connected apps): OAuth grants and revoke */
export function ConnectedAppsPage() {
  const { t } = useLingui();
  const client = useClient();
  const fetchApps = useCallback(() => client.api.raw<AuthorizedApp[]>("get", "/oauth2/authorized"), [client]);
  const loaded = useLoad(fetchApps);
  const apps = loaded.data ?? null;
  const error = loaded.data ? null : loaded.error;
  const load = loaded.reload;
  const setApps = loaded.update;

  return (
    <SettingsPage title={t`Connected apps`} testID="settings-connected-apps">
      {error ? (
        <LoadError title={t`We could not load your connected apps.`} error={error} onRetry={() => void load()} testID="connected-apps-error" />
      ) : !apps ? (
        <Loading testID="connected-apps-loading" />
      ) : (
        <View style={{ gap: 16 }}>
          <Note>{t`Apps you allowed to use your account. Revoking one ends its access at once; bots it added stay in servers until their managers remove them.`}</Note>
          <RowGroup>
            {apps.length ? (
              apps.map((app, i) => (
                <AppRow key={app.application._id} app={app} first={i === 0} onRevoked={() => setApps((list) => list?.filter((a) => a.application._id !== app.application._id) ?? list)} />
              ))
            ) : (
              <EmptyRow icon="key">{t`No apps are connected to your account.`}</EmptyRow>
            )}
          </RowGroup>
        </View>
      )}
    </SettingsPage>
  );
}

function AppRow({ app, first, onRevoked }: { app: AuthorizedApp; first: boolean; onRevoked: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const scopeText = (scope: string) => {
    switch (scope) {
      case "identify":
        return t`Know your username and avatar`;
      case "servers.read":
        return t`See the names and icons of your servers`;
      case "applications.commands":
        return t`Let its commands be used in the server`;
      case "bot.install":
        return t`Add its bot to a server you manage`;
      default:
        return t`Other access`;
    }
  };

  const name = app.application.display_name || app.application.username;
  const avatar = app.application.avatar ? new SdkFile(client, app.application.avatar as never).createFileURL() : undefined;
  const date = longDate(new Date(app.authorized_at), i18n.locale);
  const scopes = app.scopes.map(scopeText).join(" · ");
  const connected = t`Connected on ${date}`;

  const revoke = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.api.raw("delete", `/oauth2/authorized/${app.application._id}`);
      onRevoked();
    } catch (err) {
      const reason = describeError(err);
      setError(t`Access was not revoked.` + " " + reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={`connected-app-${app.application._id}`} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Avatar url={avatar} name={name} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
            {name}
          </AText>
          <AText size={13} line={18} color={palette.muted}>
            {scopes ? `${scopes} · ${connected}` : connected}
          </AText>
        </View>
      </View>
      {confirming ? (
        <View style={{ gap: 8 }}>
          <AText size={14} line={20} color={palette.fg2}>
            {t`${name} loses access to your account at once.`}
          </AText>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
            <TextButton label={t`Cancel`} onPress={() => setConfirming(false)} />
            <DangerButton label={t`Yes, revoke`} onPress={() => void revoke()} disabled={busy} testID={`revoke-confirm-${app.application._id}`} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <OutlinedButton label={t`Revoke access`} onPress={() => setConfirming(true)} testID={`revoke-${app.application._id}`} />
        </View>
      )}
      <InlineError message={error} />
    </View>
  );
}
