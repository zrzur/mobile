import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { intlLocale } from "@/chat/time";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

import { Choices, ConfirmDialog, ControlRow, InlineError, SaveBar, SettingsPage, SettingsSection, SmallButton, Toggle } from "../parts";
import { EmptyCard, LoadError, Loading, PickerSheet } from "./controls";
import { LobbyDesignPage } from "./LobbyDesign";
import { useWelcomeQuestions, WelcomeQuestions } from "./WelcomeQuestions";

type Access = "Open" | "Approval" | "Locked";
type Level = "None" | "Low" | "Medium" | "High";
const OPENNESS: Record<Access, number> = { Locked: 0, Approval: 1, Open: 2 };
const INVITE_OTHERS = 2n ** 25n;
const MAX_ROLES = 5;
const MAX_WELCOME = 1000;
/** manage or moderate bits (web: onJoin.ts) */
const POWERFUL_BITS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 13, 23, 24, 33, 34, 35, 37, 38, 40, 42].reduce((m, b) => m | (1n << BigInt(b)), 0n);

/** "3 hours ago" in the app language */
function ago(date: Date, locale: string, now: number) {
  const s = Math.round((date.getTime() - now) / 1000);
  const f = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return f.format(s, "second");
  if (a < 3600) return f.format(Math.round(s / 60), "minute");
  if (a < 86400) return f.format(Math.round(s / 3600), "hour");
  return f.format(Math.round(s / 86400), "day");
}

/** Join requests (web: JoinRequests) */
function JoinRequests({ server, onBack }: { server: Server; onBack: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [list, setList] = useState<Awaited<ReturnType<Server["fetchJoinRequests"]>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let live = true;
    server
      .fetchJoinRequests()
      .then((r) => {
        if (!live) return;
        setList(r.filter((x) => x.request.status === "Pending"));
        setNow(Date.now());
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [server, tick]);

  const decide = async (userId: string, approve: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      if (approve) await server.approveJoinRequest(userId);
      else await server.rejectJoinRequest(userId);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
      setTick((n) => n + 1);
    }
  };

  return (
    <SettingsPage title={t`Join requests`} backLabel={t`Joining`} onBack={onBack} testID="join-requests">
      <SettingsSection title={t`Join requests`} description={t`People who asked to join this private server. They can't see anything inside until you approve them.`}>
        {state === "loading" ? (
          <Loading text={t`Loading requests…`} />
        ) : state === "error" ? (
          <LoadError
            text={t`Requests couldn't be loaded`}
            onRetry={() => {
              setState("loading");
              setTick((n) => n + 1);
            }}
          />
        ) : list.length === 0 ? (
          <EmptyCard icon="users" title={t`No requests waiting`} text={t`When someone opens a join link to this server, their request shows up here.`} />
        ) : (
          <RowGroup>
            {list.map(({ request, user }, i) => {
              const when = ago(new Date(request.created_at), i18n.locale, now);
              return (
                <View key={request.user} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingVertical: 4, paddingStart: 16, paddingEnd: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                  <Avatar url={user?.avatar?.createFileURL?.()} name={user?.username ?? request.user} size={32} />
                  <View style={{ flex: 1, paddingStart: 4 }}>
                    <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
                      {user?.username ?? request.user}
                    </AText>
                    <AText size={13} line={18} color={palette.muted}>
                      {t`Asked ${when}`}
                    </AText>
                  </View>
                  <SmallButton label={t`Reject`} disabled={busy} onPress={() => void decide(request.user, false)} />
                  <SmallButton label={t`Approve`} primary disabled={busy} onPress={() => void decide(request.user, true)} />
                </View>
              );
            })}
          </RowGroup>
        )}
        <InlineError message={error} />
      </SettingsSection>
    </SettingsPage>
  );
}

type OnJoin = { roles?: string[]; welcome?: { channel: string; content: string } };

/** When someone joins (web: OnJoinSettings): own Save / Discard */
function OnJoinSection({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const canRoles = server.havePermission("ManageRole");
  const canMessage = server.havePermission("ManageServer");
  const [stored, setStored] = useState<OnJoin | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [draft, setDraft] = useState<{ roles: string[]; welcomeOn: boolean; channel: string; content: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    client.api
      .get(`/servers/${server.id}/on_join` as never)
      .then((r) => live && setStored((r ?? {}) as OnJoin))
      .catch((err) => live && setLoadError(describeError(err)));
    return () => {
      live = false;
    };
  }, [client, server, reload]);

  const roleJson = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          server.orderedRoles.filter((r) => !r.owner).map((r) => ({ id: r.id, name: r.name, colour: r.colour, powerful: (r.permissions.a & POWERFUL_BITS) !== 0n })),
        ),
      [server],
    ),
  );
  const roles = useMemo(() => JSON.parse(roleJson) as { id: string; name: string; colour?: string; powerful: boolean }[], [roleJson]);
  const textChannels = useSolid(useCallback(() => JSON.stringify(server.channels.filter((c) => c.type === "TextChannel").map((c) => ({ value: c.id, label: `#${c.name}` }))), [server]));
  const channels = useMemo(() => JSON.parse(textChannels) as { value: string; label: string }[], [textChannels]);

  if (loadError)
    return (
      <LoadError
        text={loadError}
        onRetry={() => {
          setLoadError(undefined);
          setReload((n) => n + 1);
        }}
      />
    );
  if (!stored) return <Loading />;

  const base = { roles: stored.roles ?? [], welcomeOn: !!stored.welcome, channel: stored.welcome?.channel ?? "", content: stored.welcome?.content ?? "" };
  const d = draft ?? base;
  const set = (patch: Partial<typeof d>) => {
    setDraft({ ...d, ...patch });
    if (patch.roles) setConfirmed(false);
  };
  const body = (x: typeof d) => ({ roles: x.roles, ...(x.welcomeOn ? { welcome: { channel: x.channel, content: x.content.trim() } } : {}) });
  const dirty = JSON.stringify(body(d)) !== JSON.stringify(body(base));
  const powerful = roles.filter((r) => d.roles.includes(r.id) && r.powerful);
  const names = powerful.map((r) => r.name).join(", ");
  const length = [...d.content].length;
  const problem = d.welcomeOn ? (!d.channel ? "channel" : !d.content.trim() ? "empty" : length > MAX_WELCOME ? "long" : null) : null;
  const max = MAX_ROLES;

  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      const next = (await client.api.put(`/servers/${server.id}/on_join` as never, { ...body(d), ...(confirmed ? { confirm_powerful_roles: true } : {}) } as never)) as OnJoin;
      setStored(next ?? {});
      setDraft(null);
      setConfirmed(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };

  const insert = (token: string) => {
    const text = d.content;
    const needsSpace = text && !/\s$/.test(text);
    set({ content: `${text}${needsSpace ? " " : ""}${token}` });
  };

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <AText size={16} line={22} weight="semibold" color={palette.header}>
          {t`Roles for everyone who joins`}
        </AText>
        <AText size={13} line={18} color={palette.muted}>
          {t`Given the moment someone becomes a member, whichever way they came in. Bots get none. Up to ${max} roles.`}
        </AText>
        {roles.length === 0 ? (
          <AText size={14} line={20} color={palette.muted}>
            {t`This server has no roles yet. Make one in Roles first.`}
          </AText>
        ) : (
          <View accessibilityLabel={t`Roles for everyone who joins`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, opacity: canRoles ? 1 : 0.6 }}>
            {roles.map((r) => {
              const on = d.roles.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !canRoles || pending }}
                  accessibilityLabel={r.name}
                  disabled={!canRoles || pending || (!on && d.roles.length >= MAX_ROLES)}
                  onPress={() => set({ roles: on ? d.roles.filter((x) => x !== r.id) : [...d.roles, r.id] })}
                  aria-checked={on}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    opacity: !on && d.roles.length >= MAX_ROLES ? 0.5 : 1,
                    backgroundColor: on ? palette.navSelected : pressed ? palette.navHover : palette.field,
                  })}
                >
                  {on ? <Icon name="check" size={16} color={palette.fg} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.colour && /^#[0-9a-f]{6}$/i.test(r.colour) ? r.colour : palette.pill }} />}
                  <AText size={14} line={20} weight="semibold" color={on ? palette.fg : palette.fg2}>
                    {r.name}
                  </AText>
                  {r.powerful ? (
                    <View accessible accessibilityLabel={t`Can manage or moderate`}>
                      <Icon name="warning" size={16} color={palette.warningText} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {powerful.length ? (
          <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field, gap: 8, borderWidth: 1, borderColor: palette.warningText }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Icon name="warning" size={20} color={palette.warningText} />
              <AText size={14} line={20} weight="semibold" color={palette.fg} style={{ flex: 1 }}>
                {t`Everyone who joins would be able to manage or moderate`}
              </AText>
            </View>
            <AText size={13} line={18} color={palette.fg2}>
              {t`${names} can change the server or act on other members. A stranger with an invite link gets it too.`}
            </AText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginStart: -8 }}>
              <Toggle label={t`Give it to everyone anyway`} value={confirmed} onChange={setConfirmed} />
              <AText size={14} line={20} color={palette.fg}>
                {t`Give it to everyone anyway`}
              </AText>
            </View>
          </View>
        ) : null}
        {!canRoles ? (
          <AText size={13} line={18} color={palette.muted}>
            {t`Choosing these roles needs the Manage Roles permission.`}
          </AText>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <AText size={16} line={22} weight="semibold" color={palette.header}>
          {t`Welcome message`}
        </AText>
        <AText size={13} line={18} color={palette.muted}>
          {t`Posted by Zrzur in a channel you pick when someone joins. Nobody is notified.`}
        </AText>
        <RowGroup>
          <ControlRow
            first
            icon="hand-waving"
            title={t`Post a welcome message`}
            description={d.welcomeOn ? t`On. When many people join at once, the first ten of each minute are welcomed.` : t`Off. Nothing is posted when someone joins.`}
            control={<Toggle label={t`Post a welcome message`} value={d.welcomeOn} disabled={!canMessage || pending} onChange={(on) => set({ welcomeOn: on })} testID="toggle-welcome" />}
          />
          {d.welcomeOn ? (
            <ControlRow
              icon="hash"
              title={t`Channel`}
              description={t`Where the message appears.`}
              control={<SmallButton label={channels.find((c) => c.value === d.channel)?.label ?? t`Choose a channel`} disabled={!canMessage || pending} onPress={() => setPicker(true)} />}
            />
          ) : null}
        </RowGroup>
        {d.welcomeOn ? (
          <View style={{ gap: 8 }}>
            <TextField
              label={t`Message`}
              value={d.content}
              onChangeText={(v) => set({ content: v })}
              editable={canMessage && !pending}
              multiline
              maxLength={MAX_WELCOME}
              placeholder={t`Welcome {member} to {server}!`}
              helper={`${length}/${MAX_WELCOME}`}
              style={{ minHeight: 88, textAlignVertical: "top" }}
              testID="welcome-text"
            />
            <View accessibilityLabel={t`Add to the message`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <SmallButton label={t`The member`} disabled={!canMessage || pending} onPress={() => insert("{member}")} />
              <SmallButton label={t`The server's name`} disabled={!canMessage || pending} onPress={() => insert("{server}")} />
            </View>
            {problem === "channel" ? (
              <AText size={13} line={18} color={palette.muted}>
                {t`Choose a channel for the message.`}
              </AText>
            ) : null}
          </View>
        ) : null}
      </View>

      {dirty || error ? (
        <View style={{ gap: 8 }}>
          <InlineError message={error} />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <SmallButton
              label={t`Discard`}
              onPress={() => {
                setDraft(null);
                setConfirmed(false);
                setError(undefined);
              }}
            />
            <SmallButton label={t`Save`} primary testID="on-join-save" disabled={!dirty || pending || !!problem || (powerful.length > 0 && !confirmed)} onPress={() => void save()} />
          </View>
        </View>
      ) : null}
      <PickerSheet visible={picker} title={t`Channel`} value={d.channel} options={channels} onPick={(v) => set({ channel: v })} onClose={() => setPicker(false)} />
    </View>
  );
}

/** Joining (web: JoiningPage) */
export function JoiningPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const s = useFields(server, (v) => ({
    access: v.access as Access,
    level: v.verificationLevel as Level,
    rules: !!v.rulesChannelId,
    screening: !!v.rulesScreeningSince,
    discoverable: v.discoverable,
    // bigint as text: useFields compares with JSON
    defaults: String(v.defaultPermissions),
  }));
  const manage = server.havePermission("ManageServer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ part: string; message: string }>();
  const [confirm, setConfirm] = useState<Access | null>(null);
  const [requests, setRequests] = useState(false);
  const [lobby, setLobby] = useState(false);
  const questions = useWelcomeQuestions(server);

  if (requests) return <JoinRequests server={server} onBack={() => setRequests(false)} />;
  if (lobby) return <LobbyDesignPage server={server} onBack={() => setLobby(false)} />;
  if (!s) return null;

  const run = (part: string, fn: () => Promise<unknown>) => {
    setPending(true);
    setError(undefined);
    fn()
      .catch((err) => setError({ part, message: describeError(err) }))
      .finally(() => setPending(false));
  };
  const chooseAccess = (next: Access) => {
    if (next === s.access || pending) return;
    if (OPENNESS[next] > OPENNESS[s.access]) setConfirm(next);
    else run("access", () => server.setAccess(next as never));
  };
  const defaults = BigInt(s.defaults);
  const invite = (defaults & INVITE_OTHERS) === INVITE_OTHERS;
  const levelName = { None: t`None`, Low: t`Low`, Medium: t`Medium`, High: t`High` };
  const readOnly = (perm: string, ok: boolean) => (ok ? undefined : perm);

  return (
    <SettingsPage
      title={t`Joining`}
      description={t`Who can join, what they must accept, and what they see first.`}
      testID="server-joining"
      footer={manage ? <SaveBar dirty={questions.dirty} saving={questions.saving} error={questions.error} onReset={questions.reset} onSave={() => void questions.save()} /> : null}
    >
      <SettingsSection title={t`Who can join`} description={t`How people get in, and who may invite them.`} readOnly={readOnly(t`Manage server`, manage)}>
        <View style={{ gap: 16 }}>
          <Choices
            label={t`How people join`}
            value={s.access}
            disabled={!manage || pending}
            onChange={chooseAccess}
            options={[
              { value: "Open", title: t`Public`, text: t`Anyone with an invite joins right away.` },
              { value: "Approval", title: t`Private`, text: t`People ask to join, and someone you allow lets them in.` },
              { value: "Locked", title: t`Locked`, text: t`Only invites from people allowed to invite. No requests.` },
            ]}
          />
          <View style={{ gap: 8 }}>
            <AText size={13} line={20} weight="semibold" color={palette.fg2}>
              {t`Invites`}
            </AText>
            <RowGroup>
              <ControlRow
                first
                icon="user-plus"
                title={t`Members can invite`}
                description={invite ? t`Every member can share an invite link.` : t`Only roles with Invite others can share invites.`}
                control={
                  <Toggle
                    label={t`Members can invite`}
                    value={invite}
                    disabled={!server.havePermission("ManagePermissions") || pending}
                    onChange={(on) => run("invite", () => server.setPermissions(undefined, Number(on ? defaults | INVITE_OTHERS : defaults & ~INVITE_OTHERS)))}
                  />
                }
              />
              {s.access === "Approval" && server.havePermission("ManageJoinRequests") ? (
                <Pressable testID="open-join-requests" accessibilityRole="button" onPress={() => setRequests(true)}>
                  <ControlRow icon="tray" title={t`Join requests`} description={t`Review who asked to join.`} control={<Icon name="caret-right" size={16} color={palette.iconMuted} />} />
                </Pressable>
              ) : null}
              <ControlRow
                icon="compass"
                title={t({ message: "Discover", context: "server-settings" })}
                description={s.access !== "Open" ? t`Only public servers can be listed.` : s.discoverable ? t`Listed on Discover.` : t`Not listed.`}
                control={null}
              />
            </RowGroup>
            {error && (error.part === "access" || error.part === "invite") ? <InlineError message={error.message} /> : null}
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={t({ message: "Verification", context: "server-settings" })} description={t`What new members need before they can talk.`} readOnly={readOnly(t`Manage server`, manage)}>
        <Choices
          label={t`Level`}
          value={s.level}
          disabled={!manage || pending}
          onChange={(level) => level !== s.level && run("level", () => server.setVerificationLevel(level as never))}
          options={[
            { value: "None", title: levelName.None, text: t`New members can talk right away.` },
            { value: "Low", title: levelName.Low, text: t`A verified email address.` },
            { value: "Medium", title: levelName.Medium, text: t`A verified email, and an account older than 5 minutes.` },
            { value: "High", title: levelName.High, text: t`All of the above, and 10 minutes in this server.` },
          ]}
        />
        <AText size={13} line={18} color={palette.muted} style={{ marginTop: 8 }}>
          {t`Members with any role, bots and the owner are exempt.`}
        </AText>
        {error?.part === "level" ? <InlineError message={error.message} /> : null}
      </SettingsSection>

      <SettingsSection title={t`Rules to accept`} description={t`New members agree to the rules before they write.`} readOnly={readOnly(t`Manage server`, manage)}>
        <RowGroup>
          <ControlRow
            first
            icon="check-square"
            title={t`New members accept the rules`}
            description={!s.rules ? t`Needs a rules channel first.` : s.screening ? t`New members accept the rules before they write.` : t`New members can write right away.`}
            control={s.rules ? <Toggle label={t`New members accept the rules`} value={s.screening} disabled={!manage || pending} onChange={(on) => run("rules", () => server.setRulesScreening(on))} /> : null}
          />
        </RowGroup>
        {error?.part === "rules" ? <InlineError message={error.message} /> : null}
      </SettingsSection>

      <SettingsSection
        title={t`When someone joins`}
        description={t`Roles everyone gets, and a welcome message.`}
        readOnly={server.orPermission("ManageRole", "ManageServer") ? undefined : t`Manage server`}
      >
        <OnJoinSection server={server} />
      </SettingsSection>

      <SettingsSection title={t`Welcome questions`} description={t`Let new members pick their interests and get roles.`} readOnly={readOnly(t`Manage server`, manage)}>
        <WelcomeQuestions server={server} state={questions} />
      </SettingsSection>

      <SettingsSection title={t({ message: "Lobby", context: "server-settings" })} description={t`What new members see first.`} readOnly={readOnly(t`Manage server`, manage)}>
        <RowGroup>
          <Pressable testID="open-lobby-design" accessibilityRole="button" onPress={() => setLobby(true)}>
            <ControlRow
              first
              icon="house"
              title={t`Lobby design`}
              description={t`Colours, layout, welcome text, buttons and questions of the lobby.`}
              control={<Icon name="caret-right" size={16} color={palette.iconMuted} />}
            />
          </Pressable>
        </RowGroup>
      </SettingsSection>

      <ConfirmDialog
        visible={!!confirm}
        danger={false}
        title={t`Let more people in?`}
        text={
          confirm === "Open"
            ? t`Anyone with a join link will join right away, without approval. Requests that are still waiting stay in Join requests.`
            : t`People with a join link can send requests again, including the custom link.`
        }
        confirm={t`Change access`}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm) await server.setAccess(confirm as never);
        }}
      />
    </SettingsPage>
  );
}
