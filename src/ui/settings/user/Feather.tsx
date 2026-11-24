import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { longDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import { ControlRow, InlineError, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { LoadLine, Tabs } from "./userParts";
import { formatPrice, megabytes, periodActive, streamQuality } from "./userPrefs";

type Limits = { message_length: number; attachments: number; video_resolution: number[]; video_framerate: number };
type Plans = {
  available: boolean;
  checkout_available?: boolean;
  provider?: string;
  portal_available?: boolean;
  test_mode: boolean;
  currency: string;
  plus_price: number;
  supercharge_price: number;
  free: Limits;
  plus: Limits;
};
type PlusSource = { type: "Purchase" } | { type: "Gift"; from: string; note?: string | null } | { type: "Grant" };
type Plus = { current_period_end: string; cancel_at_period_end: boolean; source: PlusSource; status?: string; provider_managed?: boolean };
type Wing = { _id: string; server_id?: string | null; source: "Plus" | "Purchase"; current_period_end?: string | null; cancel_at_period_end: boolean };
type Overview = { plus?: Plus | null; hide_badge: boolean; supercharges: Wing[] };

/**
 * Zrzur Feather (web: PlusPage + Subscriptions), read-only on the phone:
 * no purchase, gift or Wings placement flow (store billing rules). Shown only
 * where the server offers billing; the list hides the entry otherwise.
 */
export function FeatherPage({ tab: initial }: { tab: "feather" | "subscriptions" }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [tab, setTab] = useState(initial);
  const [plans, setPlans] = useState<Plans>();
  const [overview, setOverview] = useState<Overview>();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([client.api.get("/billing/plans" as never) as Promise<Plans>, client.api.get("/billing/@me" as never) as Promise<Overview>])
      .then(([p, o]) => {
        if (!live) return;
        if (!p?.available) {
          // no billing on this server: nothing to show (web hides the page);
          // opened straight from a link there is no page to go back to
          if (router.canGoBack()) router.back();
          else router.replace("/settings");
          return;
        }
        setPlans(p);
        setOverview(o);
        setNow(Date.now());
        setState("ready");
      })
      .catch((err) => {
        if (!live) return;
        setLoadError(describeError(err));
        setState("error");
      });
    return () => {
      live = false;
    };
  }, [client, tick]);

  const plus = overview?.plus ?? undefined;
  const active = !!plus && periodActive(plus.current_period_end, now);
  const date = (iso: string | null | undefined) => (iso ? longDate(new Date(iso), i18n.locale) : "");
  const price = (minor: number) => formatPrice(minor, plans?.currency ?? "USD", i18n.locale);
  const giverName = (() => {
    if (plus?.source.type !== "Gift") return t`a friend`;
    const giver = client.users.get(plus.source.from);
    return giver?.displayName ?? giver?.username ?? t`a friend`;
  })();

  async function editPlus(body: { hide_badge?: boolean; cancel_at_period_end?: boolean }) {
    setPending(true);
    setError(undefined);
    try {
      setOverview((await client.api.patch("/billing/plus" as never, body as never)) as Overview);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  async function portal() {
    setPending(true);
    setError(undefined);
    try {
      const { url } = (await client.api.post("/billing/portal" as never)) as { url: string };
      // only the payment provider's own pages (web: PROVIDER_HOSTS)
      const host = new URL(url).host;
      if (!["billing.stripe.com", "www.paypal.com", "www.sandbox.paypal.com"].includes(host)) throw new Error("UnknownHost");
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  const notice = plans && (plans.test_mode || plans.checkout_available === false) ? (
    <View accessibilityRole="text" style={{ flexDirection: "row", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.field }}>
      <Icon name="info" size={16} color={palette.link} />
      <AText size={13} line={18} color={palette.fg2} style={{ flex: 1 }}>
        {plans.checkout_available === false
          ? t`Purchases aren't open yet. You can look around, but nothing can be bought or charged right now.`
          : plans.provider && plans.provider !== "test"
            ? t`Test mode: payments run in the payment provider's test environment. Use its test cards; no real money is charged.`
            : t`Test mode: purchases are simulated and nothing is charged. No card details are asked for or stored.`}
      </AText>
    </View>
  ) : null;

  const featherTab = plans ? (
    <>
      <View style={{ borderRadius: 14, backgroundColor: palette.field, padding: 16, gap: 8 }}>
        <Icon name="seal" size={32} color={palette.accentText} />
        <AText size={22} line={30} weight="bold" color={palette.header}>
          {t`Zrzur Feather`}
        </AText>
        <AText size={16} line={22} weight="semibold" color={palette.accentText}>
          {t`For the people who keep Zrzur flying.`}
        </AText>
        <AText size={14} line={22} color={palette.fg2}>
          {t`Everything you need to talk is free, and stays free. Feather gives you bigger files, sharper streams and longer messages, and pays for the servers everyone else uses too.`}
        </AText>
        {active && plus ? (
          <View style={{ gap: 8, paddingTop: 4 }}>
            <AText size={16} line={22} weight="semibold" color={palette.fg}>
              {t`You have Zrzur Feather`}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {plus.source.type === "Gift"
                ? t`Gifted Feather, ends on ${date(plus.current_period_end)}`
                : plus.cancel_at_period_end
                  ? t`Cancelled, ends on ${date(plus.current_period_end)}`
                  : t`Renews on ${date(plus.current_period_end)}`}
            </AText>
            <View style={{ flexDirection: "row" }}>
              <SmallButton primary label={t`Manage subscription`} onPress={() => setTab("subscriptions")} testID="feather-manage" />
            </View>
          </View>
        ) : (
          <View style={{ gap: 2, paddingTop: 4 }}>
            <AText size={20} line={26} weight="bold" color={palette.fg}>
              {price(plans.plus_price)}
              <AText size={14} line={20} color={palette.muted}>
                {t`/month`}
              </AText>
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {t`Cancel any time`}
            </AText>
          </View>
        )}
      </View>
      <View accessibilityRole="list" style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
        {[
          { label: t`Perk`, free: t`Free`, feather: t`Feather`, head: true },
          { label: t`Message length`, free: String(plans.free.message_length), feather: String(plans.plus.message_length) },
          { label: t`Uploads`, free: megabytes(plans.free.attachments), feather: megabytes(plans.plus.attachments) },
          { label: t`Screen share`, free: streamQuality(plans.free), feather: streamQuality(plans.plus) },
        ].map((row, i) => (
          <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
            <AText size={14} line={20} weight={row.head ? "semibold" : "medium"} color={row.head ? palette.muted : palette.fg} style={{ flex: 2 }}>
              {row.label}
            </AText>
            <AText size={14} line={20} weight={row.head ? "semibold" : "regular"} color={palette.muted} style={{ flex: 1, writingDirection: "ltr" }}>
              {row.free}
            </AText>
            <AText size={14} line={20} weight="semibold" color={row.head ? palette.muted : palette.accentText} style={{ flex: 1, writingDirection: "ltr" }}>
              {row.feather}
            </AText>
          </View>
        ))}
      </View>
    </>
  ) : null;

  const subscriptionsTab = plans && overview ? (
    <>
      <SettingsSection title={t`Zrzur Feather`}>
        <RowGroup>
          {active && plus ? (
            <>
              <ControlRow
                first
                icon="seal"
                title={t`Zrzur Feather`}
                description={
                  plus.source.type === "Gift"
                    ? t`Gift from ${giverName}. Ends on ${date(plus.current_period_end)}, nothing renews.`
                    : plus.source.type === "Grant"
                      ? t`Given by Zrzur. Ends on ${date(plus.current_period_end)}, nothing renews.`
                      : plus.status === "PastDue" || plus.status === "Incomplete"
                        ? t`Your last payment didn't go through. Update your payment method; Feather continues until ${date(plus.current_period_end)} while the payment is retried.`
                        : plus.cancel_at_period_end
                          ? t`Cancelled. You keep Feather until ${date(plus.current_period_end)}.`
                          : t`${price(plans.plus_price)} a month. Renews on ${date(plus.current_period_end)}.`
                }
                control={
                  plus.source.type === "Purchase" && !plus.provider_managed ? (
                    plus.cancel_at_period_end ? (
                      <SmallButton primary label={t`Keep Feather`} disabled={pending} onPress={() => void editPlus({ cancel_at_period_end: false })} testID="feather-keep" />
                    ) : (
                      <SmallButton label={t`Cancel Feather`} disabled={pending} onPress={() => void editPlus({ cancel_at_period_end: true })} testID="feather-cancel" />
                    )
                  ) : null
                }
              />
              {plus.source.type === "Gift" && plus.source.note ? <ControlRow icon="gift" title={t`Note from ${giverName}`} description={`“${plus.source.note}”`} control={null} /> : null}
              <ControlRow
                icon="eye-slash"
                title={t`Show Feather badge`}
                description={t`The Feather badge next to your name on your profile.`}
                control={<Toggle label={t`Show Feather badge`} value={!overview.hide_badge} disabled={pending} onChange={(show) => void editPlus({ hide_badge: !show })} testID="feather-badge" />}
              />
            </>
          ) : (
            <ControlRow
              first
              icon="seal"
              title={t`You don't have Feather`}
              description={t`Bigger uploads, longer messages, sharper streams and a free Wing, for ${price(plans.plus_price)} a month.`}
              control={<SmallButton label={t`See Feather`} onPress={() => setTab("feather")} testID="feather-see" />}
            />
          )}
        </RowGroup>
      </SettingsSection>
      {/* the provider's billing page is not offered inside the iOS app (store rules) */}
      {plans.portal_available && Platform.OS !== "ios" ? (
        <SettingsSection title={t`Payment`}>
          <RowGroup>
            <ControlRow
              first
              icon="currency-circle-dollar"
              title={t`Payment methods and invoices`}
              description={t`Change your card, download invoices and see past payments on our payment partner's secure page.`}
              control={<SmallButton label={t`Manage`} disabled={pending} onPress={() => void portal()} testID="feather-portal" />}
            />
          </RowGroup>
        </SettingsSection>
      ) : null}
      <SettingsSection title={t`Wings`} description={t`Each Wing counts towards a server's level. Move them any time; they leave a server with you.`}>
        <RowGroup>
          {overview.supercharges.length === 0 ? (
            <ControlRow first icon="lightning" title={t`No Wings yet`} description={t`Open a server's menu and choose Give Wings. Each one is ${price(plans.supercharge_price)} a month.`} control={null} />
          ) : (
            overview.supercharges.map((wing, i) => {
              const server = wing.server_id ? client.servers.get(wing.server_id) : undefined;
              return (
                <View key={wing._id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                  {server ? <Avatar url={server.iconURL} name={server.name} size={28} square /> : <Icon name="lightning" size={20} color={palette.iconNeutral} />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                      {server ? server.name : t`Not on a server yet`}
                    </AText>
                    <AText size={13} line={18} color={palette.muted}>
                      {wing.source === "Plus"
                        ? t`Included with Feather`
                        : wing.cancel_at_period_end
                          ? t`Cancelled, ends on ${date(wing.current_period_end)}`
                          : t`${price(plans.supercharge_price)} a month. Renews on ${date(wing.current_period_end)}.`}
                    </AText>
                  </View>
                </View>
              );
            })
          )}
        </RowGroup>
        <View style={{ flexDirection: "row" }}>
          <Button variant="tonal" size="sm" label={t`Refresh`} onPress={() => setTick((n) => n + 1)} />
        </View>
      </SettingsSection>
    </>
  ) : null;

  return (
    <SettingsPage title={t`Zrzur Feather`} testID="user-feather">
      <Tabs
        label={t`Zrzur Feather`}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "feather", title: t`Feather` },
          { id: "subscriptions", title: t`Your subscriptions` },
        ]}
      />
      <LoadLine state={state} error={loadError} onRetry={() => { setState("loading"); setTick((n) => n + 1); }} />
      {notice}
      <InlineError message={error} />
      {tab === "feather" ? featherTab : subscriptionsTab}
    </SettingsPage>
  );
}
