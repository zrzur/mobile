import { useLingui } from "@lingui/react/macro";
import type { Server, ServerMember } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { describeError } from "@/auth/errorText";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit";

import { type AppCommand, commandDescription, commandTitle, freeTargets, grantedPermissions, removeRule, type Rule, ruleCount, type RuleType, setRule, sortCommands, sortRules } from "../apps";
import { ConfirmDialog, ControlRow, SettingsPage, SettingsSection } from "../parts";
import { permissionGroups } from "../permissions";
import { PickerSheet } from "./Channels";
import { AssistantPage, assistantAvailable } from "./Assistant";
import { BotTag, NoteRow, RowButton, Segmented, SelectField, WebhooksPanel } from "./Webhooks";

type Install = { application: { _id: string }; installed_at: string; installed_by: string; permissions: number; scopes: string[] };
type RulesScope = { command_id?: string | null; permissions: Rule[] };

/* ------------------------------------------------------------------ */
/* API (web: settings/server/apps/api.ts)                               */
/* ------------------------------------------------------------------ */

type Api = ReturnType<typeof useClient>["api"];
const appsApi = {
  installed: async (api: Api, serverId: string) => (await api.get(`/servers/${serverId}/applications` as never)) as unknown as Install[],
  remove: (api: Api, serverId: string, appId: string) => api.delete(`/servers/${serverId}/applications/${appId}` as never),
  commands: async (api: Api, serverId: string, appId: string) => (await api.get(`/servers/${serverId}/applications/${appId}/commands` as never)) as unknown as AppCommand[],
  rules: async (api: Api, serverId: string, appId: string) => (await api.get(`/servers/${serverId}/applications/${appId}/permissions` as never)) as unknown as RulesScope[],
  saveRules: (api: Api, serverId: string, appId: string, commandId: string | undefined, permissions: Rule[]) =>
    commandId
      ? api.put(`/servers/${serverId}/applications/${appId}/commands/${commandId}/permissions` as never, { permissions } as never)
      : api.put(`/servers/${serverId}/applications/${appId}/permissions` as never, { permissions } as never),
};

/* ------------------------------------------------------------------ */
/* Rows                                                                 */
/* ------------------------------------------------------------------ */

/** A settings row: icon, title, description, an optional control or chevron */
function InfoRow({
  icon,
  title,
  description,
  children,
  first,
  onPress,
  testID,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: pressed && onPress ? palette.navSelected : "transparent",
      })}
    >
      {icon ? <Icon name={icon} size={20} color={palette.iconNeutral} /> : null}
      <View style={{ flex: 1, gap: 4 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg}>
          {title}
        </AText>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
        {children}
      </View>
      {onPress ? <Icon name="caret-right" size={16} color={palette.iconMuted} /> : null}
    </Pressable>
  );
}

function BotRow({ server, userId, installedAt, first, manage, onOpen, onKick }: { server: Server; userId: string; installedAt?: string; first: boolean; manage: boolean; onOpen: () => void; onKick: (m: ServerMember) => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const member = server.getMember(userId);
  const f = useFields(member, (m) => ({
    name: m.displayName ?? m.user?.displayName ?? m.user?.username ?? userId,
    username: m.user?.username ?? "",
    avatar: m.user?.avatarURL,
    official: !!m.user?.officialBot,
    verified: !!m.user?.verifiedBot,
    canKick: server.havePermission("KickMembers") && !!server.member && m.inferiorTo(server.member),
  }));
  if (!f || !member) return null;
  const date = installedAt ? new Date(installedAt).toLocaleDateString(i18n.locale === "zh-Hans" ? "zh-CN" : i18n.locale) : "";
  const description = `@${f.username}${installedAt ? ` · ${t`Added ${date}`}` : ""}`;
  return (
    <Pressable
      testID={`bot-row-${userId}`}
      disabled={!manage}
      accessibilityRole={manage ? "button" : undefined}
      onPress={manage ? onOpen : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.divider,
        backgroundColor: pressed && manage ? palette.navSelected : "transparent",
      })}
    >
      <Avatar url={f.avatar} name={f.name} size={24} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <AText autoDir size={16} line={22} weight="medium" color={palette.fg} style={{ flexShrink: 1 }} numberOfLines={1}>
            {f.name}
          </AText>
          <BotTag official={f.official} verified={f.verified} />
        </View>
        <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1}>
          {description}
        </AText>
      </View>
      {manage ? <Icon name="caret-right" size={16} color={palette.iconMuted} /> : f.canKick ? <RowButton label={t`Remove`} onPress={() => onKick(member)} testID="bot-kick" /> : null}
    </Pressable>
  );
}

/** Bots in this server (web: ServerBots) */
function Bots({ server, onOpen }: { server: Server; onOpen: (id: string) => void }) {
  const { t } = useLingui();
  const client = useClient();
  const manage = server.havePermission("ManageServer");
  const [load, setLoad] = useState<{ state: "loading" | "error" | "ready"; bots: { id: string; installedAt?: string }[] }>({ state: "loading", bots: [] });
  const [kicking, setKicking] = useState<ServerMember | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const { members } = await server.fetchMembers();
      const bots = members.filter((m) => m.user?.bot);
      // who added each one, when the server kept a record
      const installs = manage ? await appsApi.installed(client.api, server.id).catch(() => [] as Install[]) : [];
      return bots.map((m) => ({ id: m.id.user, installedAt: installs.find((i) => i.application._id === m.id.user)?.installed_at }));
    })()
      .then((bots) => live && setLoad({ state: "ready", bots }))
      .catch(() => live && setLoad({ state: "error", bots: [] }));
    return () => {
      live = false;
    };
  }, [client, server, manage]);

  const username = kicking?.displayName ?? kicking?.user?.username ?? "";
  return (
    <>
      {load.state === "loading" ? (
        <NoteRow title={t`Loading…`} />
      ) : load.state === "error" ? (
        <NoteRow icon="warning-circle" title={t`Couldn't load the bots.`} />
      ) : load.bots.length === 0 ? (
        <NoteRow icon="robot" title={t`No bots in this server.`} description={t`Bots you add show up here.`} />
      ) : (
        <RowGroup>
          {load.bots.map((b, i) => (
            <BotRow key={b.id} server={server} userId={b.id} installedAt={b.installedAt} first={i === 0} manage={manage} onOpen={() => onOpen(b.id)} onKick={setKicking} />
          ))}
        </RowGroup>
      )}
      <ConfirmDialog
        visible={!!kicking}
        title={t`You are about to kick ${username}`}
        confirm={t`Kick member`}
        onClose={() => {
          setKicking(null);
          setReason("");
        }}
        onConfirm={async () => {
          if (!kicking) return;
          const id = kicking.id.user;
          await kicking.kick(reason.trim() || undefined);
          setLoad((prev) => ({ ...prev, bots: prev.bots.filter((b) => b.id !== id) }));
        }}
      >
        <TextField label={t`Reason (optional)`} placeholder={t`Shown in the audit log`} value={reason} onChangeText={setReason} maxLength={1024} testID="bot-kick-reason" />
      </ConfirmDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rules editor (web: apps/RulesEditor.tsx)                             */
/* ------------------------------------------------------------------ */

/**
 * The rules of one scope (the whole app, or one command). Every change is
 * saved at once; a failure is shown here and the list goes back.
 */
function RulesEditor({ server, label, initial, onSave, testID }: { server: Server; label: string; initial: Rule[]; onSave: (rules: Rule[]) => Promise<unknown>; testID?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [rules, setRules] = useState<Rule[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState<RuleType>("Role");
  const [target, setTarget] = useState("");
  const [allow, setAllow] = useState<"allow" | "deny">("allow");
  const [picker, setPicker] = useState<"kind" | "target" | null>(null);
  // members are only fetched when someone wants a rule for one
  const [members, setMembers] = useState<{ id: string; name: string }[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const save = async (next: Rule[]) => {
    if (saving) return;
    const before = rules;
    setRules(next);
    setSaving(true);
    setError(undefined);
    try {
      await onSave(next);
    } catch (err) {
      setRules(before);
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const roleName = (id: string) => (id === server.id ? t`Everyone` : (server.roles.get(id)?.name ?? t`Deleted role`));
  const channelName = (id: string) => (id === server.id ? t`Every channel` : `#${client.channels.get(id)?.name ?? t`deleted channel`}`);
  const memberName = (id: string) => {
    const member = server.getMember(id);
    const user = client.users.get(id);
    return member?.displayName ?? user?.displayName ?? user?.username ?? id;
  };
  const nameOf = (rule: Rule) => (rule.type === "Role" ? roleName(rule.id) : rule.type === "Channel" ? channelName(rule.id) : memberName(rule.id));

  const pickKind = (next: RuleType) => {
    setKind(next);
    setTarget("");
    if (next === "Member" && !members && !membersLoading) {
      setMembersLoading(true);
      server
        .fetchMembers()
        .then(({ members: list }) => setMembers(list.filter((m) => !m.user?.bot).map((m) => ({ id: m.id.user, name: m.displayName ?? m.user?.username ?? m.id.user }))))
        .catch(() => setMembers([]))
        .finally(() => setMembersLoading(false));
    }
  };

  const all =
    kind === "Role"
      ? [{ id: server.id, name: t`Everyone` }, ...server.orderedRoles.map((r) => ({ id: r.id, name: r.name }))]
      : kind === "Channel"
        ? [{ id: server.id, name: t`Every channel` }, ...server.channels.filter((c) => c.type === "TextChannel").map((c) => ({ id: c.id, name: `#${c.name}` }))]
        : (members ?? []);
  const targets = freeTargets(all, rules, kind);
  const kinds: { value: RuleType; label: string }[] = [
    { value: "Role", label: t`A role` },
    { value: "Member", label: t`A member` },
    { value: "Channel", label: t`A channel` },
  ];
  const allowOptions: { value: "allow" | "deny"; label: string }[] = [
    { value: "allow", label: t`Allow` },
    { value: "deny", label: t`Deny` },
  ];

  const add = () => {
    if (!target) return;
    void save(setRule(rules, { id: target, type: kind, permission: allow === "allow" }));
    setTarget("");
  };

  return (
    <View testID={testID} accessibilityLabel={label} accessibilityState={{ busy: saving }} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
      {rules.length === 0 ? (
        <AText size={13} line={20} color={palette.muted}>
          {t`No rules: everyone who has the permissions the bot asks for can use it, in every channel.`}
        </AText>
      ) : (
        <View style={{ gap: 8 }}>
          {sortRules(rules, server.id).map((rule) => {
            const name = nameOf(rule);
            return (
              <View key={`${rule.type}:${rule.id}`} testID={`rule-${rule.type}-${rule.id}`} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 120 }}>
                  <Icon name={rule.type === "Role" ? "shield" : rule.type === "Channel" ? "hash" : "user"} size={16} color={palette.iconNeutral} />
                  <AText size={14} line={20} color={palette.fg} style={{ flexShrink: 1 }}>
                    {name}
                  </AText>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Segmented
                    label={t`Allow or deny ${name}`}
                    value={rule.permission ? "allow" : "deny"}
                    options={allowOptions}
                    disabled={saving}
                    onChange={(v) => void save(setRule(rules, { ...rule, permission: v === "allow" }))}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t`Remove the rule for ${name}`}
                    disabled={saving}
                    onPress={() => void save(removeRule(rules, rule.type, rule.id))}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", opacity: saving ? 0.5 : 1, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                  >
                    <Icon name="x" size={16} color={palette.iconMuted} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SelectField label={t`Rule for`} value={kinds.find((k) => k.value === kind)?.label ?? ""} onPress={() => setPicker("kind")} disabled={saving} testID="rule-kind" />
        <SelectField
          label={t`Which one`}
          value={all.find((x) => x.id === target)?.name ?? ""}
          onPress={() => setPicker("target")}
          disabled={saving || (kind === "Member" && membersLoading)}
          testID="rule-target"
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Segmented label={t`Allow or deny`} value={allow} options={allowOptions} onChange={setAllow} disabled={saving} testID="rule-allow" />
          <Button testID="rule-add" label={t`Add rule`} disabled={!target || saving} onPress={add} />
        </View>
      </View>

      {error ? (
        <AText size={13} line={20} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}

      <PickerSheet visible={picker === "kind"} title={t`Rule for`} value={kind} options={kinds} onPick={pickKind} onClose={() => setPicker(null)} />
      <PickerSheet visible={picker === "target"} title={t`Which one`} value={target} options={targets.map((x) => ({ value: x.id, label: x.name }))} onPick={setTarget} onClose={() => setPicker(null)} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* One bot (web: apps/ServerAppPage.tsx)                                */
/* ------------------------------------------------------------------ */

function BotPage({ server, appId, onBack }: { server: Server; appId: string; onBack: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const manage = server.havePermission("ManageServer");

  const [data, setData] = useState<{ state: "loading" | "error" | "ready"; install?: Install; commands: AppCommand[] }>({ state: "loading", commands: [] });
  const [rules, setRules] = useState<{ state: "loading" | "error" | "ready"; scopes: RulesScope[]; error?: string }>({ state: "loading", scopes: [] });
  const [rulesVersion, setRulesVersion] = useState(0);
  const [open, setOpen] = useState<string>();
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [installs, commands] = await Promise.all([appsApi.installed(client.api, server.id), appsApi.commands(client.api, server.id, appId)]);
      if (!client.users.get(appId)) await client.users.fetch(appId).catch(() => undefined);
      const install = installs.find((i) => i.application._id === appId);
      if (install && !client.users.get(install.installed_by)) await client.users.fetch(install.installed_by).catch(() => undefined);
      return { install, commands: sortCommands(commands) };
    })()
      .then((d) => live && setData({ state: "ready", ...d }))
      .catch(() => live && setData({ state: "error", commands: [] }));
    return () => {
      live = false;
    };
  }, [client, server, appId]);

  // the rules on their own: a failure is shown, never read as "no rules"
  useEffect(() => {
    let live = true;
    appsApi
      .rules(client.api, server.id, appId)
      .then((scopes) => live && setRules({ state: "ready", scopes }))
      .catch((err) => live && setRules({ state: "error", scopes: [], error: describeError(err) }));
    return () => {
      live = false;
    };
  }, [client, server, appId, rulesVersion]);

  const user = client.users.get(appId);
  const u = useFields(user, (v) => ({ name: v.displayName ?? v.username, avatar: v.avatarURL, official: !!v.officialBot, verified: !!v.verifiedBot }));
  const member = server.getMember(appId);
  const role = server.orderedRoles.find((r) => r.owner === appId);
  const installer = data.install ? client.users.get(data.install.installed_by) : undefined;
  const installerName = installer ? (installer.displayName ?? installer.username) : "";
  const date = data.install ? new Intl.DateTimeFormat(i18n.locale === "zh-Hans" ? "zh-CN" : i18n.locale, { dateStyle: "long" }).format(new Date(data.install.installed_at)) : "";
  const added = data.install ? (installer ? t`Added by ${installerName} on ${date}` : t`Added on ${date}`) : member ? t`Added before Zrzur kept a record of who adds apps.` : undefined;

  const titles = new Map(permissionGroups(i18n).flatMap((g) => g.items.map((item) => [item.key, item.title] as const)));
  const granted = grantedPermissions(data.install?.permissions ?? 0).map((key) => titles.get(key) ?? key);
  const scopes = data.install?.scopes ?? [];
  const rulesFor = (commandId?: string) => rules.scopes.find((s) => (s.command_id ?? undefined) === commandId)?.permissions ?? [];
  const rulesReady = rules.state === "ready";
  const roleName = role?.name ?? "";

  return (
    <SettingsPage title={u?.name ?? t`App`} backLabel={t`Apps`} onBack={onBack} testID="server-app-page">
      {/* header */}
      <RowGroup>
        <View style={{ padding: 16, gap: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
          <Avatar url={u?.avatar} name={u?.name ?? "?"} size={48} />
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <AText size={18} line={24} weight="semibold" color={palette.header} style={{ flexShrink: 1 }}>
                {u?.name ?? ""}
              </AText>
              <BotTag official={u?.official} verified={u?.verified} />
            </View>
            {added ? (
              <AText size={13} line={20} color={palette.fg2}>
                {added}
              </AText>
            ) : null}
          </View>
          {manage ? (
            <Button testID="app-remove" label={t`Remove app`} icon="trash" variant="danger" onPress={() => setRemoving(true)} />
          ) : null}
        </View>
      </RowGroup>

      {data.state === "error" ? <NoteRow icon="warning-circle" title={t`Couldn't load this app.`} /> : null}

      <SettingsSection title={t`What it can do`} description={t`The permissions it was given when it was added, through its own role.`}>
        <RowGroup>
          {granted.length ? (
            <InfoRow first icon="key" title={t`Permissions`} description={granted.join(" · ")} />
          ) : (
            <InfoRow first icon="info" title={t`No permissions were given when it was added.`} />
          )}
          {role ? (
            <InfoRow
              icon="shield"
              title={t`Role: ${roleName}`}
              description={t`Managed by the app. Change what it may do in the role.`}
              onPress={() => router.push({ pathname: "/server-section/[id]/[section]", params: { id: server.id, section: "roles" } })}
              testID="app-role"
            />
          ) : null}
          {scopes.length ? (
            <InfoRow icon="list-checks" title={t`Scopes`}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {scopes.map((scope) => (
                  <View key={scope} style={{ paddingHorizontal: 8, borderRadius: 999, backgroundColor: palette.tonal }}>
                    <AText size={12} line={20} color={palette.fg} style={{ fontFamily: "monospace", writingDirection: "ltr" }}>
                      {scope}
                    </AText>
                  </View>
                ))}
              </View>
            </InfoRow>
          ) : null}
        </RowGroup>
      </SettingsSection>

      <SettingsSection
        title={t`Commands and who can use them`}
        description={t`Rules for one command come before the rules for the whole app. A rule for a member beats their roles, a Deny on any of their roles beats an Allow on another, and Everyone counts last.`}
      >
        <View style={{ gap: 16 }}>
          {rules.state === "error" ? (
            <NoteRow
              danger
              icon="warning-circle"
              title={t`The rules couldn't be loaded, so they can't be changed now.`}
              description={rules.error}
              action={
                <RowButton
                  label={t`Try again`}
                  onPress={() => {
                    setRules({ state: "loading", scopes: [] });
                    setRulesVersion((n) => n + 1);
                  }}
                  testID="rules-retry"
                />
              }
            />
          ) : null}
          {rules.state === "loading" || data.state === "loading" ? <NoteRow title={t`Loading…`} /> : null}
          {data.state === "ready" && rulesReady ? (
            <>
              <View style={{ gap: 8 }}>
                <AText size={15} line={20} weight="semibold" color={palette.header} accessibilityRole="header">
                  {t`All commands`}
                </AText>
                <RowGroup>
                  <RulesEditor
                    key={`all-${rulesVersion}`}
                    server={server}
                    label={t`Rules for all commands`}
                    initial={rulesFor(undefined)}
                    onSave={async (list) => {
                      await appsApi.saveRules(client.api, server.id, appId, undefined, list);
                      setRules((prev) => ({ ...prev, scopes: [...prev.scopes.filter((s) => s.command_id), { command_id: null, permissions: list }] }));
                    }}
                    testID="rules-all"
                  />
                </RowGroup>
              </View>
              {data.commands.length === 0 ? (
                <NoteRow icon="info" title={t`This app has no commands here.`} />
              ) : (
                <RowGroup>
                  {data.commands.map((command, i) => {
                    const count = rulesFor(command._id).length;
                    const description = commandDescription(command, i18n.locale);
                    const meta = [description, count ? ruleCount(i18n, count) : ""].filter(Boolean).join(" · ");
                    const expanded = open === command._id;
                    const commandName = command.name;
                    return (
                      <View key={command._id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                        <Pressable
                          testID={`command-${command._id}`}
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          onPress={() => setOpen(expanded ? undefined : command._id)}
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                        >
                          <Icon name="terminal" size={20} color={palette.iconNeutral} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                              <AText size={16} line={22} weight="medium" color={palette.fg} style={{ writingDirection: "ltr", flexShrink: 1 }}>
                                {commandTitle(command, i18n.locale)}
                              </AText>
                              {command.server_id ? (
                                <View style={{ paddingHorizontal: 8, borderRadius: 999, backgroundColor: palette.tonal }}>
                                  <AText size={12} line={20} color={palette.fg2}>
                                    {t`This server only`}
                                  </AText>
                                </View>
                              ) : null}
                            </View>
                            {meta ? (
                              <AText size={13} line={18} color={palette.muted}>
                                {meta}
                              </AText>
                            ) : null}
                          </View>
                          <Icon name={expanded ? "caret-down" : "caret-right"} size={16} color={palette.iconMuted} />
                        </Pressable>
                        {expanded ? (
                          <RulesEditor
                            key={`${command._id}-${rulesVersion}`}
                            server={server}
                            label={t`Rules for ${commandName}`}
                            initial={rulesFor(command._id)}
                            onSave={async (list) => {
                              await appsApi.saveRules(client.api, server.id, appId, command._id, list);
                              setRules((prev) => ({ ...prev, scopes: [...prev.scopes.filter((s) => s.command_id !== command._id), { command_id: command._id, permissions: list }] }));
                            }}
                            testID="rules-command"
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </RowGroup>
              )}
            </>
          ) : null}
        </View>
      </SettingsSection>

      <ConfirmDialog
        visible={removing}
        title={t`Remove this app?`}
        text={t`The bot leaves the server. Its role, its commands here and their rules go too. You can add it again later.`}
        confirm={t`Remove app`}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await appsApi.remove(client.api, server.id, appId);
          // back to Apps once the dialog has gone
          setTimeout(onBack, 0);
        }}
      />
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                             */
/* ------------------------------------------------------------------ */

/** Apps (web: server settings › Apps): bots, then webhooks */
export function AppsPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const [bot, setBot] = useState<string | null>(null);
  const [assistant, setAssistant] = useState(false);
  // a fresh bot list after a bot was removed
  const [listKey, setListKey] = useState(0);
  const manage = server.havePermission("ManageServer");
  const kick = server.havePermission("KickMembers");
  const webhooks = server.havePermission("ManageWebhooks");

  if (assistant) return <AssistantPage server={server} onBack={() => setAssistant(false)} />;

  if (bot) {
    return (
      <BotPage
        server={server}
        appId={bot}
        onBack={() => {
          setBot(null);
          setListKey((n) => n + 1);
        }}
      />
    );
  }

  return (
    <SettingsPage title={t`Apps`} description={t`Bots and webhooks.`} testID="server-apps">
      {manage && assistantAvailable() ? (
        <SettingsSection title={t`Zrzur Assistant`} description={t`The official bot: safety, community and support in one place.`}>
          <RowGroup>
            <ControlRow
              first
              icon="robot"
              title={t`Zrzur Assistant`}
              description={t`Choose modules and set them up.`}
              control={<Button size="sm" variant="tonal" label={t`Configure`} onPress={() => setAssistant(true)} testID="apps-assistant" />}
            />
          </RowGroup>
        </SettingsSection>
      ) : null}
      {manage || kick ? (
        <SettingsSection title={t`Bots`} description={t`The bots in this server.`}>
          <Bots key={listKey} server={server} onOpen={setBot} />
        </SettingsSection>
      ) : null}
      {webhooks ? (
        <SettingsSection title={t({ message: "Webhooks", context: "server-settings" })} description={t`Links that let other services post.`}>
          <WebhooksPanel server={server} />
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
