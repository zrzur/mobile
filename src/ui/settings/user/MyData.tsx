import { useLingui } from "@lingui/react/macro";
import type { Client } from "@zrzur/sdk/solid";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { Platform, Share, View } from "react-native";

import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { RowGroup } from "@/ui/app/parts";

import { useMfaTicket } from "../MfaFlow";
import { ControlRow, SettingsPage, SettingsSection, SmallButton } from "../parts";
import { type DataExportInfo, DATA_EXPORT_PATH, canRequest, contactOf, waitParts } from "./mydata-logic";
import { OutlinedButton, Pill, Toast, useLoad, useToast } from "./profile-parts";

const FILE_NAME = "zrzur-data.zip";

/** Fetch the ready copy with this session's headers and hand it to the system */
async function saveCopy(client: Client) {
  const url = `${client.api.baseURL}${DATA_EXPORT_PATH}/download`;
  const headers = client.api.config.headers ?? {};
  if (Platform.OS === "web") {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const href = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = FILE_NAME;
    a.click();
    URL.revokeObjectURL(href);
    return;
  }
  const file = await File.downloadFileAsync(url, new File(Paths.cache, FILE_NAME), { headers, idempotent: true });
  if (Platform.OS === "android") {
    // Android: the person picks a folder (Downloads), the copy is written there
    const folder = await Directory.pickDirectoryAsync();
    const out = folder.createFile(FILE_NAME, "application/zip");
    out.write(await file.bytes());
  } else {
    // iOS: the share sheet offers "Save to Files"
    await Share.share({ url: file.uri });
  }
}

/** My data (web settings › My data): ask for a ZIP copy, then download it */
export function MyDataPage() {
  const { t, i18n } = useLingui();
  const client = useClient();
  const mfa = useMfaTicket();
  const [toast, showToast] = useToast();
  const fetchInfo = useCallback(() => client.api.raw<DataExportInfo>("get", DATA_EXPORT_PATH), [client]);
  const loaded = useLoad(fetchInfo);
  const info = loaded.data ?? null;
  const failed = !!loaded.error && !loaded.data;
  const load = loaded.reload;
  const setInfo = (next: DataExportInfo) => loaded.update(() => next);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // refetched every 5 s while the copy is being prepared
  const pending = info?.status === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [pending, load]);

  const request = async () => {
    setBusy(true);
    try {
      const ticket = await mfa.request();
      if (!ticket) return;
      const next = await client.api.raw<DataExportInfo>("post", DATA_EXPORT_PATH, undefined, { headers: { "X-MFA-Ticket": ticket.token } });
      if (next && typeof next === "object" && "status" in next) setInfo(next);
      else await load();
      showToast(t`We're preparing your copy.`);
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await saveCopy(client);
    } catch {
      showToast(t`We couldn't download your copy. Please try again.`);
    } finally {
      setDownloading(false);
    }
  };

  const contact = contactOf(info ?? undefined);
  const wait = waitParts(info?.next_request_in_seconds ?? 0);
  const h = wait.hours;
  const m = wait.minutes;
  const waiting = !!info && !pending && info.next_request_in_seconds > 0;
  const requestText = pending
    ? t`Your copy is being prepared. This page updates by itself.`
    : waiting
      ? t`You can ask again in ${h} h ${m} min.`
      : t`We prepare it in the background and e-mail you when it's ready. You can ask once every 24 hours.`;
  const datetime = info?.expires_at
    ? new Intl.DateTimeFormat(intlLocale(i18n.locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(info.expires_at))
    : "";

  return (
    <SettingsPage title={t`My data`} testID="settings-my-data" footer={<Toast text={toast} testID="my-data-toast" />}>
      <SettingsSection
        title={t`My data`}
        description={t`Get a ZIP file with your account, profile, messages you sent, files you uploaded, servers, purchases, reports you filed, support requests and settings.`}
      >
        <RowGroup>
          <ControlRow
            first
            icon="download-simple"
            title={t`Request a copy`}
            description={requestText}
            control={<SmallButton primary label={t`Request a copy`} onPress={() => void request()} disabled={!info || busy || !canRequest(info)} testID="my-data-request" />}
          />
          {failed ? (
            <ControlRow
              icon="warning-circle"
              title={t`This page couldn't load`}
              description={t`Check your connection and try again.`}
              control={<OutlinedButton label={t`Try again`} onPress={() => void load()} testID="my-data-retry" />}
            />
          ) : null}
          {info?.status === "failed" ? <ControlRow icon="warning" title={t`It didn't work`} description={t`We couldn't prepare your copy. Ask again, or write to ${contact} and we will answer within one month.`} control={null} /> : null}
          {info?.status === "ready" ? (
            <ControlRow
              icon="check-circle"
              title={t`Your copy is ready`}
              description={t`Available until ${datetime}. Then the file is deleted.`}
              control={
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Pill label={t`Ready`} tone="success" />
                  <OutlinedButton label={t`Download`} onPress={() => void download()} busy={downloading} testID="my-data-download" />
                </View>
              }
            />
          ) : null}
          <ControlRow
            icon="info"
            title={t`If you sent a lot of messages`}
            description={t`The file holds the newest 50,000 messages you sent. For the rest, write to ${contact}; we answer within one month.`}
            control={null}
          />
        </RowGroup>
      </SettingsSection>
      {mfa.element}
    </SettingsPage>
  );
}
