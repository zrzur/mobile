import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { decodeTime } from "ulid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { clock, intlLocale } from "@/chat/time";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

import { ACTION_TYPES, type ApiUser, describeEntry, type Entry, type Kind, type Names } from "../auditText";
import { SettingsPage, SettingsSection, SmallButton } from "../parts";
import { EmptyCard, LoadError, Loading, PickerSheet, SelectPill } from "./controls";

const PAGE = 50;

/** Field label in the expanded change list */
function fieldLabel(i18n: I18n, key: string) {
  const map: Record<string, string> = {
    name: i18n._(msg`Name`),
    description: i18n._(msg`Description`),
    icon: i18n._(msg`Icon`),
    banner: i18n._(msg`Banner`),
    nsfw: i18n._(msg`Age-restricted`),
    colour: i18n._(msg`Colour`),
    hoist: i18n._(msg`Shown separately`),
    rank: i18n._(msg`Position`),
    nickname: i18n._(msg`Nickname`),
    avatar: i18n._(msg`Server avatar`),
    roles: i18n._(msg`Roles`),
    timeout: i18n._(msg`Timeout`),
    permissions: i18n._(msg`Permissions`),
    default_permissions: i18n._(msg`Default permissions`),
    role_permissions: i18n._(msg`Role permissions`),
    categories: i18n._(msg`Categories`),
    system_messages: i18n._(msg`System messages`),
    slowmode: i18n._(msg`Slow mode`),
  };
  return map[key] ?? key;
}

function fieldValue(i18n: I18n, key: string, v: unknown, role: Names["role"]) {
  if (v === undefined || v === null || v === "") return "—";
  if (key === "roles" && Array.isArray(v)) return v.length ? v.map((id) => role(String(id))).join(", ") : "—";
  if (key === "timeout" && typeof v === "string") {
    const d = new Date(v);
    return `${d.toLocaleDateString(intlLocale(i18n.locale))} ${clock(d, i18n.locale)}`;
  }
  if (typeof v === "boolean") return v ? i18n._(msg`Yes`) : i18n._(msg`No`);
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (["icon", "banner", "avatar"].includes(key)) return i18n._(msg`new image`);
  return i18n._(msg`changed`);
}

/** The mark on the actor's avatar: one colour per kind of change (tokens: success, action, error) */
const kindColour = (kind: Kind, p: { online: string; accent: string; danger: string }) => (kind === "create" ? p.online : kind === "edit" ? p.accent : p.danger);

function EntryRow({ entry, first, names, users, avatarOf }: { entry: Entry; first: boolean; names: Names; users: Map<string, ApiUser>; avatarOf: (u?: ApiUser) => string | undefined }) {
  const { i18n } = useLingui();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const d = describeEntry(i18n, entry.action, names);
  const time = new Date(decodeTime(entry._id));
  const before = (entry.action.before ?? {}) as Record<string, unknown>;
  const after = (entry.action.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => k !== "_id" && k !== "id");
  const actor = users.get(entry.user);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: keys.length ? open : undefined, disabled: !keys.length }}
      disabled={!keys.length}
      onPress={() => setOpen(!open)}
      style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, backgroundColor: pressed && keys.length ? palette.navSelected : "transparent" })}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 28, height: 28 }}>
          <Avatar url={avatarOf(actor)} name={names.user(entry.user)} size={28} />
          <View style={{ position: "absolute", bottom: -4, end: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: kindColour(d.kind, palette), alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.field }}>
            <Icon name={d.icon} size={8} color={palette.onAccent} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AText size={14} line={20} color={palette.fg}>
            <AText size={14} line={20} weight="semibold" color={palette.header}>
              {names.user(entry.user)}
            </AText>
            {` ${d.text}`}
          </AText>
          {entry.reason ? (
            <AText size={13} line={18} color={palette.muted}>
              {`“${entry.reason}”`}
            </AText>
          ) : null}
        </View>
        <AText size={12} line={16} color={palette.muted}>
          {clock(time, i18n.locale)}
        </AText>
        {keys.length ? <Icon name={open ? "caret-up" : "caret-down"} size={14} color={palette.iconMuted} /> : null}
      </View>
      {open ? (
        <View style={{ gap: 8, paddingStart: 40 }}>
          {keys.map((k) => (
            <View key={k} style={{ gap: 2 }}>
              <AText size={12} line={16} weight="semibold" color={palette.fg2}>
                {fieldLabel(i18n, k)}
              </AText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                <AText size={13} line={18} color={palette.muted} style={{ textDecorationLine: "line-through" }}>
                  {fieldValue(i18n, k, before[k], names.role)}
                </AText>
                <Icon name="arrow-right" size={12} color={palette.muted} />
                <AText size={13} line={18} color={palette.fg}>
                  {fieldValue(i18n, k, after[k], names.role)}
                </AText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Audit log (web: AuditLog) */
export function AuditLogPage({ server }: { server: Server }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<Map<string, ApiUser>>(new Map());
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [more, setMore] = useState(false);
  const [person, setPerson] = useState("all");
  const [action, setAction] = useState("all");
  const [picker, setPicker] = useState<"person" | "action" | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    async (before?: string) => {
      const params: Record<string, unknown> = { limit: PAGE };
      if (before) params.before = before;
      if (person !== "all") params.user = person;
      if (action !== "all") params.type = ACTION_TYPES[action];
      const r = (await client.api.get(`/servers/${server.id}/audit_logs` as never, params as never)) as { audit_logs: Entry[]; users: ApiUser[] };
      return r;
    },
    [client, server, person, action],
  );

  useEffect(() => {
    let live = true;
    load()
      .then((r) => {
        if (!live) return;
        setEntries(r.audit_logs);
        setUsers((m) => new Map([...m, ...r.users.map((u) => [u._id, u] as const)]));
        setMore(r.audit_logs.length === PAGE);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [load, reload]);

  const older = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setState("loading");
    try {
      const r = await load(last._id);
      setEntries((list) => [...list, ...r.audit_logs]);
      setUsers((m) => new Map([...m, ...r.users.map((u) => [u._id, u] as const)]));
      setMore(r.audit_logs.length === PAGE);
      setState("ready");
    } catch {
      setState("error");
    }
  };

  const names: Names = useMemo(() => {
    const isolate = (s: string) => `⁨${s}⁩`;
    return {
      user: (id) => {
        if (!id) return i18n._(msg`someone`);
        const m = server.getMember(id);
        const u = users.get(id);
        return m?.nickname ?? m?.user?.displayName ?? u?.display_name ?? u?.username ?? i18n._(msg`a former member`);
      },
      channel: (id, fallback) => {
        const c = id ? server.channels.find((x) => x.id === id) : undefined;
        return isolate(c ? `#${c.name}` : fallback ? `#${fallback}` : i18n._(msg`deleted channel`));
      },
      role: (id, fallback) => (id ? server.roles.get(id)?.name : undefined) ?? fallback ?? i18n._(msg`deleted role`),
    };
  }, [server, users, i18n]);

  const avatarOf = (u?: ApiUser) => (u?.avatar ? `${client.configuration?.features.autumn.url ?? ""}/avatars/${u.avatar._id}` : undefined);

  const actions = [
    { value: "all", label: t`All actions` },
    { value: "members", label: t`Members and bans` },
    { value: "messages", label: t`Messages` },
    { value: "channels", label: t`Channels` },
    { value: "roles", label: t`Roles` },
    { value: "server", label: t`Server settings` },
    { value: "invites", label: t`Invites and webhooks` },
    { value: "emojis", label: t`Emojis` },
    { value: "apps", label: t`Apps and bots` },
  ];
  const people = [{ value: "all", label: t`Everyone` }, ...[...users.values()].map((u) => ({ value: u._id, label: names.user(u._id) }))];

  // group by day
  const groups: { day: string; items: Entry[] }[] = [];
  const dayFormat = new Intl.DateTimeFormat(intlLocale(i18n.locale), { dateStyle: "full" });
  for (const e of entries) {
    const day = dayFormat.format(new Date(decodeTime(e._id)));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <SettingsPage title={t`Audit log`} description={t`Who changed what, and when.`} testID="server-log">
      <SettingsSection title={t`Audit log`} description={t`Everything that changed in this server, who did it and when.`}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, marginVertical: -4 }}>
            {[
              { key: "person" as const, label: people.find((p) => p.value === person)?.label ?? "", a11y: t`Filter by person` },
              { key: "action" as const, label: actions.find((a) => a.value === action)?.label ?? "", a11y: t`Filter by action` },
            ].map((c) => (
              <SelectPill key={c.key} testID={`log-filter-${c.key}`} label={c.a11y} value={c.label} onPress={() => setPicker(c.key)} />
            ))}
          </View>
          {state === "error" && entries.length === 0 ? (
            <LoadError
              text={t`The audit log couldn't be loaded`}
              onRetry={() => {
                setState("loading");
                setReload((n) => n + 1);
              }}
            />
          ) : state === "loading" && entries.length === 0 ? (
            <Loading text={t`Loading the audit log…`} />
          ) : entries.length === 0 ? (
            <EmptyCard icon="clock-counter-clockwise" title={t`Nothing here yet`} />
          ) : (
            groups.map((g) => (
              <View key={g.day} style={{ gap: 8 }}>
                <AText size={13} line={20} weight="semibold" color={palette.muted} accessibilityRole="header" style={{ paddingHorizontal: 2 }}>
                  {g.day}
                </AText>
                <RowGroup>
                  {g.items.map((e, i) => (
                    <EntryRow key={e._id} entry={e} first={i === 0} names={names} users={users} avatarOf={avatarOf} />
                  ))}
                </RowGroup>
              </View>
            ))
          )}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {more ? <SmallButton label={t`Load older entries`} disabled={state === "loading"} onPress={() => void older()} /> : null}
            <SmallButton label={t`Refresh`} testID="log-refresh" onPress={() => setReload((n) => n + 1)} />
          </View>
        </View>
      </SettingsSection>
      <PickerSheet
        visible={picker === "person"}
        title={t`Filter by person`}
        value={person}
        options={people}
        onPick={(v) => {
          setPerson(v);
          setState("loading");
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === "action"}
        title={t`Filter by action`}
        value={action}
        options={actions}
        onPick={(v) => {
          setAction(v);
          setState("loading");
        }}
        onClose={() => setPicker(null)}
      />
    </SettingsPage>
  );
}
