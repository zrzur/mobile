import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { relativeParts } from "@/chat/rich/poll";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { openExternal } from "@/ui/kit/openLink";
import { PressableRow } from "@/ui/kit/Press";
import { SheetModal } from "@/ui/kit/Sheet";
import { AText } from "@/ui/kit/Text";
import { CheckRow } from "@/ui/settings/user/profile-parts";

import { type PolicyChangeLike, policyText, safePolicyLink } from "./noticeModel";

/** Shown once per app run, as the web does once per session */
let shownThisRun = false;

/** Tests only */
export function resetPolicyShown() {
  shownThisRun = false;
}

function Stamp({ v }: { v: string }) {
  return <Text>{v}</Text>;
}

/**
 * "Review policy changes" (web: PolicyChange modal): the changes the
 * server reports at sign-in, each opening its page in the browser, a tick
 * "I've read and reviewed the changes." and Acknowledge. Close keeps them
 * for the next start.
 */
export function PolicySheet() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [changes, setChanges] = useState<{ list: PolicyChangeLike[]; acknowledge: () => Promise<void>; now: number } | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const on = (list: PolicyChangeLike[], acknowledge: () => Promise<void>) => {
      if (shownThisRun || !list.length) return;
      shownThisRun = true;
      setChanges({ list, acknowledge, now: Date.now() });
    };
    client.on("policyChanges", on as never);
    return () => {
      client.off("policyChanges", on as never);
    };
  }, [client]);

  if (!changes) return null;

  const when = (iso: string) => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return { day: iso, rel: "" };
    const rel = relativeParts(at.getTime() - changes.now);
    return {
      day: at.toISOString().slice(0, 10),
      rel: new Intl.RelativeTimeFormat(intlLocale(i18n.locale), { numeric: "auto" }).format(rel.value, rel.unit),
    };
  };

  const acknowledge = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await changes.acknowledge();
      haptics.success();
      setChanges(null);
    } catch (err) {
      haptics.error();
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal visible onClose={() => setChanges(null)} testID="policy-dialog" dismissible={!busy} panelStyle={{ padding: 16, paddingTop: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="shield-check" size={22} color={palette.iconNeutral} />
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {t`Review policy changes`}
        </AText>
      </View>
      <AText size={15} line={22} color={palette.fg2}>
        {t`Click on the items below to learn more about different changes!`}
      </AText>
      <ScrollView style={{ flexGrow: 0, maxHeight: 320 }}>
        <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
          {changes.list.map((change, i) => {
            const link = safePolicyLink(change.url);
            const { day, rel } = when(change.effective_time);
            return (
              <PressableRow
                key={`${change.url}-${i}`}
                testID={`policy-change-${i}`}
                accessibilityRole="link"
                disabled={!link}
                highlight={palette.navSelected}
                onPress={() => link && void openExternal(link)}
                style={{ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <AText autoDir size={15} line={22} weight="semibold" color={palette.fg}>
                    {policyText(change, i18n.locale)}
                  </AText>
                  <AText size={13} line={18} color={palette.muted}>
                    <Trans>
                      Effective <Stamp v={day} /> (<Stamp v={rel} />)
                    </Trans>
                  </AText>
                </View>
                {link ? <Icon name="arrow-square-out" size={18} color={palette.iconNeutral} /> : null}
              </PressableRow>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
        <CheckRow first checked={read} onChange={setRead} label={t`I've read and reviewed the changes.`} testID="policy-read">
          <AText size={15} line={22} color={palette.fg} style={{ flex: 1 }}>
            {t`I've read and reviewed the changes.`}
          </AText>
        </CheckRow>
      </View>
      {error ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: palette.field }}>
          <Icon name="warning-circle" size={16} color={palette.danger} />
          <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
            {error}
          </AText>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button testID="policy-acknowledge" label={t`Acknowledge`} disabled={!read} status={busy ? "submitting" : "ready"} onPress={() => void acknowledge()} fill />
        <Button label={t`Close`} variant="tonal" onPress={() => setChanges(null)} fill disabled={busy} />
      </View>
    </SheetModal>
  );
}
