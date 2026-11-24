import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { longDate } from "@/chat/time";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { InlineError, SettingsSection, SmallButton, Toggle } from "../parts";
import { BugReportSheet } from "./Feedback";
import { useBadgeText } from "./profile-badge-text";
import { type BadgeMeta, type OwnBadge, badgeMeta, collectable, earnable, endReason, heldBadges, pastBadges } from "./profile-logic";
import { Pill, TextButton, useLoad } from "./profile-parts";

type MyBadges = {
  badges: OwnBadge[];
  creator: { standing?: string | null; can_submit: boolean; published: number; eligible: boolean; super_creator_designs: number };
  bugs: { verified: number; security_verified: number; elite_verified: number };
  beta?: { status: string; features: string[]; joined_at?: number | null; ended_at?: number | null; contributions: number } | null;
  plus: boolean;
  permissions: string[];
  privileged: boolean;
};

/** A badge mark: its two colours round a medal (the web's art lives in SVG) */
function BadgeMark({ meta, size, quiet }: { meta: BadgeMeta | undefined; size: number; quiet?: boolean }) {
  const { palette } = useTheme();
  const [a, b] = meta?.colours ?? [palette.tonal, palette.tonal];
  return (
    <View
      // badge-art: the badge's own two colours (artwork, not theme tokens)
      testID="badge-art"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: quiet ? palette.tonal : a,
        borderWidth: Math.max(2, Math.round(size / 14)),
        borderColor: quiet ? palette.borderStrong : b,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="medal" size={Math.round(size * 0.55)} color={quiet ? palette.muted : palette.onOverlay} />
    </View>
  );
}

/** One badge row: mark, name with pills, description and meta, control */
function BadgeRow({ meta, title, pills, description, control, first }: { meta?: BadgeMeta; title: string; pills: string[]; description: string; control?: React.ReactNode; first?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <BadgeMark meta={meta} size={32} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <AText size={14} line={20} weight="semibold" color={palette.fg}>
            {title}
          </AText>
          {pills.map((p) => (
            <Pill key={p} label={p} />
          ))}
        </View>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
      </View>
      {control}
    </View>
  );
}

/** Tab "Badges" (web MyBadges): your collection, programs, what to earn */
export function BadgesTab() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const text = useBadgeText();
  const bits = useSolid(useCallback(() => (client.ready() ? (client.user?.badges ?? 0) : 0), [client]));
  const fetchBadges = useCallback(async () => {
    const mine = await client.api.raw<MyBadges>("get", "/badges/@me");
    return { mine, now: Date.now() };
  }, [client]);
  const loaded = useLoad(fetchBadges);
  const data = loaded.data?.mine ?? null;
  const now = loaded.data?.now ?? 0;
  const loadError = loaded.error;
  const load = loaded.reload;
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadError && !data) {
    return (
      <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8, alignItems: "center" }}>
        <AText size={14} line={20} color={palette.fg} style={{ textAlign: "center" }}>
          {describeError(loadError)}
        </AText>
        <SmallButton label={t`Try again`} onPress={() => void load()} testID="badges-retry" />
      </View>
    );
  }
  if (!data) {
    return (
      <View accessibilityLabel={t`Loading…`} style={{ paddingVertical: 48, alignItems: "center" }}>
        <ActivityIndicator color={palette.muted} />
      </View>
    );
  }

  const date = (ms: number | null | undefined) => (ms ? longDate(new Date(ms), i18n.locale) : "");
  const tierLabel = (tier: number) => (tier === 2 ? t`Top tier` : tier === 1 ? t`Rare` : undefined);
  const held = heldBadges(data, bits, now);
  const total = collectable().length;
  const count = held.length;
  const past = pastBadges(data, now);
  const standing = data.creator.standing;
  const beta = data.beta ?? undefined;
  const standingLabel = standing ? ({ Active: t`Active creator`, Suspended: t`Suspended`, Revoked: t`Revoked` } as Record<string, string>)[standing] : undefined;
  const betaLabel = beta
    ? ({ Requested: t`Waiting for approval`, Invited: t`Invited`, Active: t`Active tester`, Removed: t`Not in the program`, Completed: t`Completed` } as Record<string, string>)[beta.status]
    : undefined;

  const pillsOf = (m: BadgeMeta) => [tierLabel(m.tier), m.retired ? t`Historical` : undefined].filter((p): p is string => !!p);

  const creatorText = (() => {
    if (!standing)
      return t`Creators make profile designs and decorations. The Zrzur team invites creators; making bots is separate and never needs this.`;
    const n = data.creator.published;
    const k = data.creator.super_creator_designs;
    const next = data.creator.eligible ? t`Super Creator is chosen by the team after at least ${k} published designs.` : t`Publish a design to get the Creator badge.`;
    return `${t`Published designs: ${n}`} · ${next}`;
  })();

  const betaText = (() => {
    if (beta?.status === "Active") {
      if (!beta.features.length) return t`No beta features are open to you right now.`;
      const list = beta.features.join(", ");
      return t`Beta features you can use: ${list}`;
    }
    if (beta) return t`The team will let you know when you are in.`;
    return t`The beta is closed: ask to join and the team may invite you.`;
  })();

  const verified = data.bugs.verified;
  const held_ = count;

  return (
    <View style={{ gap: 32 }} testID="badges-tab">
      <InlineError message={error} />

      <View style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 12 }}>
        <View style={{ gap: 2 }}>
          <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
            {t`Your collection`}
          </AText>
          <AText size={14} line={20} color={palette.muted}>
            {(() => {
              const held = held_;
              const collectable = total;
              return t`${held} of ${collectable} badges`;
            })()}
          </AText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t`Badges collected`}
          accessibilityValue={{ min: 0, max: total, now: count }}
          style={{ height: 8, borderRadius: 4, backgroundColor: palette.tonal, overflow: "hidden" }}
        >
          <View style={{ width: `${Math.min(100, (count / Math.max(1, total)) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: palette.accent }} />
        </View>
        {held.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {held.map((h) => (
              <View key={h.meta.id} style={{ width: 72, alignItems: "center", gap: 8 }}>
                <BadgeMark meta={h.meta} size={48} quiet={h.grant?.hidden} />
                <AText size={12} line={16} color={palette.fg2} numberOfLines={2} style={{ textAlign: "center" }}>
                  {text(h.meta.id).name}
                </AText>
              </View>
            ))}
          </View>
        ) : (
          <AText size={14} line={20} color={palette.muted}>
            {t`No badges yet. Each one below says how to earn it.`}
          </AText>
        )}
      </View>

      {held.length ? (
        <SettingsSection title={t`Your badges`} description={t`Turn a badge off to hide it from your profile.`}>
          <RowGroup>
            {held.map((h, i) => {
              const grant = h.grant;
              let meta = "";
              if (grant) {
                const earnedOn = date(grant.granted_at);
                meta = (() => {
                  const date = earnedOn;
                  return t`Earned ${date}`;
                })();
                if (grant.expires_at) {
                  const untilOn = date(grant.expires_at);
                  meta += ` · ${(() => {
                    const date = untilOn;
                    return t`Until ${date}`;
                  })()}`;
                }
              } else meta = t`Given automatically`;
              const desc = [text(h.meta.id).description, meta].filter(Boolean).join("\n");
              return (
                <BadgeRow
                  key={h.meta.id}
                  first={i === 0}
                  meta={h.meta}
                  title={text(h.meta.id).name}
                  pills={pillsOf(h.meta)}
                  description={desc}
                  control={
                    grant ? (
                      <Toggle
                        label={text(h.meta.id).name}
                        value={!grant.hidden}
                        disabled={busy}
                        onChange={() => void run(() => client.api.raw("patch", `/badges/@me/${h.meta.id}`, { hidden: !grant.hidden }))}
                        testID={`badge-toggle-${h.meta.id}`}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </RowGroup>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t`Programs`}>
        <RowGroup>
          <BadgeRow first meta={badgeMeta("creator")} title={t`Creator program`} pills={standingLabel ? [standingLabel] : []} description={creatorText} />
          <BadgeRow meta={badgeMeta("beta_tester")} title={t`Beta program`} pills={betaLabel ? [betaLabel] : []} description={betaText} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            {!beta ? <SmallButton label={t`Ask to join`} disabled={busy} onPress={() => void run(() => client.api.raw("post", "/beta/@me/request"))} testID="beta-request" /> : null}
            {beta?.status === "Invited" ? <SmallButton primary label={t`Accept invitation`} disabled={busy} onPress={() => void run(() => client.api.raw("post", "/beta/@me/accept"))} testID="beta-accept" /> : null}
            {beta?.status === "Active" ? <SmallButton label={t`Send feedback`} onPress={() => setReporting(true)} testID="beta-feedback" /> : null}
            {beta && ["Active", "Invited", "Requested"].includes(beta.status) ? (
              <TextButton label={t`Leave the beta`} disabled={busy} onPress={() => void run(() => client.api.raw("post", "/beta/@me/leave"))} testID="beta-leave" />
            ) : null}
          </View>
          <BadgeRow
            meta={badgeMeta("bug_hunter")}
            title={t`Bug reports`}
            pills={[t`Verified: ${verified}`]}
            description={t`Bug Hunter comes with your first verified report. Security reports stay private and never appear on your profile.`}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 12 }}>
            <SmallButton label={t`Report a bug`} onPress={() => setReporting(true)} testID="report-bug" />
          </View>
        </RowGroup>
      </SettingsSection>

      <View style={{ gap: 12 }}>
        <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
          {t`Badges you can earn`}
        </AText>
        <View style={{ gap: 8 }}>
          {earnable(held).map((b) => (
            <View key={b.id} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
              <BadgeMark meta={b} size={40} quiet />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <AText size={15} line={20} weight="semibold" color={palette.fg}>
                    {text(b.id).name}
                  </AText>
                  {tierLabel(b.tier) ? <Pill label={tierLabel(b.tier) as string} /> : null}
                </View>
                <AText size={13} line={18} color={palette.muted}>
                  {text(b.id).earn}
                </AText>
              </View>
            </View>
          ))}
        </View>
      </View>

      {past.length ? (
        <SettingsSection title={t`Past badges`}>
          <RowGroup>
            {past.map((g, i) => {
              const granted = date(g.granted_at);
              const ended = date(g.revoked_at ?? g.expires_at ?? undefined);
              const reason = endReason(g);
              return (
                <BadgeRow
                  key={`${g.badge}-${g.granted_at}`}
                  first={i === 0}
                  meta={badgeMeta(g.badge)}
                  title={text(g.badge).name}
                  pills={[]}
                  description={t`${granted} – ${ended}`}
                  control={<Pill label={reason === "expired" ? t`Expired` : reason === "ineligible" ? t`No longer eligible` : t`Removed`} />}
                />
              );
            })}
          </RowGroup>
        </SettingsSection>
      ) : null}

      {reporting ? <BugReportSheet onClose={() => setReporting(false)} beta={beta?.status === "Active" ? beta.features : []} /> : null}
    </View>
  );
}

