import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { intlLocale } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { ControlRow, InlineError, SettingsPage, SettingsSection } from "../parts";
import { type BillingPlans, kbps, megabytes, streamQuality, wingsProgress } from "../wings";
import { Loading } from "./controls";

type ApiClient = ReturnType<typeof useClient>;

// GET /billing/plans once per client; a failure is tried again next time
const plansCache = new WeakMap<object, Promise<BillingPlans>>();

export function fetchBillingPlans(client: ApiClient): Promise<BillingPlans> {
  let pending = plansCache.get(client);
  if (!pending) {
    pending = (client.api.get("/billing/plans" as never) as Promise<BillingPlans>).then((p) => ({ ...p, levels: p?.levels ?? [] }));
    pending.catch(() => plansCache.delete(client));
    plansCache.set(client, pending);
  }
  return pending;
}

/** The billing plans (`undefined` while loading), and the load error */
export function useBillingPlans(): { plans?: BillingPlans; error?: string } {
  const client = useClient();
  const [state, setState] = useState<{ plans?: BillingPlans; error?: string }>({});
  useEffect(() => {
    let live = true;
    fetchBillingPlans(client)
      .then((plans) => live && setState({ plans }))
      .catch((err) => live && setState({ error: describeError(err) }));
    return () => {
      live = false;
    };
  }, [client]);
  return state;
}

/** Wings (web: WingsSettings), read-only: giving Wings is not in the app yet */
export function WingsPage({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const { plans, error } = useBillingPlans();
  const s = useFields(server, (v) => ({ count: v.supercharge?.count ?? 0, level: v.supercharge?.level ?? 0 }));
  if (!s) return null;
  const n = (value: number) => new Intl.NumberFormat(intlLocale(i18n.locale)).format(value);

  const title = t({ message: "Wings", context: "server-settings" });
  const description = t`The server's level and its perks.`;

  if (error || !plans) {
    return (
      <SettingsPage title={title} description={description} testID="server-wings">
        {error ? <InlineError message={error} /> : <Loading />}
      </SettingsPage>
    );
  }
  if (!plans.available) {
    return (
      <SettingsPage title={title} description={description} testID="server-wings">
        <RowGroup>
          <ControlRow first icon="lightning" title={t`These settings aren't available yet.`} control={null} />
        </RowGroup>
      </SettingsPage>
    );
  }

  const levels = [...plans.levels].sort((a, b) => a.level - b.level);
  const { next, more, percent } = wingsProgress(levels, s.count);
  const count = n(s.count);
  const level = s.level;
  const nextLevel = next?.level ?? 0;
  const moreWings = n(more);

  return (
    <SettingsPage title={title} description={description} testID="server-wings">
      <SettingsSection title={t`Progress`} description={t`Members give the server Wings. More Wings unlock higher levels and their perks for everyone.`}>
        <RowGroup>
          <ControlRow
            first
            icon="lightning"
            title={level ? t`Level ${level}` : t`No level yet`}
            description={next ? t`${count} Wings · ${moreWings} more to level ${nextLevel}` : t`${count} Wings · highest level reached`}
            control={null}
          />
          {percent !== undefined ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View testID="wings-progress" style={{ height: 8, borderRadius: 4, backgroundColor: palette.barFill, overflow: "hidden" }}>
                <View style={{ width: `${percent}%`, height: 8, borderRadius: 4, backgroundColor: palette.accent }} />
              </View>
            </View>
          ) : null}
        </RowGroup>
      </SettingsSection>

      {levels.map((l) => {
        const unlocked = s.level >= l.level;
        const lv = l.level;
        const supercharges = n(l.supercharges);
        const slots = n(l.server_emoji);
        const uploads = `${n(megabytes(l.attachments))} MB`;
        const voice = n(kbps(l.voice_bitrate));
        const stream = streamQuality(l.video_resolution, l.video_framerate);
        const perks = [t`${slots} emoji slots`, t`${uploads} uploads for everyone`, t`${voice} kbps voice`, t`${stream} streams`, ...(l.vanity_invite ? [t`Custom invite link zrzur.cc/your-name`] : [])];
        return (
          <SettingsSection key={l.level} title={t`Level ${lv}`} description={unlocked ? t`Unlocked` : t`From ${supercharges} Wings`}>
            <View testID={`wings-level-${l.level}`} style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 12, opacity: unlocked ? 1 : 0.6 }}>
              {perks.map((p) => (
                <View key={p} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Icon name={unlocked ? "check-circle" : "lock-simple"} size={20} color={unlocked ? palette.online : palette.iconMuted} />
                  <AText size={15} line={22} color={palette.fg} style={{ flex: 1 }}>
                    {p}
                  </AText>
                </View>
              ))}
            </View>
          </SettingsSection>
        );
      })}
    </SettingsPage>
  );
}
