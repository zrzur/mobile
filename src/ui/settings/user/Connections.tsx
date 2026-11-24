import { useLingui } from "@lingui/react/macro";
import type { Client } from "@zrzur/sdk/solid";
import * as WebBrowser from "expo-web-browser";
import { type ReactNode, useCallback, useState } from "react";
import { View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";

import { SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import {
  type Connection,
  type LinkedAccount,
  type LinkedAccounts,
  type ServiceId,
  LINKED_CONSENT_VERSION,
  MAX_SHOWN_REPOS,
  PRIVACY_URL,
  RETURN_ORIGIN,
  SERVICES,
  SERVICE_NAMES,
  daysLeft,
  needsConsent,
  returnUrl,
  serviceReturnFields,
  steamReturnFields,
  toggleGame,
  toggleRepo,
} from "./connections-logic";
import { CheckRow, LoadError, Loading, Note, OutlinedButton, Pill, useLoad } from "./profile-parts";
import { openExternal } from "@/ui/kit/openLink";

const ICONS: Record<ServiceId, IconName> = { steam: "game-controller", twitch: "video-camera", github: "code", battlenet: "identification-badge" };

const base = (service: ServiceId) => `/users/@me/connections/${service}`;

/**
 * Open the service's sign-in page in the system's sign-in browser and finish
 * the link when it comes back to the return address. Resolves `false` when
 * the person closed the browser.
 */
async function signIn(client: Client, service: ServiceId): Promise<boolean> {
  const { url } = await client.api.raw<{ url: string }>("post", `${base(service)}/start`, { origin: RETURN_ORIGIN });
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl(service));
  if (result.type !== "success" || !result.url) return false;
  if (service === "steam") {
    const { state, params } = steamReturnFields(result.url);
    await client.api.raw("post", `${base(service)}/finish`, { state, params });
  } else {
    const { state, code, denied } = serviceReturnFields(result.url);
    if (denied || !code) return false;
    await client.api.raw("post", `${base(service)}/finish`, { state, code });
  }
  return true;
}

/** Connections (web settings › Connections): Steam, Twitch, GitHub, Battle.net */
export function ConnectionsPage() {
  const { t } = useLingui();
  const client = useClient();
  const fetchData = useCallback(async () => {
    const accounts = await client.api.raw<LinkedAccounts>("get", "/users/@me/connections");
    return { accounts, now: Date.now() };
  }, [client]);
  const loaded = useLoad(fetchData);
  const data = loaded.data?.accounts ?? null;
  const now = loaded.data?.now ?? 0;
  const error = loaded.data ? null : loaded.error;
  const load = loaded.reload;

  return (
    <SettingsPage title={t`Connections`} testID="settings-connections">
      {error ? (
        <LoadError title={t`We could not load your connections.`} error={error} onRetry={() => void load()} testID="connections-error" />
      ) : !data ? (
        <Loading testID="connections-loading" />
      ) : (
        <>
          <Note>{t`Show accounts you have on other services on your profile. You choose what shows, and you can hide or disconnect them at any time.`}</Note>
          {SERVICES.map((service) => {
            const connection: Connection = data[service] ?? { available: false };
            return connection.account ? (
              <LinkedCard key={service} service={service} account={connection.account} now={now} onChanged={load} />
            ) : (
              <ConnectCard key={service} service={service} available={connection.available} onLinked={load} />
            );
          })}
          <View style={{ gap: 8 }}>
            <Note>{t`From Steam. Steam is a trademark of Valve Corporation; Zrzur is not affiliated with Valve. Game pictures, achievement names and icons belong to their owners.`}</Note>
            <Note>{t`Twitch, GitHub and Battle.net are trademarks of their owners. Zrzur is not affiliated with them or endorsed by them.`}</Note>
          </View>
        </>
      )}
    </SettingsPage>
  );
}

/** A bold lead ("We will copy:") then its text */
function Para({ lead, children }: { lead?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <AText size={14} line={20} color={palette.fg2}>
      {lead ? (
        <AText size={14} line={20} weight="semibold" color={palette.fg}>
          {lead}{" "}
        </AText>
      ) : null}
      {children}
    </AText>
  );
}

/** The consent paragraphs every service shows before linking (and on re-consent) */
function ConsentText({ service, intro }: { service: ServiceId; intro: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const name = SERVICE_NAMES[service];
  const usTransfer = t`${name} is a US company: what we send it and read from it goes to the United States, where your data may be less protected than in the EU (for example, US authorities may be able to access it).`;
  const mayReveal = t`What you play or post there can say something about your beliefs, health or sexuality.`;
  const copy: Record<ServiceId, string> = {
    steam: t`your Steam name and link, your game count, hours played, your 10 most played games with their achievement counts, and up to 60 of your latest achievements in those games with their name, description and the day you unlocked them (no time of day). We take this from what Steam shows publicly and keep it in the EU. Game pictures and achievement icons come from Steam and load through Zrzur's servers, so Steam does not see who views your profile.`,
    twitch: t`your Twitch name, picture, bio and channel link, whether you are a partner or affiliate, the category of your last stream, and whether you are live now with the stream title, and keep them in the EU.`,
    github: t`your GitHub username, name, picture, bio and link, your follower and repository counts, and up to 12 of your most starred own public repositories with their description, language and stars, and keep them in the EU.`,
    battlenet: t`your BattleTag, and nothing else, and keep it in the EU.`,
  };
  const updates: Record<ServiceId, string> = {
    steam: t`we copy it again only when you press Refresh. Private on Steam means nothing shows here. You can hide or disconnect at any time in Settings; disconnecting deletes this copy.`,
    twitch: t`We give Twitch your channel id so it tells us when you go live or offline; people who can see your profile then see that you are live. We read your name again once a day and keep nothing from Twitch older than 24 hours. We keep no Twitch sign-in.`,
    github: t`we read your repositories again only when you press Refresh. We keep no GitHub sign-in.`,
    battlenet: t`Battle.net lets us keep it for 30 days. Confirm on Battle.net before then to keep it; otherwise we delete it. We keep no Battle.net sign-in.`,
  };
  const steam = service === "steam";
  return (
    <View style={{ gap: 8 }}>
      {intro ? <Para>{steam ? t`You will sign in on Steam's own page. Zrzur never sees that password.` : t`You will sign in on ${name}'s own page. Zrzur never sees that password.`}</Para> : null}
      <Para lead={t`We will copy:`}>{copy[service]}</Para>
      {intro ? (
        <Para lead={t`Who sees it:`}>
          {steam
            ? t`anyone who can open your Zrzur profile. If you are under 18, or we do not know your age, only your friends. You see a preview first and can hide any game; a hidden game and its achievements show nowhere.`
            : t`nobody until you switch it on. Then anyone who can open your Zrzur profile. If you are under 18, or we do not know your age, only your friends.`}
        </Para>
      ) : null}
      <Para lead={t`Updates:`}>{steam ? updates.steam : `${updates[service]} ${t`Disconnecting deletes everything we copied.`}`}</Para>
      {steam ? (
        <Para lead={t`Keep in mind:`}>{`${t`this ties your Steam account to your Zrzur account. The unlock days show when you played.`} ${usTransfer} ${mayReveal}`}</Para>
      ) : (
        <Para lead={t`Keep in mind:`}>
          {`${t`This ties your ${name} account to your Zrzur account.`} ${service !== "github" ? `${usTransfer} ` : ""}${mayReveal} `}
          <AText size={14} line={20} weight="semibold" color={palette.dark ? palette.link : palette.fg} style={{ textDecorationLine: "underline" }} accessibilityRole="link" onPress={() => void openExternal(PRIVACY_URL)}>
            {t`Privacy Policy: linked accounts`}
          </AText>
        </Para>
      )}
    </View>
  );
}

/** The box people tick before linking */
function ConsentBox({ service, agreed, onChange }: { service: ServiceId; agreed: boolean; onChange: (on: boolean) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const name = SERVICE_NAMES[service];
  const label = t`I agree that Zrzur copies this and shows it on my profile, including anything it may reveal about me, and exchanges this data with ${name} in the United States.`;
  return (
    <View style={{ borderRadius: 12, backgroundColor: palette.frame, overflow: "hidden" }}>
      <CheckRow first checked={agreed} onChange={onChange} label={label} testID={`consent-${service}`}>
        <AText size={14} line={20} color={palette.fg}>
          {label}
        </AText>
      </CheckRow>
    </View>
  );
}

function Panel({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12, borderTopWidth: 1, borderTopColor: palette.divider }}>{children}</View>;
}

function Actions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>{children}</View>;
}

function ErrorLine({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}>
        <Icon name="warning-circle" size={16} color={palette.danger} />
      </View>
      <AText size={13} line={18} color={palette.danger} style={{ flex: 1 }}>
        {children}
      </AText>
    </View>
  );
}

/** Not linked yet: what linking does, then the consent panel */
function ConnectCard({ service, available, onLinked }: { service: ServiceId; available: boolean; onLinked: () => Promise<void> }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = SERVICE_NAMES[service];
  const steam = service === "steam";
  const connect = steam ? t`Connect Steam` : t`Connect ${name}`;
  const pitch: Record<ServiceId, string> = {
    steam: t`Show your Steam name, games and achievements on your profile. You sign in on Steam's own page. We never see your Steam password.`,
    twitch: t`Show your Twitch channel on your profile, and when you are live. You sign in on Twitch's own page.`,
    github: t`Show your GitHub account and your best public repositories on your profile. You sign in on GitHub's own page.`,
    battlenet: t`Show your BattleTag on your profile so friends can add you. You sign in on Battle.net's own page.`,
  };
  const description = available ? pitch[service] : steam ? t`Steam can't be linked on this server yet.` : t`${name} can't be linked on this server yet.`;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const linked = await signIn(client, service);
      if (linked) {
        setOpen(false);
        setAgreed(false);
      }
      await onLinked();
    } catch (err) {
      const reason = describeError(err);
      setError(`${steam ? t`Steam could not be opened.` : t`${name} could not be opened.`} ${reason}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title={name}>
      <View testID={`connect-card-${service}`} style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Icon name={ICONS[service]} size={20} color={palette.iconNeutral} />
          <View style={{ flex: 1, gap: 2 }}>
            <AText size={14} line={20} weight="semibold" color={palette.fg}>
              {connect}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {description}
            </AText>
          </View>
        </View>
        {available && !open ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", justifyContent: "flex-end" }}>
            <SmallButton primary label={connect} onPress={() => setOpen(true)} testID={`connect-${service}`} />
          </View>
        ) : null}
        {open ? (
          <Panel>
            <AText size={15} line={22} weight="semibold" color={palette.header} accessibilityRole="header">
              {connect}
            </AText>
            <ConsentText service={service} intro />
            <ConsentBox service={service} agreed={agreed} onChange={setAgreed} />
            {error ? <ErrorLine>{error}</ErrorLine> : null}
            <Actions>
              <OutlinedButton
                label={t`Not now`}
                onPress={() => {
                  setOpen(false);
                  setAgreed(false);
                  setError(null);
                }}
              />
              <SmallButton primary label={steam ? t`Continue to Steam` : t`Continue to ${name}`} onPress={() => void go()} disabled={!agreed || busy} testID={`continue-${service}`} />
            </Actions>
          </Panel>
        ) : null}
      </View>
    </SettingsSection>
  );
}

/** Linked: on/off for the profile, what shows, refresh and disconnect */
function LinkedCard({ service, account, now, onChanged }: { service: ServiceId; account: LinkedAccount; now: number; onChanged: () => Promise<void> }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [consentOpen, setConsentOpen] = useState(needsConsent(account));
  const name = SERVICE_NAMES[service];
  const steam = service === "steam";

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      const reason = describeError(err);
      setError(`${t`That did not work.`} ${reason}`);
    } finally {
      setBusy(false);
    }
  };
  const edit = (change: Record<string, unknown>) => run(() => client.api.raw("patch", base(service), change));

  const title = account.display_name || (steam ? t`Steam account` : name);
  let description: ReactNode = null;
  if (steam) {
    if (account.private) description = t`This Steam account or its game details are private. Make them public on Steam, then press Refresh.`;
    else {
      const games = account.game_count ?? 0;
      const hours = account.total_hours ?? 0;
      description = `${t`${games} games`} · ${t`${hours} hours played`}`;
    }
  } else if (service === "twitch") {
    description = !account.display_name ? t`Waiting for Twitch: the name shows again once Twitch answers.` : account.live ? null : t`Not live right now.`;
  } else if (service === "github") {
    const n = account.repos?.length ?? 0;
    description = t`${n} public repositories`;
  } else if (service === "battlenet" && account.expires_at) {
    const days = daysLeft(account.expires_at, now);
    description = t`Confirm within ${days} days`;
  }

  const hidden = account.hidden_titles ?? [];
  const shownRepos = account.shown_repos ?? [];
  const canRefresh = !busy && now >= account.refresh_after && !needsConsent(account);
  const reconsent: Record<ServiceId, string> = {
    steam: t`We have updated what you agree to when you link Steam: it now covers game pictures and up to 60 of your latest achievements with the day you unlocked them (no time of day), and it names where your data goes. Until you agree, Refresh stays off and nothing new shows.`,
    twitch: t`We have updated what you agree to when you link Twitch: it now names where your data goes. Until you agree, your channel does not show on your profile and we exchange no data with Twitch about it.`,
    github: t`We have updated what you agree to when you link GitHub: it now names where your data goes. Until you agree, your GitHub account does not show on your profile and Refresh stays off.`,
    battlenet: t`We have updated what you agree to when you link Battle.net: it now names where your data goes. You agree to it the next time you confirm on Battle.net.`,
  };
  const footer: Record<ServiceId, string> = {
    steam: t`Disconnecting deletes everything Zrzur copied from Steam at once.`,
    battlenet: t`BattleTag from Battle.net. Disconnecting deletes it at once.`,
    github: t`Only public repositories. Refresh reads GitHub again; it never runs by itself.`,
    twitch: t`Live status updates by itself. Disconnecting deletes everything Zrzur copied from Twitch at once.`,
  };
  const reconnect = () => run(() => signIn(client, service));

  return (
    <SettingsSection title={name} aside={<Pill label={account.shown ? t`On your profile` : t`Not on your profile`} tone={account.shown ? "success" : "neutral"} />}>
      <View testID={`linked-card-${service}`} style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Icon name={ICONS[service]} size={20} color={palette.iconNeutral} />
          <View style={{ flex: 1, gap: 4 }}>
            <AText size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
              {title}
            </AText>
            {service === "twitch" && account.display_name && account.live ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <Pill label={t`Live now`} tone="accent" />
                {account.live_title ? (
                  <AText size={13} line={18} color={palette.muted} style={{ flexShrink: 1 }}>
                    {account.live_title}
                  </AText>
                ) : null}
              </View>
            ) : description ? (
              <AText size={13} line={18} color={service === "battlenet" ? palette.danger : palette.muted}>
                {description}
              </AText>
            ) : null}
          </View>
          <Toggle label={t`Show on my profile`} value={account.shown} disabled={busy} onChange={(shown) => void edit({ shown })} testID={`show-${service}`} />
        </View>

        {consentOpen && needsConsent(account) ? (
          <Panel>
            <AText size={15} line={22} weight="semibold" color={palette.header} accessibilityRole="header">
              {t`Updated consent for ${name}`}
            </AText>
            <Para>{reconsent[service]}</Para>
            {service !== "battlenet" ? (
              <>
                <ConsentText service={service} intro={false} />
                <ConsentBox service={service} agreed={agreed} onChange={setAgreed} />
              </>
            ) : null}
            <Actions>
              <OutlinedButton label={steam ? t`Keep it as it is` : t`Not now`} onPress={() => setConsentOpen(false)} />
              {service === "battlenet" ? (
                <SmallButton primary label={t`Continue to ${name}`} onPress={() => void reconnect()} disabled={busy} />
              ) : (
                <SmallButton primary label={t`Save`} onPress={() => void edit({ consent: LINKED_CONSENT_VERSION })} disabled={!agreed || busy} testID={`consent-save-${service}`} />
              )}
            </Actions>
          </Panel>
        ) : null}

        {!account.shown ? (
          <Panel>
            <Note>{steam ? t`This is a preview. Nothing shows on your profile until you switch it on. Untick any game you want to keep to yourself; its pictures and achievements are hidden with it.` : t`This is a preview. Nothing shows on your profile until you switch it on.`}</Note>
          </Panel>
        ) : null}

        {steam && !account.private && account.games?.length ? (
          <View accessibilityLabel={t`Most played games`} style={{ borderTopWidth: 1, borderTopColor: palette.divider }}>
            {account.games.map((game, i) => {
              const h = game.hours;
              const unlocked = game.achievements_unlocked ?? 0;
              const total = game.achievements_total ?? 0;
              const facts = total ? `${t`${h} h`} · ${t`${unlocked} of ${total} achievements`}` : t`${h} h`;
              return (
                <CheckRow
                  key={game.appid}
                  first={i === 0}
                  checked={!hidden.includes(game.appid)}
                  disabled={busy}
                  label={game.name}
                  onChange={(on) => void edit({ hidden_titles: toggleGame(hidden, game.appid, on) })}
                >
                  <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                    {game.name}
                  </AText>
                  <AText size={13} line={18} color={palette.muted}>
                    {facts}
                  </AText>
                </CheckRow>
              );
            })}
          </View>
        ) : null}

        {service === "github" && account.repos?.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: palette.divider }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Note>{t`Repositories to show (up to ${MAX_SHOWN_REPOS})`}</Note>
            </View>
            {account.repos.map((repo, i) => {
              const n = repo.stars;
              const on = shownRepos.includes(repo.id);
              return (
                <CheckRow
                  key={repo.id}
                  first={i === 0}
                  checked={on}
                  disabled={busy || (!on && shownRepos.length >= MAX_SHOWN_REPOS)}
                  label={repo.name}
                  onChange={(next) => void edit({ shown_repos: toggleRepo(shownRepos, repo.id, next) })}
                >
                  <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1}>
                    {repo.name}
                  </AText>
                  {repo.description ? (
                    <AText autoDir size={13} line={18} color={palette.fg2} numberOfLines={2}>
                      {repo.description}
                    </AText>
                  ) : null}
                  <AText size={13} line={18} color={palette.muted}>
                    {[repo.language, t`${n} stars`].filter(Boolean).join(" · ")}
                  </AText>
                </CheckRow>
              );
            })}
          </View>
        ) : null}

        <Panel>
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <Note>{footer[service]}</Note>
          <Actions>
            {steam || service === "github" ? (
              <OutlinedButton
                label={t`Refresh`}
                disabled={!canRefresh && !(steam && needsConsent(account))}
                busy={busy}
                onPress={() => {
                  if (needsConsent(account)) return setConsentOpen(true);
                  void run(() => client.api.raw("post", `${base(service)}/refresh`));
                }}
                testID={`refresh-${service}`}
              />
            ) : null}
            {service === "battlenet" ? <OutlinedButton label={t`Confirm on Battle.net`} disabled={busy} onPress={() => void reconnect()} testID="confirm-battlenet" /> : null}
            <OutlinedButton label={t`Disconnect`} danger disabled={busy} onPress={() => void run(() => client.api.raw("delete", base(service)))} testID={`disconnect-${service}`} />
          </Actions>
        </Panel>
      </View>
    </SettingsSection>
  );
}

