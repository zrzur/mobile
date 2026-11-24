import { useLingui } from "@lingui/react/macro";
import type { ServerMember, User } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Chip } from "@/ui/kit/Chip";

import { TIMEOUT_SECONDS, canToggleRole, moderationActions, toggledRoles } from "./logic";
import { RadioRow, StepButton, StepError, StepPanel } from "./StepPanel";
import { contrast } from "./theme";
import { type ProfileLayer, closeProfile, leaveLayer, showLayer } from "./store";
import { copyToClipboard } from "@/ui/kit/share";

/** What the menu needs to know, read live and as plain values */
function useMenuFacts(user: User, member: ServerMember | undefined, serverId: string | undefined) {
  const client = useClient();
  const u = useFields(user, (x) => ({
    // live, unlike x.self before the gateway is ready (see ProfileView)
    self: x.relationship === "User" || x.self,
    bot: !!x.bot,
    relationship: x.relationship,
    privileged: x.privileged,
    username: x.username,
    name: x.displayName,
    avatar: x.avatarURL,
    effect: x.style?.effect,
  }));
  const mod = useSolid(
    useCallback(() => {
      const server = serverId ? client.servers.get(serverId) : undefined;
      if (!server) return "";
      const mine = server.member;
      const m = member;
      return JSON.stringify({
        owner: !!server.owner?.self,
        inferior: !!(m && mine && m.inferiorTo(mine)),
        assignRoles: server.havePermission("AssignRoles"),
        timeout: server.havePermission("TimeoutMembers"),
        kick: server.havePermission("KickMembers"),
        ban: server.havePermission("BanMembers"),
        identityOwn: server.havePermission("ChangeNickname") || server.havePermission("ChangeAvatar"),
        memberKnown: !!client.serverMembers.getByKey({ server: server.id, user: user.id }),
        timedOut: !!(m?.timeout && m.timeout.getTime() > Date.now()),
      });
    }, [client, serverId, member, user]),
  );
  return { u, mod: mod ? (JSON.parse(mod) as Record<string, boolean>) : null };
}

/**
 * The user menu (web UserContextMenu, opened from a profile's "⋯"):
 * message, identity and roles, friend requests, moderation, then safety and
 * the ID. Every step opens in the same sheet.
 */
export function UserMenu({ user, member, serverId, fromProfile }: { user: User; member?: ServerMember; serverId?: string; fromProfile: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { u, mod } = useMenuFacts(user, member, serverId);
  const [error, setError] = useState<string>();
  if (!u) return null;
  const can = moderationActions({
    self: u.self,
    member: !!member,
    owner: !!mod?.owner,
    inferior: !!mod?.inferior,
    perms: { assignRoles: !!mod?.assignRoles, timeout: !!mod?.timeout, kick: !!mod?.kick, ban: !!mod?.ban, memberKnown: !!mod?.memberKnown },
  });
  const run = (action: () => Promise<unknown>, close = false) => {
    setError(undefined);
    action()
      .then(() => close && leaveLayer())
      .catch((err) => setError(describeError(err)));
  };
  const openDm = () =>
    run(async () => {
      const dm = await user.openDM();
      closeProfile();
      router.push({ pathname: "/channel/[id]", params: { id: dm.id } });
    });
  const go = (layer: ProfileLayer) => () => showLayer(layer);
  const wornEffect = u.effect?.startsWith("c:") ? u.effect.slice(2) : undefined;

  const groups: { key: string; rows: { key: string; icon: string; label: string; danger?: boolean; onPress: () => void }[] }[] = [];
  const quick = [];
  if (!fromProfile) quick.push({ key: "profile", icon: "user-circle", label: t`Profile`, onPress: go("profile") });
  if (u.relationship === "Friend" || u.bot || (!u.self && fromProfile)) quick.push({ key: "message", icon: "chat-circle", label: t`Message`, onPress: openDm });
  groups.push({ key: "quick", rows: quick });

  const identity = [];
  if (member && u.self && !fromProfile && mod?.identityOwn) identity.push({ key: "identity", icon: "user-edit", label: t`Edit your identity`, onPress: go("identity") });
  if (can.roles) identity.push({ key: "roles", icon: "identification-badge", label: t`Edit roles`, onPress: go("roles") });
  groups.push({ key: "identity", rows: identity });

  const social = [];
  if (!u.self && !u.bot) {
    if (u.relationship === "None") social.push({ key: "add", icon: "user-plus", label: t`Add friend`, onPress: () => run(() => user.addFriend()) });
    if (u.relationship === "Incoming") {
      social.push({ key: "accept", icon: "user-plus", label: t`Accept friend request`, onPress: () => run(() => user.addFriend()) });
      social.push({ key: "reject", icon: "x-circle", label: t`Reject friend request`, danger: true, onPress: () => run(() => user.removeFriend()) });
    }
    if (u.relationship === "Outgoing") social.push({ key: "cancel", icon: "x-circle", label: t`Cancel friend request`, danger: true, onPress: () => run(() => user.removeFriend()) });
  }
  groups.push({ key: "social", rows: social });

  const moderation = [];
  if (member && can.timeout) moderation.push(mod?.timedOut ? { key: "untimeout", icon: "timer", label: t`Remove timeout`, danger: true, onPress: go("untimeout") } : { key: "timeout", icon: "timer", label: t`Timeout member`, danger: true, onPress: go("timeout") });
  if (member && can.kick) moderation.push({ key: "kick", icon: "user-minus", label: t`Kick member`, danger: true, onPress: go("kick") });
  if (member && can.ban) moderation.push({ key: "ban", icon: "prohibit", label: t`Ban member`, danger: true, onPress: go("ban") });
  if (can.banUser) moderation.push({ key: "banUser", icon: "prohibit", label: t`Ban user`, danger: true, onPress: go("banUser") });
  groups.push({ key: "moderation", rows: moderation });

  const safety = [];
  if (!u.self) {
    if (u.relationship === "Friend") safety.push({ key: "remove", icon: "user-minus", label: t`Remove friend`, danger: true, onPress: () => run(() => user.removeFriend()) });
    if (u.relationship !== "Blocked") safety.push({ key: "block", icon: "prohibit", label: t`Block user`, danger: true, onPress: () => run(() => user.blockUser()) });
    else safety.push({ key: "unblock", icon: "plus-circle", label: t`Unblock user`, onPress: () => run(() => user.unblockUser()) });
    if (wornEffect) safety.push({ key: "reportEffect", icon: "flag", label: t`Report this effect`, danger: true, onPress: go("reportEffect") });
    if (!u.privileged) safety.push({ key: "report", icon: "flag", label: t`Report user`, danger: true, onPress: go("report") });
  }
  groups.push({ key: "safety", rows: safety });
  groups.push({
    key: "dev",
    rows: [
      {
        key: "copy",
        icon: "identification-card",
        label: t`Copy user ID`,
        onPress: () => {
          void copyToClipboard(user.id);
          leaveLayer();
        },
      },
    ],
  });

  return (
    <View testID="user-menu" style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar url={u.avatar} name={u.name} size={36} />
        <AText autoDir size={16} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }}>
          {u.name}
        </AText>
      </View>
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <RowGroup key={g.key}>
            {g.rows.map((r, i) => (
              <GroupRow key={r.key} testID={`user-menu-${r.key}`} first={i === 0} icon={r.icon as never} label={r.label} danger={r.danger} onPress={r.onPress} />
            ))}
          </RowGroup>
        ))}
      <StepError message={error} />
    </View>
  );
}

/** Give or take a member's roles; each tap saves (web UserProfileRoles) */
export function RolesPanel({ member }: { member: ServerMember }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [error, setError] = useState<string>();
  const f = useFields(member, (m) => ({
    name: m.displayName ?? m.user?.displayName ?? "",
    mine: m.roles,
    owner: !!m.server?.owner?.self,
    ranking: m.server?.member?.ranking ?? Number.MAX_SAFE_INTEGER,
    roles: (m.server?.orderedRoles ?? []).map((r) => ({ id: r.id, name: r.name, colour: r.colour, rank: r.rank, managed: r.isManaged })),
  }));
  if (!f) return null;
  const name = f.name;
  const toggle = async (roleId: string) => {
    setError(undefined);
    try {
      await member.edit({ roles: toggledRoles(f.mine, roleId, (id) => f.roles.some((r) => r.id === id)) } as never);
    } catch (err) {
      setError(describeError(err));
    }
  };
  return (
    <View testID="roles-panel" style={{ gap: 16 }}>
      <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
        {t`Edit ${name}'s roles`}
      </AText>
      <RowGroup>
        {f.roles.map((r, i) => {
          const on = f.mine.includes(r.id);
          const lock = !canToggleRole(r, f.owner, f.ranking);
          return (
            <Pressable
              key={r.id}
              testID={`role-toggle-${r.id}`}
              disabled={lock}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: lock }}
              aria-checked={on}
              onPress={() => void toggle(r.id)}
              style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider, opacity: lock ? 0.5 : 1, backgroundColor: pressed ? palette.navSelected : "transparent" })}
            >
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: on ? palette.accent : palette.borderStrong, backgroundColor: on ? palette.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on ? <Icon name="check" size={14} color={palette.onAccent} /> : null}
              </View>
              <AText size={16} line={22} weight="medium" color={r.colour && /^#[0-9a-f]{6}$/i.test(r.colour) && contrast(r.colour, palette.field) >= 4.5 ? r.colour : palette.fg} style={{ flex: 1 }} numberOfLines={1}>
                {r.name}
              </AText>
              {lock ? <Icon name="lock-simple" size={16} color={palette.muted} /> : null}
            </Pressable>
          );
        })}
      </RowGroup>
      <StepError message={error} />
      <View style={{ flexDirection: "row" }}>
        <StepButton testID="roles-close" label={t`Close`} onPress={leaveLayer} />
      </View>
    </View>
  );
}

/** Timeout, remove timeout, kick, ban (member) and ban (not a member) */
export function ModerationPanel({ kind, user, member, serverId }: { kind: "timeout" | "untimeout" | "kick" | "ban" | "banUser"; user: User; member?: ServerMember; serverId?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [history, setHistory] = useState(0);
  const username = useFields(user, (u) => u.username) ?? "";
  const avatar = useFields(user, (u) => u.avatarURL);
  const durations: Record<number, string> = {
    60: t`1 minute`,
    300: t`5 minutes`,
    600: t`10 minutes`,
    3600: t`1 hour`,
    86400: t`1 day`,
    604800: t`1 week`,
  };
  const HISTORY = [
    { value: 0, label: t`Don't delete messages` },
    { value: 3600, label: t`1 hour` },
    { value: 21600, label: t`6 hours` },
    { value: 86400, label: t`1 day` },
    { value: 259200, label: t`3 days` },
    { value: 604800, label: t`7 days` },
  ];
  const head = (
    <View style={{ alignItems: "center" }}>
      <Avatar url={avatar} name={username} size={64} />
    </View>
  );
  if (kind === "timeout" && member)
    return (
      <StepPanel
        testID="moderation-timeout"
        title={t`Timeout member`}
        text={t`${username} will not be able to interact with the server until the timeout expires.`}
        confirm={t`Timeout`}
        onCancel={leaveLayer}
        onConfirm={async () => {
          // the moment of the press, not of the render
          await member.setTimeout(new Date(Date.now() + seconds * 1000).toISOString());
          leaveLayer();
        }}
      >
        {head}
        <AText size={13} line={18} weight="semibold" color={palette.fg2}>
          {t`Duration`}
        </AText>
        <View accessibilityRole="radiogroup" accessibilityLabel={t`Duration`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TIMEOUT_SECONDS.map((s) => (
            <Chip key={s} testID={`timeout-${s}`} radio selected={seconds === s} label={durations[s]} onPress={() => setSeconds(s)} />
          ))}
        </View>
      </StepPanel>
    );
  if (kind === "untimeout" && member)
    return (
      <StepPanel
        testID="moderation-untimeout"
        tone="primary"
        title={t`Remove timeout`}
        text={t`${username}'s timeout will be removed and they will be able to interact with the server again.`}
        confirm={t`Remove timeout`}
        onCancel={leaveLayer}
        onConfirm={async () => {
          await member.removeTimeout();
          leaveLayer();
        }}
      />
    );
  if (kind === "kick" && member)
    return (
      <StepPanel
        testID="moderation-kick"
        title={t`Kick member`}
        confirm={t`Kick`}
        onCancel={leaveLayer}
        onConfirm={async () => {
          await member.kick(reason.trim() || undefined);
          closeProfile();
        }}
      >
        {head}
        <AText size={15} line={22} color={palette.fg2} style={{ textAlign: "center" }}>
          {t`You are about to kick ${username}`}
        </AText>
        <TextField testID="moderation-reason" label={t`Reason (optional)`} placeholder={t`Shown in the audit log`} value={reason} onChangeText={setReason} maxLength={1024} />
      </StepPanel>
    );
  if (kind === "ban" && member)
    return (
      <StepPanel
        testID="moderation-ban"
        title={t`Ban member`}
        confirm={t`Ban`}
        onCancel={leaveLayer}
        onConfirm={async () => {
          await member.ban({ reason: reason.trim() || undefined, delete_message_seconds: history || undefined } as never);
          closeProfile();
        }}
      >
        {head}
        <AText size={15} line={22} color={palette.fg2} style={{ textAlign: "center" }}>
          {t`You are about to ban ${username}`}
        </AText>
        <TextField testID="moderation-reason" label={t`Reason`} placeholder={t`User broke a certain rule…`} value={reason} onChangeText={setReason} maxLength={1024} />
        <AText size={13} line={18} weight="semibold" color={palette.fg2}>
          {t`Delete message history`}
        </AText>
        <RowGroup>
          {HISTORY.map((h, i) => (
            <RadioRow key={h.value} testID={`ban-history-${h.value}`} first={i === 0} label={h.label} checked={history === h.value} onPress={() => setHistory(h.value)} />
          ))}
        </RowGroup>
      </StepPanel>
    );
  if (kind === "banUser" && serverId)
    return (
      <StepPanel
        testID="moderation-ban-user"
        title={t`Ban user`}
        confirm={t`Ban`}
        onCancel={leaveLayer}
        onConfirm={async () => {
          const server = client.servers.get(serverId);
          if (!server) return;
          await server.banUser(user.id, { reason: reason.trim() || undefined } as never);
          leaveLayer();
        }}
      >
        {head}
        <AText size={15} line={22} color={palette.fg2} style={{ textAlign: "center" }}>
          {t`You are about to ban ${username}`}
        </AText>
        <AText size={14} line={20} color={palette.muted} style={{ textAlign: "center" }}>
          {t`This user is not part of the server and may already be banned`}
        </AText>
        <TextField testID="moderation-reason" label={t`Reason`} placeholder={t`User broke a certain rule…`} value={reason} onChangeText={setReason} maxLength={1024} />
      </StepPanel>
    );
  return null;
}
