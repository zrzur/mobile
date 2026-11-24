import { useLingui } from "@lingui/react/macro";
import type { Server, ServerMember } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { GroupRow, RowGroup, SearchField, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Button } from "@/ui/kit";
import { Avatar } from "@/ui/Avatar";
import { describeError } from "@/auth/errorText";
import { Icon } from "@/ui/Icon";

import { ConfirmDialog, InlineError, SettingsPage, SettingsSection } from "../parts";
import { CheckBox, ChipChoice, EmptyCard, LoadError, Loading, PickerSheet, RowTool, SelectPill } from "./controls";
import { copyToClipboard } from "@/ui/kit/share";


const PAGE = 60;

type Sort = "newest" | "oldest" | "name";

function MemberRow({ member, first, onActions }: { member: ServerMember; first: boolean; onActions: (m: ServerMember) => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const f = useFields(member, (m) => ({
    name: m.displayName ?? m.user?.displayName ?? "",
    handle: m.user ? `${m.user.username}#${m.user.discriminator}` : "",
    avatar: m.avatarURL ?? m.user?.avatarURL,
    timedOut: !!m.timeout && m.timeout > new Date(),
    roles: m.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour })),
  }));
  if (!f) return null;
  return (
    <View style={{ paddingVertical: 8, paddingStart: 16, paddingEnd: 4, gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar url={f.avatar} name={f.name} size={36} />
        <View style={{ flex: 1 }}>
          <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
            {f.name}
          </AText>
          <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={1}>
            {f.handle}
            {f.timedOut ? ` · ${t`Timed out`}` : ""}
          </AText>
        </View>
        <RowTool testID="member-actions" icon="dots-three" label={t`Member actions`} onPress={() => onActions(member)} />
      </View>
      {f.roles.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, paddingStart: 48, paddingEnd: 12, paddingBottom: 4 }}>
          {f.roles.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 24, paddingHorizontal: 8, borderRadius: 6, backgroundColor: palette.tonal }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.colour && /^#[0-9a-f]{6}$/i.test(r.colour) ? r.colour : palette.pill }} />
              <AText size={12} line={16} color={palette.fg}>
                {r.name}
              </AText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Pick the roles of one member: checkboxes, saved with Save changes */
function RolesSheet({ server, member, onClose }: { server: Server; member: ServerMember; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const myRank = server.owner?.self ? -Infinity : (server.member?.ranking ?? Infinity);
  const [picked, setPicked] = useState<string[]>(member.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Sheet visible onClose={onClose}>
      <AText size={18} line={26} weight="bold" color={palette.header}>
        {t`Edit roles`}
      </AText>
      <RowGroup>
        {server.orderedRoles.map((r, i) => {
          const on = picked.includes(r.id);
          const lock = r.rank <= myRank;
          return (
            <Pressable
              key={r.id}
              disabled={lock}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: lock }}
              onPress={() => setPicked(on ? picked.filter((x) => x !== r.id) : [...picked, r.id])}
              aria-checked={on}
              style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, opacity: lock ? 0.5 : 1, backgroundColor: pressed ? palette.navSelected : "transparent" })}
            >
              <CheckBox on={on} />
              <AText size={16} line={22} weight="medium" color={r.colour && /^#[0-9a-f]{6}$/i.test(r.colour) ? r.colour : palette.fg} style={{ flex: 1 }}>
                {r.name}
              </AText>
              {lock ? <Icon name="lock-simple" size={16} color={palette.muted} /> : null}
            </Pressable>
          );
        })}
      </RowGroup>
      <InlineError message={error} />
      <Button
        label={t`Save changes`}
        fill
        testID="member-roles-save"
        status={busy ? "submitting" : "ready"}
        onPress={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await member.edit({ roles: picked } as never);
              onClose();
            } catch (err) {
              setError(describeError(err));
            } finally {
              setBusy(false);
            }
          }}
      />
    </Sheet>
  );
}

function Invites({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [invites, setInvites] = useState<Awaited<ReturnType<Server["fetchInvites"]>>>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expires, setExpires] = useState<number>(604800);
  const [maxUses, setMaxUses] = useState<number>(0);
  const [tick, setTick] = useState(0);
  const [makeBusy, setMakeBusy] = useState(false);
  const [makeError, setMakeError] = useState<string>();
  // the time of the last fetch: time left is counted from it
  const [now, setNow] = useState(0);

  useEffect(() => {
    let live = true;
    server
      .fetchInvites()
      .then((list) => {
        if (!live) return;
        setInvites(list);
        setNow(Date.now());
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [server, tick]);

  const left = (expires?: Date) => {
    if (!expires) return t`Never expires`;
    const ms = expires.getTime() - now;
    if (ms <= 0) return t`Expired`;
    const min = Math.ceil(ms / 60000);
    if (min < 60) return t`${min} min left`;
    const h = Math.ceil(min / 60);
    if (h < 48) return t`${h} h left`;
    const days = Math.ceil(h / 24);
    return t`${days} days left`;
  };
  const EXPIRES: { value: number; label: string }[] = [
    { value: 1800, label: t`30 minutes` },
    { value: 3600, label: t`1 hour` },
    { value: 21600, label: t`6 hours` },
    { value: 43200, label: t`12 hours` },
    { value: 86400, label: t`1 day` },
    { value: 604800, label: t`7 days` },
    { value: 0, label: t`Never` },
  ];
  const USES = [0, 1, 5, 10, 25, 50, 100].map((n) => ({ value: n, label: n === 0 ? t`No limit` : String(n) }));
  const firstText = server.channels.find((c) => c.type === "TextChannel" && c.havePermission("InviteOthers"));

  return (
    <SettingsSection
      title={t`Active invites`}
      description={t`Anyone with one of these links can join. Delete a link to stop it working.`}
      aside={
        firstText ? (
          <Button testID="invite-create" label={t`Create invite`} icon="plus" variant="tonal" onPress={() => setCreating(true)} />
        ) : undefined
      }
    >
      {state === "loading" ? (
        <Loading text={t`Loading invites…`} />
      ) : state === "error" ? (
        <LoadError
          text={t`Invites couldn't be loaded`}
          onRetry={() => {
            setState("loading");
            setTick((n) => n + 1);
          }}
        />
      ) : invites.length === 0 ? (
        <EmptyCard icon="link" title={t`No active invites`} text={t`Create one to bring people into this server.`} />
      ) : (
        <RowGroup>
          {invites.map((inv, i) => {
            const v = inv as unknown as { id: string; uses: number; maxUses?: number; expires?: Date; channel?: { name: string }; creator?: { displayName?: string; username: string } };
            const uses = v.uses ?? 0;
            const max = v.maxUses;
            const usesText = max ? t`${uses} of ${max} uses` : t`${uses} uses`;
            return (
              <View key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingStart: 16, paddingEnd: 4, minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                <View style={{ flex: 1, paddingVertical: 8 }}>
                  <AText size={16} line={22} weight="medium" color={palette.fg} style={{ writingDirection: "ltr" }}>
                    {v.id}
                  </AText>
                  <AText size={13} line={18} color={palette.muted} numberOfLines={2}>
                    {[v.channel ? `#${v.channel.name}` : null, v.creator?.displayName ?? v.creator?.username, usesText, left(v.expires)].filter(Boolean).join(" · ")}
                  </AText>
                </View>
                <RowTool icon="copy" label={t`Copy invite link`} onPress={() => void copyToClipboard(`https://zrzur.cc/${v.id}`)} />
                <RowTool icon="trash" danger label={t`Delete invite`} onPress={() => setDeleting(v.id)} />
              </View>
            );
          })}
        </RowGroup>
      )}
      <ConfirmDialog
        visible={!!deleting}
        title={t`Delete this invite?`}
        text={t`The link stops working at once for everyone who has it.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const inv = invites.find((x) => (x as unknown as { id: string }).id === deleting) as unknown as { delete: () => Promise<void> } | undefined;
          await inv?.delete();
          setTick((n) => n + 1);
        }}
      />
      <Sheet visible={creating} onClose={() => setCreating(false)}>
        <AText size={18} line={26} weight="bold" color={palette.header}>
          {t`Create invite`}
        </AText>
        {/* one sheet at a time: the choices sit in the sheet instead of a second sheet */}
        <ChipChoice label={t`Expires after`} value={expires} options={EXPIRES} onChange={setExpires} />
        <ChipChoice label={t`Max uses`} value={maxUses} options={USES} onChange={setMaxUses} />
        <InlineError message={makeError} />
        <Button
          label={t`Create invite`}
          fill
          testID="invite-create-confirm"
          status={makeBusy ? "submitting" : "ready"}
          onPress={async () => {
            setMakeBusy(true);
            setMakeError(undefined);
            try {
              await firstText?.createInvite({ expiresIn: expires || null, maxUses: maxUses || undefined });
              setCreating(false);
              setTick((n) => n + 1);
            } catch (err) {
              setMakeError(describeError(err));
            } finally {
              setMakeBusy(false);
            }
          }}
        />
      </Sheet>
    </SettingsSection>
  );
}

/** Members (web: settings › Members) */
export function MembersPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [ids, setIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [shown, setShown] = useState(PAGE);
  const [picker, setPicker] = useState<"role" | "sort" | null>(null);
  const [actions, setActions] = useState<ServerMember | null>(null);
  const [rolesFor, setRolesFor] = useState<ServerMember | null>(null);
  const [dialog, setDialog] = useState<{ kind: "timeout" | "untimeout" | "kick" | "ban"; member: ServerMember } | null>(null);
  const [reason, setReason] = useState("");
  const [timeoutFor, setTimeoutFor] = useState(600);
  const [deleteFor, setDeleteFor] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    server
      .fetchMembers()
      .then(({ members }) => {
        if (!live) return;
        setIds(members.map((m) => m.id.user));
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [server, reload]);

  const roleOptions = useSolid(useCallback(() => JSON.stringify(server.orderedRoles.map((r) => ({ value: r.id, label: r.name }))), [server]));
  const list = useMemo(() => {
    const q = foldSearch(query.trim());
    const members = ids.map((id) => server.getMember(id)).filter((m): m is ServerMember => !!m);
    const filtered = members.filter((m) => {
      if (roleFilter && !m.roles.includes(roleFilter)) return false;
      if (!q) return true;
      const hay = foldSearch(`${m.displayName ?? ""} ${m.user?.username ?? ""} ${m.id.user}`);
      return hay.includes(q);
    });
    filtered.sort((a, b) =>
      sort === "name"
        ? (a.displayName ?? "").localeCompare(b.displayName ?? "")
        : sort === "newest"
          ? b.joinedAt.getTime() - a.joinedAt.getTime()
          : a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    return filtered;
  }, [ids, query, roleFilter, sort, server]);

  const can = {
    roles: server.havePermission("AssignRoles"),
    timeout: server.havePermission("TimeoutMembers"),
    kick: server.havePermission("KickMembers"),
    ban: server.havePermission("BanMembers"),
  };
  const roles = JSON.parse(roleOptions) as { value: string; label: string }[];
  const sorts = [
    { value: "newest" as Sort, label: t`Newest first` },
    { value: "oldest" as Sort, label: t`Oldest first` },
    { value: "name" as Sort, label: t`Name A–Z` },
  ];
  const username = dialog?.member.displayName ?? dialog?.member.user?.username ?? "";
  const total = ids.length;
  const TIMEOUTS = [
    { value: 60, label: t`1 minute` },
    { value: 300, label: t`5 minutes` },
    { value: 600, label: t`10 minutes` },
    { value: 3600, label: t`1 hour` },
    { value: 86400, label: t`1 day` },
    { value: 604800, label: t`1 week` },
  ];
  const HISTORY = [
    { value: 0, label: t`Don't delete messages` },
    { value: 3600, label: t`1 hour` },
    { value: 21600, label: t`6 hours` },
    { value: 86400, label: t`1 day` },
    { value: 259200, label: t`3 days` },
    { value: 604800, label: t`7 days` },
  ];

  return (
    <SettingsPage title={t`Members`} description={t`Everyone in the server, and its invites.`} testID="server-members">
      <SettingsSection title={t`Everyone in the server`} description={t`Search, change roles, time out, kick or ban.`}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", height: 44 }}>
            <SearchField value={query} onChange={setQuery} placeholder={t`Search by name or ID`} testID="member-search" />
          </View>
          <View style={{ flexDirection: "row", columnGap: 8, flexWrap: "wrap", marginVertical: -4 }}>
            {[
              { key: "role" as const, label: roleFilter ? (roles.find((r) => r.value === roleFilter)?.label ?? t`All roles`) : t`All roles` },
              { key: "sort" as const, label: sorts.find((s) => s.value === sort)?.label ?? "" },
            ].map((c) => (
              <SelectPill key={c.key} testID={`member-filter-${c.key}`} label={c.key === "role" ? t`Role` : t`Sort`} value={c.label} onPress={() => setPicker(c.key)} />
            ))}
          </View>
          {state === "ready" ? (
            <AText size={13} line={18} color={palette.muted}>
              {t`${total} in total`}
            </AText>
          ) : null}
          {state === "loading" ? (
            <Loading text={t`Loading members…`} />
          ) : state === "error" ? (
            <LoadError
              text={t`Members couldn't be loaded`}
              onRetry={() => {
                setState("loading");
                setReload((n) => n + 1);
              }}
            />
          ) : list.length === 0 ? (
            <EmptyCard icon="magnifying-glass" title={t`No member matches`} />
          ) : (
            <RowGroup>
              {list.slice(0, shown).map((m, i) => (
                <MemberRow key={m.id.user} member={m} first={i === 0} onActions={setActions} />
              ))}
            </RowGroup>
          )}
          {list.length > shown ? (
            <Button label={t`Show more`} variant="tonal" fill onPress={() => setShown((n) => n + PAGE)} />
          ) : null}
        </View>
      </SettingsSection>

      <Invites server={server} />

      <PickerSheet visible={picker === "role"} title={t`All roles`} value={roleFilter} options={[{ value: "", label: t`All roles` }, ...roles]} onPick={setRoleFilter} onClose={() => setPicker(null)} />
      <PickerSheet visible={picker === "sort"} title={t`Sort`} value={sort} options={sorts} onPick={setSort} onClose={() => setPicker(null)} />

      <Sheet visible={!!actions} onClose={() => setActions(null)} testID="member-menu">
        {actions ? (
          <>
            <RowGroup>
              {can.roles ? <GroupRow first icon="key" label={t`Edit roles`} onPress={() => { setRolesFor(actions); setActions(null); }} /> : null}
              {can.timeout ? (
                actions.timeout && actions.timeout > new Date() ? (
                  <GroupRow first={!can.roles} icon="clock" label={t`Remove timeout`} onPress={() => { setDialog({ kind: "untimeout", member: actions }); setActions(null); }} />
                ) : (
                  <GroupRow first={!can.roles} icon="clock" label={t`Timeout member`} onPress={() => { setDialog({ kind: "timeout", member: actions }); setActions(null); }} />
                )
              ) : null}
              <GroupRow first={!can.roles && !can.timeout} icon="copy" label={t`Copy user ID`} onPress={() => { void copyToClipboard(actions.id.user); setActions(null); }} />
            </RowGroup>
            {can.kick || can.ban ? (
              <RowGroup>
                {can.kick ? <GroupRow first icon="sign-out" danger label={t`Kick member`} onPress={() => { setDialog({ kind: "kick", member: actions }); setActions(null); }} /> : null}
                {can.ban ? <GroupRow first={!can.kick} icon="gavel" danger label={t`Ban member`} onPress={() => { setDialog({ kind: "ban", member: actions }); setActions(null); }} /> : null}
              </RowGroup>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {rolesFor ? <RolesSheet server={server} member={rolesFor} onClose={() => setRolesFor(null)} /> : null}

      <ConfirmDialog
        visible={!!dialog}
        danger={dialog?.kind !== "untimeout"}
        title={
          dialog?.kind === "timeout"
            ? t`Timeout member`
            : dialog?.kind === "untimeout"
              ? t`Remove timeout`
              : dialog?.kind === "kick"
                ? t`You are about to kick ${username}`
                : t`You are about to ban ${username}`
        }
        text={
          dialog?.kind === "timeout"
            ? t`${username} will not be able to interact with the server until the timeout expires.`
            : dialog?.kind === "untimeout"
              ? t`${username}'s timeout will be removed and they will be able to interact with the server again.`
              : undefined
        }
        confirm={dialog?.kind === "timeout" ? t`Timeout member` : dialog?.kind === "untimeout" ? t`Remove timeout` : dialog?.kind === "kick" ? t`Kick member` : t`Ban member`}
        onClose={() => {
          setDialog(null);
          setReason("");
        }}
        onConfirm={async () => {
          if (!dialog) return;
          const m = dialog.member;
          if (dialog.kind === "timeout") await m.setTimeout(new Date(Date.now() + timeoutFor * 1000).toISOString());
          else if (dialog.kind === "untimeout") await m.removeTimeout();
          else if (dialog.kind === "kick") {
            await m.kick(reason.trim() || undefined);
            setIds((list) => list.filter((x) => x !== m.id.user));
          } else {
            await m.ban({ reason: reason.trim() || undefined, delete_message_seconds: deleteFor || undefined } as never);
            setIds((list) => list.filter((x) => x !== m.id.user));
          }
        }}
      >
        {dialog?.kind === "timeout" ? <ChipChoice label={t`Duration`} value={timeoutFor} options={TIMEOUTS} onChange={setTimeoutFor} /> : null}
        {dialog?.kind === "kick" ? <TextField label={t`Reason (optional)`} placeholder={t`Shown in the audit log`} value={reason} onChangeText={setReason} maxLength={1024} /> : null}
        {dialog?.kind === "ban" ? (
          <>
            <TextField label={t`Reason`} placeholder={t`User broke a certain rule…`} value={reason} onChangeText={setReason} maxLength={1024} />
            <ChipChoice label={t`Delete message history`} value={deleteFor} options={HISTORY} onChange={setDeleteFor} />
          </>
        ) : null}
      </ConfirmDialog>
    </SettingsPage>
  );
}
