import { useLingui } from "@lingui/react/macro";
import type { Channel, ServerMember } from "@zrzur/sdk/solid";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSelfId } from "@/client/hooks";
import { describeError, errorDetails } from "@/auth/errorText";
import { toAuthError } from "@/auth/flow";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, ErrorBox } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";

import {
  accessErrorKind,
  everyoneOverride,
  isAdministrator,
  isPrivate as isPrivateWith,
  listedPeople,
  memberAdd,
  memberRemove,
  type Pair,
  roleOverride,
  sees,
  toOverride,
} from "../overrides";
import { InlineError, SettingsSection, SmallButton, Toggle } from "../parts";
import type { RoleInfo } from "./data";
import { MemberPickerSheet } from "./MemberPickerSheet";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The words of the section: a channel and a category say it differently */
export type VisibilityWords = {
  title: string;
  privateTitle: string;
  privateOn: string;
  privateOff: string;
  administrator: string;
  roleSees: string;
  roleHidden: string;
  owner: string;
  hideFrom: (role: string) => string;
  letIn: (role: string) => string;
};

/** A row of the section: icon or dot, title, description, a control at the end */
function Row({ first, lead, title, titleColour, description, control, testID, extra, wrap }: { first?: boolean; lead: ReactNode; title: string; titleColour?: string; description?: string; control?: ReactNode; testID?: string; extra?: ReactNode; /** a note: the whole sentence, never cut */ wrap?: boolean }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ width: 24, alignItems: "center" }}>{lead}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={titleColour ?? palette.fg} numberOfLines={wrap ? undefined : 2}>
          {title}
        </AText>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
        {extra}
      </View>
      {control}
    </View>
  );
}

/**
 * Who can see a channel or a category, worked out the way the API does:
 * one switch to make it private and one button per role (web: VisibilitySection)
 */
export function VisibilitySection({
  serverDefault,
  roles,
  overrides,
  setPermissions,
  canEdit,
  words,
  testID,
  more,
}: {
  serverDefault: bigint;
  roles: RoleInfo[];
  overrides: { everyone: Pair; roles: Record<string, Pair> };
  setPermissions: (target: string, value: { allow: number; deny: number }) => Promise<unknown>;
  canEdit: boolean;
  words: VisibilityWords;
  /** "channel" or "category" */
  testID: string;
  more?: (state: { isPrivate: boolean }) => ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const isPrivate = isPrivateWith(serverDefault, overrides.everyone);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(undefined);
    }
  };

  const setPrivate = (on: boolean) => run("everyone", () => setPermissions("default", toOverride(everyoneOverride(overrides.everyone, on))));
  const setRole = (role: RoleInfo, see: boolean) =>
    run(role.id, () => setPermissions(role.id, toOverride(roleOverride(serverDefault, overrides.everyone, { permissions: role.permissions, override: overrides.roles[role.id] }, see))));

  return (
    <SettingsSection title={words.title}>
      <RowGroup>
        <Row
          first
          testID={`${testID}-private-row`}
          lead={<Icon name={isPrivate ? "lock-simple" : "globe"} size={20} color={palette.iconNeutral} />}
          title={words.privateTitle}
          description={isPrivate ? words.privateOn : words.privateOff}
          extra={<InlineError message={error} />}
          control={<Toggle testID={`${testID}-private-toggle`} label={words.privateTitle} value={isPrivate} disabled={!canEdit || !!busy} onChange={(on) => void setPrivate(on)} />}
        />
        {roles.map((role) => {
          const admin = isAdministrator(role.permissions.a);
          const visible = sees(serverDefault, overrides.everyone, { permissions: role.permissions, override: overrides.roles[role.id] });
          const roleName = role.name;
          return (
            <Row
              key={role.id}
              testID={`${testID}-role-${role.id}`}
              lead={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: HEX.test(role.colour ?? "") ? role.colour : "transparent", borderWidth: role.colour ? 0 : 1, borderColor: palette.borderStrong }} />}
              title={role.name}
              titleColour={HEX.test(role.colour ?? "") ? role.colour : undefined}
              description={admin ? words.administrator : visible ? words.roleSees : words.roleHidden}
              control={
                admin || !canEdit ? null : busy === role.id ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : visible ? (
                  <Pressable
                    testID={`${testID}-role-${role.id}-hide`}
                    accessibilityRole="button"
                    accessibilityLabel={words.hideFrom(roleName)}
                    disabled={!!busy}
                    onPress={() => void setRole(role, false)}
                    style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }}
                  >
                    <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                      {t`Hide`}
                    </AText>
                  </Pressable>
                ) : (
                  <SmallButton testID={`${testID}-role-${role.id}-let-in`} label={t`Let in`} accessibilityLabel={words.letIn(roleName)} disabled={!!busy} onPress={() => void setRole(role, true)} />
                )
              }
            />
          );
        })}
        {more?.({ isPrivate })}
        <Row wrap lead={<Icon name="crown" size={20} color={palette.iconNeutral} />} title={words.owner} />
      </RowGroup>
    </SettingsSection>
  );
}

type Person = { name: string; avatar?: string };

function personOf(m: ServerMember): Person {
  return { name: m.displayName ?? m.user?.displayName ?? m.user?.username ?? "", avatar: m.avatarURL ?? m.user?.avatarURL };
}

/** The plain words for a refused access change (web: VisibilityPeople) */
export function useAccessMessage() {
  const { t } = useLingui();
  return (err: unknown) => {
    switch (accessErrorKind(toAuthError(err).type)) {
      case "missing":
        return t`You need “Manage permissions” to change who can see this channel.`;
      case "elevated":
        return t`You can't change access for someone ranked the same as you or above you.`;
      case "give":
        return t`You can't give permissions you don't have yourself.`;
      case "gone":
        return t`This person is no longer in the server.`;
      default:
        return describeError(err);
    }
  };
}

/**
 * The channel's people with access of their own: let in one by one on a
 * private channel, kept out of an open one (rows inside the visibility group)
 */
export function ChannelPeople({ channel, members, isPrivate, canEdit, ownerId }: { channel: Channel; members: Record<string, Pair>; isPrivate: boolean; canEdit: boolean; ownerId?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const client = useClient();
  const self = useSelfId();
  const message = useAccessMessage();
  const people = useMemo(() => listedPeople(members, isPrivate), [members, isPrivate]);
  const peopleKey = people.join(",");
  const [known, setKnown] = useState<Record<string, Person | null>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [picking, setPicking] = useState(false);

  // names and pictures of the listed people, asked for once each
  useEffect(() => {
    const server = channel.server;
    if (!server) return;
    for (const id of peopleKey ? peopleKey.split(",") : []) {
      if (client.serverMembers.getByKey({ server: server.id, user: id })) continue;
      server
        .fetchMember(id)
        .then((m) => setKnown((now) => ({ ...now, [id]: personOf(m) })))
        .catch(() => setKnown((now) => ({ ...now, [id]: null })));
    }
  }, [channel, client, peopleKey]);

  const personFor = (id: string): Person | null | undefined => {
    const cached = channel.serverId ? client.serverMembers.getByKey({ server: channel.serverId, user: id }) : undefined;
    return cached ? personOf(cached) : known[id];
  };

  const nameOf = (id: string) => {
    const p = personFor(id);
    if (p === null) return t`A member who left`;
    return p?.name || client.users.get(id)?.displayName || t`Member`;
  };

  const save = async (id: string, next: Pair) => {
    setBusy(id);
    setError(undefined);
    try {
      await channel.setMemberPermissions(id, toOverride(next));
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const add = async (member: ServerMember) => {
    const id = member.id.user;
    const name = member.displayName ?? member.user?.displayName ?? member.user?.username ?? t`Member`;
    setKnown((now) => ({ ...now, [id]: personOf(member) }));
    if (!(await save(id, memberAdd(members[id])))) return;
    setPicking(false);
    AccessibilityInfo.announceForAccessibility(t`${name} was added to the list`);
  };

  const remove = async (id: string) => {
    const name = nameOf(id);
    if (!(await save(id, memberRemove(members[id])))) return;
    AccessibilityInfo.announceForAccessibility(t`${name} was removed from the list`);
  };

  if (!isPrivate && people.length === 0) return null;

  return (
    <>
      <Row
        testID="channel-people"
        lead={<Icon name="users" size={20} color={palette.iconNeutral} />}
        title={t`People`}
        description={isPrivate ? t`People you add here can see it, whatever their roles.` : t`These people can't see it, whatever their roles allow.`}
        control={isPrivate && canEdit ? <SmallButton testID="channel-people-add" label={picking ? t`Close` : t`Add people`} onPress={() => setPicking((v) => !v)} /> : null}
      />
      {error && !picking ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <ErrorBox message={message(error)} details={errorDetails(toAuthError(error))} />
        </View>
      ) : null}
      {people.map((id) => {
        const name = nameOf(id);
        const p = personFor(id);
        return (
          <Row
            key={id}
            testID={`channel-person-${id}`}
            lead={<Avatar url={p?.avatar} name={name} size={24} />}
            title={name}
            description={isPrivate ? t`Can see this channel` : t`Can't see this channel`}
            control={
              canEdit && id !== self ? (
                busy === id ? (
                  <ActivityIndicator size="small" color={palette.accent} />
                ) : (
                  <Pressable
                    testID={`channel-person-remove-${id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t`Remove ${name} from this list`}
                    disabled={!!busy}
                    onPress={() => void remove(id)}
                    style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }}
                  >
                    <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                      {t`Remove`}
                    </AText>
                  </Pressable>
                )
              ) : null
            }
          />
        );
      })}
      {channel.server ? (
        <MemberPickerSheet
          server={channel.server}
          visible={picking}
          title={t`Add people`}
          exclude={[...people, self, ownerId]}
          busy={busy}
          error={error ? <ErrorBox message={message(error)} details={errorDetails(toAuthError(error))} /> : null}
          onPick={(m) => void add(m)}
          onClose={() => setPicking(false)}
          testID="channel-people-picker"
        />
      ) : null}
    </>
  );
}
