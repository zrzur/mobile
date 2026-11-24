import { Trans, useLingui } from "@lingui/react/macro";
import type { MFA, MFATicket, User } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { checkBirth } from "@/auth/age";
import { useAuth } from "@/auth/AuthProvider";
import { describeError } from "@/auth/errorText";
import { forgetMediaPlayers, setAlwaysLoadMediaPlayers, usePlayerConsent } from "@/chat/rich/playerConsent";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { BirthMonthField } from "@/ui/auth/BirthMonthField";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";

import {
  MASKED_EMAIL,
  birthMonthValue,
  directMessagesFriendsOnly,
  hasOldTag,
  isEmail,
  otpauthUri,
  parseBirthMonth,
  stripSpaces,
  userHandle,
  userTag,
  usernameProblem,
} from "../accountLogic";
import { DialogSheet, useMfaTicket } from "../MfaFlow";
import { InlineError, SettingsPage, SettingsSection, Toggle } from "../parts";
import { PickerSheet } from "../server/controls";
import { setLocalPrefs, useLocalPrefs } from "./localPrefs";
import { OutlinedButton } from "./profile-parts";
import { copyToClipboard } from "@/ui/kit/share";

type AgeBand = "unknown" | "under_minimum" | "teen" | "adult_declared";
type AgeInfo = { birth_month?: string | null; band: AgeBand; can_raise?: boolean } | null;
type DmPrivacy = "Everyone" | "Mutual" | "Friends";
type GroupPrivacy = "Everyone" | "Friends" | "Nobody";
type Privacy = { direct_messages: DmPrivacy; group_invites: GroupPrivacy };
type ChangeRequest = {
  _id: string;
  reason: string;
  changes: { display_name?: string; pronouns?: string; status_text?: string; bio?: string; remove?: string[] };
  expires_at: number;
};
type MfaState = { mfa: MFA; totp: boolean; recovery: boolean };
type RequestTicket = ReturnType<typeof useMfaTicket>["request"];

const PRIVACY_DEFAULTS: Privacy = { direct_messages: "Mutual", group_invites: "Friends" };

/** Loose API calls for routes the typed client doesn't list */
type LooseApi = {
  get(path: string, params?: unknown): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
};

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

type ButtonKind = "tonal" | "primary" | "outlined" | "danger" | "text";

/**
 * The web's small row buttons: the kit Button (sm: a 36 px face in a 44 px
 * tap box); outlined has no kit variant and uses the shared OutlinedButton.
 */
function RowButton({
  label,
  onPress,
  kind = "tonal",
  disabled,
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
  accessibilityLabel?: string;
}) {
  if (kind === "outlined") return <OutlinedButton label={label} onPress={onPress} icon={icon} disabled={disabled} testID={testID} accessibilityLabel={accessibilityLabel} />;
  return <Button label={label} onPress={onPress} variant={kind === "text" ? "ghost" : kind} size="sm" icon={icon} disabled={disabled} testID={testID} accessibilityLabel={accessibilityLabel} />;
}

/**
 * A settings row (web settings row: 52 px, 12/16 padding, 20 px icon in a
 * 24 slot, 14/500 title, 13/18 muted description); the controls move under
 * the text when space runs out.
 */
function AccountRow({
  icon,
  title,
  pill,
  description,
  controls,
  first,
  danger,
  onPress,
  below,
  testID,
}: {
  icon: IconName;
  title: string;
  pill?: ReactNode;
  description?: ReactNode;
  controls?: ReactNode;
  first?: boolean;
  danger?: boolean;
  onPress?: () => void;
  below?: ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const body = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", flexGrow: 1, flexShrink: 1, flexBasis: 180 }}>
        <View style={{ width: 24, alignItems: "center" }}>
          <Icon name={icon} size={20} color={danger ? palette.danger : palette.iconNeutral} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
            <AText size={14} line={20} weight="semibold" color={danger ? palette.danger : palette.fg}>
              {title}
            </AText>
            {pill}
          </View>
          {description ? (
            typeof description === "string" ? (
              <AText size={13} line={18} color={palette.muted}>
                {description}
              </AText>
            ) : (
              description
            )
          ) : null}
        </View>
        {onPress ? <Icon name="caret-right" size={16} color={palette.iconMuted} /> : null}
      </View>
      {controls ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginStart: "auto" }}>{controls}</View> : null}
    </View>
  );
  const style = { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, minHeight: 52, justifyContent: "center" as const, gap: 12 };
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { backgroundColor: pressed ? palette.navSelected : "transparent" }]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={style}>
      {body}
      {below}
    </View>
  );
}

/** "Enabled" / "Not set up" / "Checking…" next to a Security row title (web: a dot and the word in a pill) */
function StatusPill({ state }: { state: "loading" | "on" | "off" }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const on = state === "on";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: palette.pill }}>
      {state === "loading" ? null : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: on ? palette.online : palette.fg2 }} />}
      <AText size={12} line={16} weight="semibold" color={on ? palette.onlineText : palette.fg2}>
        {state === "loading" ? t`Checking…` : on ? t`Enabled` : t`Not set up`}
      </AText>
    </View>
  );
}

/** A select under a row's text (web FloatingSelect on a phone) */
function SelectBox({ label, value, onPress, disabled, testID }: { label: string; value: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="combobox"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        borderRadius: 10,
        backgroundColor: palette.frame,
        borderWidth: 1,
        borderColor: palette.fieldBorder,
        paddingStart: 12,
        paddingEnd: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <AText size={15} line={20} color={palette.fg} style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </AText>
      <Icon name="caret-down" size={16} color={palette.muted} />
    </Pressable>
  );
}

/** Short note at the bottom (web snackbar / toast) */
function Toast({ text }: { text: string | null }) {
  const { palette } = useTheme();
  if (!text) return null;
  return (
    <View
      testID="account-toast"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={{
        position: "absolute",
        start: 16,
        end: 16,
        bottom: 16,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: palette.floating,
        borderWidth: 1,
        borderColor: palette.popoverBorder,
        shadowColor: palette.shadow,
        shadowOpacity: 0.45,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      }}
    >
      <AText size={14} line={20} weight="medium" color={palette.fg}>
        {text}
      </AText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

type Open = "username" | "email" | "password" | "totp" | "recovery" | null;

/** My account (web: user settings › My account, phone order) */
export function AccountPage() {
  const { t } = useLingui();
  const client = useClient();
  const { signOut } = useAuth();
  const { request, element: mfaElement } = useMfaTicket();
  const user = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));

  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // MFA status (GET /auth/mfa/), reloaded after each change
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [mfaError, setMfaError] = useState<string>();
  const [accountError, setAccountError] = useState<string>();
  const loadMfa = useCallback(async () => {
    try {
      const m = await client.account.mfa();
      setMfa({ mfa: m, totp: m.authenticatorEnabled, recovery: m.recoveryEnabled });
    } catch (err) {
      setMfaError(describeError(err));
    }
  }, [client]);
  useEffect(() => {
    let alive = true;
    client.account
      .mfa()
      .then((m) => alive && setMfa({ mfa: m, totp: m.authenticatorEnabled, recovery: m.recoveryEnabled }))
      .catch((err) => alive && setMfaError(describeError(err)));
    return () => {
      alive = false;
    };
  }, [client]);

  // authenticator setup and recovery codes, shown one at a time
  const [totp, setTotp] = useState<{ secret: string; mfa: MFA } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);

  const security = {
    async setUp() {
      if (!mfa) return;
      setMfaError(undefined);
      try {
        const ticket = await request({ mfa: mfa.mfa });
        if (!ticket) return say(t`MFA setup canceled.`);
        const secret = await ticket.generateAuthenticatorSecret();
        setTotp({ secret, mfa: mfa.mfa });
        setOpen("totp");
      } catch (err) {
        setMfaError(describeError(err));
      }
    },
    async withTicket(run: (ticket: MFATicket) => Promise<void>, afterSheet = false, setError = setMfaError) {
      setError(undefined);
      try {
        const ticket = await request({ mfa: mfa?.mfa, afterSheet });
        if (!ticket) return false;
        await run(ticket);
        return true;
      } catch (err) {
        setError(describeError(err));
        return false;
      }
    },
    async remove() {
      if (await security.withTicket((ticket) => ticket.disableAuthenticator())) void loadMfa();
    },
    async view() {
      await security.withTicket(async (ticket) => {
        setCodes(await ticket.fetchRecoveryCodes());
        setOpen("recovery");
      });
    },
    async generate() {
      const ok = await security.withTicket(async (ticket) => {
        setCodes(await ticket.generateRecoveryCodes());
        setOpen("recovery");
      });
      if (ok) void loadMfa();
    },
    /** Reset inside the codes dialog: close it, confirm, then show the new list */
    async resetFromDialog() {
      setOpen(null);
      await security.withTicket(async (ticket) => setCodes(await ticket.generateRecoveryCodes()), true);
      setOpen("recovery");
    },
  };

  const account = {
    async disable() {
      if (await security.withTicket((ticket) => ticket.disableAccount(), false, setAccountError)) await signOut();
    },
    async remove() {
      if (await security.withTicket((ticket) => ticket.deleteAccount(), false, setAccountError)) await signOut();
    },
  };

  if (!user) return null;

  return (
    <SettingsPage title={t`My account`} testID="settings-account" footer={<Toast text={toast} />}>
      <UserSummary user={user} />
      <ChangeRequests />
      <AccountInformation user={user} onOpen={setOpen} onSaved={() => say(t`Saved`)} />
      <PrivacySection />
      <StreamerSection />
      <SettingsSection title={t`Security`} description={t`Two-factor authentication protects your account even if your password leaks.`}>
        <RowGroup>
          <AccountRow
            first
            icon="device-mobile"
            title={t`Authenticator app`}
            pill={<StatusPill state={!mfa ? "loading" : mfa.totp ? "on" : "off"} />}
            description={t`Sign in with a one-time code from your phone.`}
            controls={
              mfa?.totp ? (
                <RowButton kind="outlined" label={t`Remove`} onPress={security.remove} testID="mfa-totp-remove" />
              ) : (
                <RowButton kind="primary" label={t`Set up`} onPress={security.setUp} disabled={!mfa} testID="mfa-totp-setup" />
              )
            }
          />
          <AccountRow
            icon="key"
            title={t`Recovery codes`}
            pill={<StatusPill state={!mfa ? "loading" : mfa.recovery ? "on" : "off"} />}
            description={t`One-time backup codes for when you can't use your authenticator.`}
            controls={
              mfa?.recovery ? (
                <>
                  <RowButton label={t`View`} onPress={security.view} testID="mfa-recovery-view" />
                  <RowButton kind="text" label={t`Reset`} accessibilityLabel={t`Replaces your current codes`} onPress={security.generate} testID="mfa-recovery-reset" />
                </>
              ) : (
                <RowButton label={t`Generate`} onPress={security.generate} disabled={!mfa} testID="mfa-recovery-generate" />
              )
            }
          />
          <AccountRow icon="desktop" title={t`Sessions`} description={t`See where you're signed in and sign out devices.`} onPress={() => router.push({ pathname: "/user-settings/[section]", params: { section: "sessions" } })} testID="account-sessions" />
        </RowGroup>
        <InlineError message={mfaError} />
      </SettingsSection>
      <AccountManagement disabled={!mfa} error={accountError} onDisable={account.disable} onDelete={account.remove} />

      <UsernameDialog user={user} visible={open === "username"} onClose={() => setOpen(null)} />
      <EmailDialog visible={open === "email"} setVisible={(v) => setOpen(v ? "email" : null)} request={request} />
      <PasswordDialog visible={open === "password"} onClose={() => setOpen(null)} onDone={() => say(t`Password changed successfully.`)} />
      <TotpDialog
        visible={open === "totp"}
        setup={totp}
        username={user.username}
        onCancel={() => {
          setOpen(null);
          setTotp(null);
          say(t`MFA setup canceled.`);
        }}
        onDone={() => {
          setOpen(null);
          setTotp(null);
          void loadMfa();
        }}
      />
      <RecoveryDialog visible={open === "recovery"} codes={codes} onClose={() => setOpen(null)} onReset={security.resetFromDialog} />
      {mfaElement}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Summary and change requests                                          */
/* ------------------------------------------------------------------ */

function UserSummary({ user }: { user: User }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const streamer = useLocalPrefs().streamerMode;
  const me = useFields(user, (u) => ({
    name: u.displayName ?? u.username,
    username: u.username,
    discriminator: u.discriminator,
    avatar: u.avatarURL,
    presence: u.presence,
    since: u.createdAt.getTime(),
  }));
  const [banner, setBanner] = useState<string>();
  useEffect(() => {
    let alive = true;
    user
      .fetchProfile()
      .then((p) => alive && setBanner(p.animatedBannerURL ?? p.bannerURL))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);
  if (!me) return null;
  const d = { since: new Intl.DateTimeFormat(i18n.locale, { dateStyle: "long" }).format(new Date(me.since)) };
  const tag = userTag(me, streamer);
  return (
    <View testID="account-summary" style={{ borderRadius: 14, backgroundColor: palette.field, overflow: "hidden" }}>
      <View style={{ height: 96, backgroundColor: palette.tonal }}>
        {banner ? (
          <Image source={{ uri: banner }} style={{ position: "absolute", inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ position: "absolute", inset: 0, backgroundColor: palette.accent, opacity: 0.28 }} />
        )}
      </View>
      {/* web: the avatar overlaps the banner, name, tag and "Member since" beside it, Edit profile under */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ marginTop: -40, borderRadius: 42, borderWidth: 4, borderColor: palette.field }}>
            <Avatar url={me.avatar} name={me.name} size={76} presence={me.presence as never} />
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingTop: 12, gap: 4 }}>
            <View>
              <AText autoDir size={20} line={28} weight="semibold" color={palette.header} numberOfLines={1}>
                {me.name}
              </AText>
              <AText autoDir size={14} line={20} color={palette.fg2} numberOfLines={1}>
                {`${me.username}${tag}`}
              </AText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="cake" size={16} color={palette.muted} />
              <AText size={12} line={16} color={palette.muted} style={{ flexShrink: 1 }}>
                {t`Member since ${d.since}`}
              </AText>
            </View>
          </View>
        </View>
        <View style={{ alignSelf: "flex-start" }}>
          <RowButton kind="outlined" icon="pencil-simple" label={t`Edit profile`} onPress={() => router.push({ pathname: "/user-settings/[section]", params: { section: "profile" } })} testID="account-edit-profile" />
        </View>
      </View>
    </View>
  );
}

function ChangeRequests() {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const api = client.api as unknown as LooseApi;
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const list = (await api.get("/users/@me/change-requests")) as ChangeRequest[] | null;
      setRequests(Array.isArray(list) ? list : []);
    } catch {
      setRequests([]);
    }
  }, [api]);
  useEffect(() => {
    let alive = true;
    api
      .get("/users/@me/change-requests")
      .then((list) => alive && setRequests(Array.isArray(list) ? (list as ChangeRequest[]) : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api]);

  if (requests.length === 0) return null;

  const field = (name: string) =>
    ({
      Avatar: t`Avatar`,
      ProfileBackground: t`Profile banner`,
      DisplayName: t`Display name`,
      Pronouns: t`Pronouns`,
      StatusText: t`Status text`,
      ProfileContent: t`Bio`,
    })[name] ?? name;

  const lines = (r: ChangeRequest) => {
    const c = r.changes;
    const out: string[] = [];
    if (c.display_name) out.push(`${t`Display name`}: ${c.display_name}`);
    if (c.pronouns) out.push(`${t`Pronouns`}: ${c.pronouns}`);
    if (c.status_text) out.push(`${t`Status text`}: ${c.status_text}`);
    if (c.bio) out.push(`${t`Bio`}: ${c.bio}`);
    for (const f of c.remove ?? []) out.push(t`Remove: ${field(f)}`);
    return out;
  };

  const answer = async (id: string, accept: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/users/@me/change-requests/${id}`, { accept });
      await load();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const date = (ms: number) => new Intl.DateTimeFormat(i18n.locale).format(new Date(ms));

  return (
    <SettingsSection title={t`Requests from Zrzur`} description={t`Zrzur asks you to agree to these changes to your profile. Nothing changes unless you accept.`}>
      <View style={{ gap: 12 }}>
        {requests.map((r) => (
          <View key={r._id} testID={`change-request-${r._id}`} style={{ gap: 8, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
            <AText size={15} line={22} color={palette.fg}>
              {r.reason}
            </AText>
            {lines(r).map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: 8 }}>
                <AText size={14} line={20} color={palette.fg2}>
                  •
                </AText>
                <AText size={14} line={20} color={palette.fg2} style={{ flex: 1 }}>
                  {line}
                </AText>
              </View>
            ))}
            <AText size={12} line={16} color={palette.muted}>
              {t`Answer by ${date(r.expires_at)}. Without an answer, nothing changes.`}
            </AText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <RowButton kind="primary" label={t`Accept change`} disabled={busy} onPress={() => void answer(r._id, true)} testID="change-request-accept" />
              <RowButton label={t`Decline`} disabled={busy} onPress={() => void answer(r._id, false)} testID="change-request-decline" />
            </View>
          </View>
        ))}
        <InlineError message={error} />
      </View>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Account information                                                  */
/* ------------------------------------------------------------------ */

function AccountInformation({ user, onOpen, onSaved }: { user: User; onOpen: (open: Open) => void; onSaved: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const streamer = useLocalPrefs().streamerMode;
  const username = useFields(user, (u) => u.username);
  const [email, setEmail] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [age, setAge] = useState<AgeInfo>(null);

  // the birth form, open under its row
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState<number>();
  const [year, setYear] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [birthError, setBirthError] = useState<string>();

  useEffect(() => {
    let alive = true;
    client.account
      .fetchAge()
      .then((a) => alive && setAge(a as AgeInfo))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client]);

  const reveal = async () => {
    setEmailError(undefined);
    try {
      setEmail(await client.account.fetchEmail());
    } catch (err) {
      setEmailError(describeError(err));
    }
  };

  const born = parseBirthMonth(age?.birth_month);
  const bornText = born
    ? new Intl.DateTimeFormat(i18n.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(born.year, born.month - 1, 15)))
    : t`Not added`;
  const band = age?.band ?? "unknown";
  const bandText = {
    unknown: t`Content marked as mature stays closed until you add it.`,
    under_minimum: t`Below the minimum age: your account is limited and may be reviewed.`,
    teen: t`Mature content is hidden for your age.`,
    adult_declared: t`Stated by you, not verified.`,
  }[band];

  const startEdit = () => {
    setMonth(born?.month);
    setYear(born ? String(born.year) : "");
    setPassword("");
    setBirthError(undefined);
    setEditing(true);
  };

  const saveBirth = async () => {
    if (!month) return;
    const problem = checkBirth(i18n, month, year);
    if (problem) return setBirthError(problem);
    setBusy(true);
    setBirthError(undefined);
    try {
      const next = await client.account.changeAge(birthMonthValue(year, month), born ? password : undefined);
      setAge(next as AgeInfo);
      setEditing(false);
      onSaved();
    } catch (err) {
      setBirthError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const shownEmail = email && !streamer ? email : MASKED_EMAIL;

  return (
    <SettingsSection title={t`Account information`}>
      <RowGroup>
        <AccountRow
          first
          icon="at"
          title={t`Username`}
          description={username}
          controls={<RowButton label={t`Edit`} onPress={() => onOpen("username")} testID="account-username-edit" />}
        />
        <AccountRow
          icon="envelope"
          title={t`Email`}
          description={
            <AText size={13} line={18} color={palette.muted} testID="account-email" selectable={!!email && !streamer}>
              {shownEmail}
            </AText>
          }
          controls={
            <>
              {!email && !streamer ? (
                <RowButton kind="text" icon="eye" label={t`Reveal`} accessibilityLabel={t`Reveal email address`} onPress={reveal} testID="account-email-reveal" />
              ) : null}
              <RowButton label={t`Change`} onPress={() => onOpen("email")} testID="account-email-change" />
            </>
          }
          below={<InlineError message={emailError} />}
        />
        <AccountRow
          icon="password"
          title={t`Password`}
          description={t`Change the password you use to sign in.`}
          controls={<RowButton label={t`Change`} onPress={() => onOpen("password")} testID="account-password-change" />}
        />
        <AccountRow
          icon="cake"
          title={t`Month and year of birth`}
          description={`${bornText} · ${bandText}`}
          controls={editing ? undefined : <RowButton label={t`Change`} onPress={startEdit} testID="account-birth-change" />}
          below={
            editing ? (
              <View style={{ gap: 12, paddingTop: 4 }} testID="account-birth-form">
                <BirthMonthField
                  month={month}
                  year={year}
                  onMonth={(m) => {
                    setMonth(m);
                    setBirthError(undefined);
                  }}
                  onYear={(y) => {
                    setYear(y);
                    setBirthError(undefined);
                  }}
                />
                <AText size={12} line={16} color={palette.muted}>
                  {t`You can make yourself younger at any time. You can make yourself older only once, and only within the same age group. For anything else, write to privacy@zrzur.com.`}
                </AText>
                {born ? (
                  <TextField
                    label={t`Current password`}
                    placeholder={t`Enter your current password.`}
                    value={password}
                    onChangeText={setPassword}
                    password
                    autoComplete="current-password"
                    textContentType="password"
                    autoCapitalize="none"
                    testID="account-birth-password"
                  />
                ) : null}
                <InlineError message={birthError} />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <RowButton kind="text" label={t`Cancel`} onPress={() => setEditing(false)} />
                  <RowButton
                    kind="primary"
                    label={t`Save`}
                    onPress={saveBirth}
                    disabled={busy || !month || year.length !== 4 || (!!born && !password)}
                    testID="account-birth-save"
                  />
                </View>
              </View>
            ) : null
          }
        />
      </RowGroup>
    </SettingsSection>
  );
}

/** Dialog: change or choose the username */
function UsernameDialog({ user, visible, onClose }: { user: User; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const streamer = useLocalPrefs().streamerMode;
  const me = useFields(user, (u) => ({ username: u.username, discriminator: u.discriminator }));
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const currentUsername = me.username;
  const h = { handle: userHandle(me, streamer) };
  const oldTag = hasOldTag(me);
  const value = name ?? me.username;
  const dirty = name !== null && name !== me.username;
  const problem = name !== null ? usernameProblem(value) : undefined;
  const check = problem === "short" ? t`Use at least 2 characters.` : problem === "characters" ? t`Use letters, numbers, underscores (_), dots (.) or dashes (-).` : undefined;
  const canSave = !usernameProblem(value) && !!password && (oldTag || value.trim() !== me.username);

  const close = () => {
    setName(null);
    setPassword("");
    setError(null);
    onClose();
  };
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await user.changeUsername(value.trim(), password);
      close();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogSheet
      visible={visible}
      // the scrim does not close it while something is typed
      onClose={() => (dirty || password ? undefined : close())}
      icon="at"
      title={oldTag ? t`Choose your username` : t`Change your username`}
      error={error}
      testID="dialog-username"
      actions={[
        { label: t`Save username`, kind: "primary", onPress: save, disabled: !canSave, busy, testID: "username-save" },
        { label: t`Cancel`, onPress: close, testID: "username-cancel" },
      ]}
    >
      <AText size={15} line={22} color={palette.fg2}>
        {oldTag ? (
          <Trans>
            Usernames no longer have a number tag. Choose a username that will be yours alone; you can keep <AText size={15} line={22} weight="semibold" color={palette.fg}>{currentUsername}</AText> if nobody has taken it. Until then you stay <AText size={15} line={22} weight="semibold" color={palette.fg}>{h.handle}</AText>.
          </Trans>
        ) : (
          t`Your username is yours alone, and friends use it to find you. Enter your current password to confirm.`
        )}
      </AText>
      <TextField
        label={t`Username`}
        value={value}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        maxLength={32}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="username"
        textContentType="username"
        error={check}
        helper={`${t`2 to 32 characters. Capital and small letters count as the same name. You can change it twice a day.`} ${value.length}/32`}
        testID="username-field"
      />
      <TextField
        label={t`Current password`}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        autoCapitalize="none"
        onSubmitEditing={save}
        testID="username-password"
      />
    </DialogSheet>
  );
}

/** Dialog: change the sign-in email (asks for the authenticator code when it is on) */
function EmailDialog({ visible, setVisible, request }: { visible: boolean; setVisible: (v: boolean) => void; request: RequestTicket }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const streamer = useLocalPrefs().streamerMode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string } | null>(null);

  const close = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setSent(null);
    setVisible(false);
  };
  const valid = isEmail(email) && !!password;
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const mfa = await client.account.mfa();
      let ticket: MFATicket | undefined;
      if (mfa.authenticatorEnabled) {
        // one sheet at a time: step aside for the confirmation
        setVisible(false);
        ticket = await request({ mfa, afterSheet: true });
        setVisible(true);
        if (!ticket) return;
      }
      await client.account.changeEmail(email.trim(), password, ticket);
      setSent({ email: email.trim() });
    } catch (err) {
      setVisible(true);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const delivery = client.configuration?.features?.email ?? true;
    const s = { email: streamer ? "•••@•••" : sent.email };
    return (
      <DialogSheet visible={visible} onClose={close} icon="envelope" title={t`Check your inbox`} testID="dialog-email-sent" actions={[{ label: t`Done`, kind: "primary", onPress: close, testID: "email-done" }]}>
        <AText size={15} line={22} color={palette.fg2}>
          {delivery ? (
            <Trans>
              We sent a confirmation link to <AText size={15} line={22} weight="semibold" color={palette.fg}>{s.email}</AText>. Your login email changes once you open it.
            </Trans>
          ) : (
            t`Your login email has been changed.`
          )}
        </AText>
      </DialogSheet>
    );
  }

  return (
    <DialogSheet
      visible={visible}
      onClose={close}
      icon="envelope"
      title={t`Change your email`}
      text={t`You sign in with this address and we use it for account security notices. Enter your current password to confirm.`}
      error={error}
      testID="dialog-email"
      actions={[
        { label: t`Change email`, kind: "primary", onPress: save, disabled: !valid, busy, testID: "email-save" },
        { label: t`Cancel`, onPress: close, testID: "email-cancel" },
      ]}
    >
      <TextField
        label={t`New email address`}
        placeholder="name@example.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError(null);
        }}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        error={email && !isEmail(email) ? t`Enter a valid email address.` : undefined}
        testID="email-field"
      />
      <TextField
        label={t`Current password`}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        autoCapitalize="none"
        onSubmitEditing={save}
        testID="email-password"
      />
    </DialogSheet>
  );
}

/** Dialog: change the password */
function PasswordDialog({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLingui();
  const client = useClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = !!confirm && confirm !== next;
  const valid = !!current && !!next && !!confirm && !mismatch;

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  };
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.account.changePassword(next, current);
      close();
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogSheet
      visible={visible}
      onClose={close}
      icon="password"
      title={t`Change your password`}
      text={t`Enter your current password, then choose a new one you don't use anywhere else.`}
      error={error}
      testID="dialog-password"
      actions={[
        { label: t`Change password`, kind: "primary", onPress: save, disabled: !valid, busy, testID: "password-save" },
        { label: t`Cancel`, onPress: close, testID: "password-cancel" },
      ]}
    >
      <TextField label={t`Current password`} value={current} onChangeText={setCurrent} password autoComplete="current-password" textContentType="password" autoCapitalize="none" testID="password-current" />
      <TextField label={t`New password`} value={next} onChangeText={setNext} password autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" testID="password-new" />
      <TextField
        label={t`Confirm new password`}
        value={confirm}
        onChangeText={setConfirm}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        autoCapitalize="none"
        error={mismatch ? t`Passwords don't match.` : undefined}
        onSubmitEditing={save}
        testID="password-confirm"
      />
    </DialogSheet>
  );
}

/** Dialog: add the authenticator (secret to copy or open, then the first code) */
function TotpDialog({
  visible,
  setup,
  username,
  onCancel,
  onDone,
}: {
  visible: boolean;
  setup: { secret: string; mfa: MFA } | null;
  username: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const uri = setup ? otpauthUri(username, setup.secret) : "";

  const reset = () => {
    setCode("");
    setError(null);
    setCopied(false);
  };
  const submit = async () => {
    if (!setup || !stripSpaces(code) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setup.mfa.enableAuthenticator(stripSpaces(code));
      reset();
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogSheet
      visible={visible}
      onClose={() => {
        reset();
        onCancel();
      }}
      icon="shield-check"
      title={t`Enable authenticator app`}
      text={t`Please scan or use the token below in your authenticator app.`}
      error={error}
      testID="dialog-totp"
      actions={[
        { label: t`Continue`, kind: "primary", onPress: submit, disabled: !stripSpaces(code), busy, testID: "totp-continue" },
        {
          label: t`Cancel`,
          onPress: () => {
            reset();
            onCancel();
          },
          testID: "totp-cancel",
        },
      ]}
    >
      <View style={{ gap: 12, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
        {uri ? (
          // white quiet zone so every authenticator app can read it in both themes
          <View testID="totp-qr" accessibilityLabel={t`Enable authenticator app`} style={{ alignSelf: "center", padding: 12, borderRadius: 10, backgroundColor: "#FFFFFF" }}>
            <QRCode value={uri} size={176} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
          </View>
        ) : null}
        <Text
          selectable
          testID="totp-secret"
          style={{ fontFamily: "monospace", fontSize: 16, lineHeight: 22, color: palette.fg, textAlign: "center", letterSpacing: 1, writingDirection: "ltr" }}
        >
          {setup?.secret ?? ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <RowButton
            icon={copied ? "check" : "copy"}
            label={copied ? t`Copied!` : t`Copy secret`}
            onPress={async () => {
              await copyToClipboard(setup?.secret ?? "");
              setCopied(true);
            }}
            testID="totp-copy"
          />
          <RowButton icon="arrow-square-out" label={t`Open in authenticator app`} onPress={() => void Linking.openURL(uri).catch(() => {})} testID="totp-open" />
        </View>
      </View>
      <TextField
        label={t`Enter code`}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setError(null);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        onSubmitEditing={submit}
        testID="totp-code"
      />
    </DialogSheet>
  );
}

/** Dialog: the recovery codes, two columns */
function RecoveryDialog({ visible, codes, onClose, onReset }: { visible: boolean; codes: string[]; onClose: () => void; onReset: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <DialogSheet
      visible={visible}
      onClose={onClose}
      icon="key"
      title={t`Your recovery codes`}
      text={t`Please save these to a safe location.`}
      testID="dialog-recovery"
      actions={[
        { label: t`Done`, kind: "primary", onPress: onClose, testID: "recovery-done" },
        { label: t`Reset`, kind: "danger", onPress: onReset, testID: "recovery-reset" },
      ]}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 16, rowGap: 8, borderRadius: 14, backgroundColor: palette.field }} testID="recovery-codes">
        {codes.map((code) => (
          <Text key={code} selectable style={{ width: "50%", fontFamily: "monospace", fontSize: 15, lineHeight: 22, color: palette.fg, textAlign: "center", writingDirection: "ltr" }}>
            {code}
          </Text>
        ))}
      </View>
    </DialogSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy and streamer mode                                            */
/* ------------------------------------------------------------------ */

function PrivacySection() {
  const { t } = useLingui();
  const client = useClient();
  // the same choice the chat's embeds read (src/chat/rich/playerConsent)
  const players = usePlayerConsent();
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [band, setBand] = useState<string>();
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState<"dm" | "groups" | null>(null);

  useEffect(() => {
    let alive = true;
    client.users
      .fetchPrivacy()
      .then((p) => alive && setPrivacy({ ...PRIVACY_DEFAULTS, ...(p as Partial<Privacy>) }))
      .catch(() => alive && setUnavailable(true));
    client.account
      .fetchAge()
      .then((a) => alive && setBand(a?.band))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client]);

  const current = privacy ?? PRIVACY_DEFAULTS;
  const disabled = unavailable || !privacy;
  const friendsOnly = directMessagesFriendsOnly(band);

  const change = async (update: Partial<Privacy>) => {
    const before = privacy;
    if (!before) return;
    setError(undefined);
    setPrivacy({ ...before, ...update });
    try {
      const saved = await client.users.editPrivacy(update);
      setPrivacy({ ...PRIVACY_DEFAULTS, ...(saved as Partial<Privacy>) });
    } catch (err) {
      setPrivacy(before);
      setError(describeError(err));
    }
  };

  const dmOptions: { value: DmPrivacy; label: string }[] = friendsOnly
    ? [{ value: "Friends", label: t`Friends only` }]
    : [
        { value: "Everyone", label: t`Everyone` },
        { value: "Mutual", label: t`Friends and server members` },
        { value: "Friends", label: t`Friends only` },
      ];
  const groupOptions: { value: GroupPrivacy; label: string }[] = [
    { value: "Everyone", label: t`Everyone` },
    { value: "Friends", label: t`Friends` },
    { value: "Nobody", label: t`Nobody` },
  ];
  const dmValue = friendsOnly ? "Friends" : current.direct_messages;
  const dmLabel = dmOptions.find((o) => o.value === dmValue)?.label ?? t`Friends only`;
  const groupLabel = groupOptions.find((o) => o.value === current.group_invites)?.label ?? "";

  return (
    <SettingsSection title={t`Privacy`} description={unavailable ? t`These settings aren't available yet.` : undefined}>
      <RowGroup>
        <AccountRow
          first
          icon="chat-circle"
          title={t`Who can message you`}
          description={
            friendsOnly
              ? t`Under 18, only friends can start a direct message with you. Anyone you write to first can reply.`
              : t`Friends can always message you, and blocked people never can. Anyone you write to first can reply.`
          }
          below={<SelectBox label={t`Who can message you`} value={dmLabel} disabled={disabled || friendsOnly} onPress={() => setPicking("dm")} testID="privacy-dm" />}
        />
        <AccountRow
          icon="users-three"
          title={t`Who can add you to group chats`}
          description={t`With Nobody, no one can put you in a group chat, not even friends. You can still make your own.`}
          below={<SelectBox label={t`Who can add you to group chats`} value={groupLabel} disabled={disabled} onPress={() => setPicking("groups")} testID="privacy-groups" />}
        />
        <AccountRow
          icon="play"
          title={t`Always load media players from other sites`}
          description={t`Off: each site like YouTube or Spotify asks you once. On: every player loads at once and the site learns your IP address.`}
          controls={
            <Toggle
              label={t`Always load media players from other sites`}
              value={players.always}
              onChange={setAlwaysLoadMediaPlayers}
              testID="privacy-media-players"
            />
          }
        />
        {players.allowed.length > 0 ? (
          <AccountRow
            icon="shield"
            title={t`Sites you allowed`}
            description={players.allowed.join(" · ")}
            controls={<RowButton kind="outlined" label={t`Forget`} onPress={forgetMediaPlayers} testID="privacy-forget-players" />}
          />
        ) : null}
      </RowGroup>
      <InlineError message={error} />
      <PickerSheet
        visible={picking === "dm"}
        title={t`Who can message you`}
        options={dmOptions}
        value={dmValue}
        onPick={(v) => void change({ direct_messages: v })}
        onClose={() => setPicking(null)}
      />
      <PickerSheet
        visible={picking === "groups"}
        title={t`Who can add you to group chats`}
        options={groupOptions}
        value={current.group_invites}
        onPick={(v) => void change({ group_invites: v })}
        onClose={() => setPicking(null)}
      />
    </SettingsSection>
  );
}

function StreamerSection() {
  const { t } = useLingui();
  const local = useLocalPrefs();
  return (
    <SettingsSection title={t`Streamer mode`} description={t`Hides your email, your tag, invite links and codes, and message previews from DMs in notifications, so they never show on stream.`}>
      <RowGroup>
        <AccountRow
          first
          icon="eye-slash"
          title={t`Streamer mode`}
          description={t`A small sign at the top shows while it is on.`}
          controls={<Toggle label={t`Streamer mode`} value={local.streamerMode} onChange={(v) => setLocalPrefs({ streamerMode: v })} testID="streamer-mode" />}
        />
      </RowGroup>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Account management                                                   */
/* ------------------------------------------------------------------ */

function AccountManagement({ disabled, error, onDisable, onDelete }: { disabled: boolean; error?: string; onDisable: () => void; onDelete: () => void }) {
  const { t } = useLingui();
  const client = useClient();
  const ownsServer = useSolid(useCallback(() => client.servers.toList().some((s) => s.ownerId === client.user?.id), [client]));
  const [info, setInfo] = useState<{ graceDays?: number; contact: string }>({ contact: "privacy@zrzur.com" });

  useEffect(() => {
    let alive = true;
    (client.api as unknown as LooseApi)
      .get("/auth/account/data-export")
      .then((r) => {
        const v = r as { deletion_grace_days?: number | null; contact_email?: string | null } | null;
        if (alive && v) setInfo({ graceDays: v.deletion_grace_days ?? undefined, contact: v.contact_email || "privacy@zrzur.com" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client]);

  const deleteText = ownsServer
    ? t`Cannot delete account until servers are deleted or transferred`
    : info.graceDays
      ? t`Your account and your data (including your messages and friends list) will be erased ${info.graceDays} days after you confirm by email. Some records we must keep by law, such as payments, stay for the time the law requires. You can cancel before then by writing to ${info.contact}. Download a copy of your data first: after you confirm, you can no longer sign in.`
      : t`Your account and your data (including your messages and friends list) will be erased after you confirm by email and a waiting period. Some records we must keep by law, such as payments, stay for the time the law requires. You can cancel before then by writing to ${info.contact}. Download a copy of your data first: after you confirm, you can no longer sign in.`;

  return (
    <SettingsSection title={t`Account management`}>
      <RowGroup>
        <AccountRow
          first
          danger
          icon="prohibit"
          title={t`Disable account`}
          description={t`You won't be able to access your account unless you contact support - however, your data will not be deleted.`}
          controls={<RowButton kind="outlined" label={t`Disable`} onPress={onDisable} disabled={disabled} testID="account-disable" />}
        />
        <AccountRow
          danger
          icon="trash"
          title={t`Delete account`}
          description={deleteText}
          controls={<RowButton kind="danger" label={t`Delete`} onPress={onDelete} disabled={disabled || ownsServer} testID="account-delete" />}
        />
      </RowGroup>
      <InlineError message={error} />
    </SettingsSection>
  );
}
