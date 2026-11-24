import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";

import { hasOverride, overrideCounts, type Pair, splitRoles } from "../overrides";
import { ConfirmDialog, SettingsPage, SettingsSection, SmallButton } from "../parts";
import { type ChannelData, useServerRoles } from "./data";
import { OverrideEditor } from "./OverrideEditor";
import { MemberPickerSheet, memberName } from "./MemberPickerSheet";
import { ChannelPeople, VisibilitySection } from "./Visibility";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A tappable row with a lead (icon, dot or avatar), title, description and a chevron */
export function NavRow({ first, lead, title, titleColour, description, onPress, testID }: { first?: boolean; lead?: React.ReactNode; title: string; titleColour?: string; description?: string; onPress?: () => void; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      {lead ? <View style={{ width: 24, alignItems: "center" }}>{lead}</View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={titleColour ?? palette.fg} numberOfLines={1}>
          {title}
        </AText>
        {description ? (
          <AText size={13} line={18} color={palette.muted}>
            {description}
          </AText>
        ) : null}
      </View>
      <Icon name="caret-right" size={16} color={palette.iconMuted} />
    </Pressable>
  );
}

/** A plain row with an icon (notes, follow state) */
export function NoteRow({ first, icon, title, description, control, testID }: { first?: boolean; icon: IconName; title: string; description?: string; control?: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <Icon name={icon} size={20} color={palette.iconNeutral} />
      <View style={{ flex: 1, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg}>
          {title}
        </AText>
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

export function RoleDot({ colour }: { colour?: string }) {
  const { palette } = useTheme();
  const solid = HEX.test(colour ?? "");
  return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: solid ? colour : "transparent", borderWidth: solid ? 0 : 1, borderColor: palette.borderStrong }} />;
}

/** "Grants n permissions and denies n permissions" */
export function useCountsText() {
  const { t } = useLingui();
  return (value?: Pair) => {
    const { granted, denied } = overrideCounts(value);
    return t`Grants ${granted} permissions and denies ${denied} permissions`;
  };
}

/**
 * Channel › Permissions (web: ChannelPermissionsOverview): who can see it,
 * the category it follows, then the overrides; each opens its editor here.
 */
export function ChannelPermissions({ channel, data, onBack }: { channel: Channel; data: ChannelData; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = channel.server;
  const info = useServerRoles(server);
  const counts = useCountsText();
  const self = useSelfId();
  const [open, setOpen] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  /** adding a person: the member picker is open */
  const [adding, setAdding] = useState(false);
  /** names of people picked to add, until the member cache has them */
  const [picked, setPicked] = useState<Record<string, string>>({});

  if (!info) return null;
  const roles = info.roles;
  const channelName = data.name;
  const kind = { voice: data.voice, forum: data.forum };
  const back = t`Permissions`;

  if (open === "default")
    return (
      <OverrideEditor
        key="default"
        testID="channel-override-default"
        title={t`Everyone`}
        backLabel={back}
        initial={data.own.everyone}
        held={data.held}
        variant="channel"
        kind={kind}
        onSave={(v) => channel.setPermissions(undefined, v)}
        onBack={() => setOpen(null)}
      />
    );
  if (open?.startsWith("@")) {
    const userId = open.slice(1);
    const member = server ? client.serverMembers.getByKey({ server: server.id, user: userId }) : undefined;
    const name = member?.displayName ?? member?.user?.displayName ?? picked[userId] ?? client.users.get(userId)?.displayName ?? t`Member`;
    return (
      <OverrideEditor
        key={open}
        testID="channel-override-member"
        title={name}
        backLabel={back}
        initial={data.members[userId] ?? { a: 0n, d: 0n }}
        held={data.held}
        variant="channel"
        kind={kind}
        onSave={(v) => channel.setMemberPermissions(userId, v)}
        onBack={() => setOpen(null)}
        remove={data.managePermissions && hasOverride(data.members[userId]) ? { label: t`Remove ${name}'s own permissions` } : undefined}
      />
    );
  }
  const openRole = open ? roles.find((r) => r.id === open) : undefined;
  if (openRole)
    return (
      <OverrideEditor
        key={openRole.id}
        testID="channel-override-role"
        title={openRole.name}
        backLabel={back}
        initial={data.inForce.roles[openRole.id] ?? { a: 0n, d: 0n }}
        held={data.held}
        variant="channel"
        kind={kind}
        onSave={(v) => channel.setPermissions(openRole.id, v)}
        onBack={() => setOpen(null)}
      />
    );

  const { withOverrides, without } = splitRoles(roles, data.inForce.roles);
  const memberRows = Object.entries(data.members).filter(([, v]) => hasOverride(v));
  const categoryTitle = data.categoryTitle ?? "";
  const parentName = data.parentName;

  return (
    <SettingsPage title={t`Permissions`} backLabel={channelName} onBack={onBack} testID="channel-permissions">
      {data.parentId ? (
        <SettingsSection title={t`Who can see this channel`}>
          <RowGroup>
            <NoteRow first testID="channel-visibility-thread" icon="link" title={parentName ? t`This thread follows who can see #${parentName}.` : t`This thread follows who can see its channel.`} />
          </RowGroup>
        </SettingsSection>
      ) : (
        <VisibilitySection
          testID="channel"
          serverDefault={info.serverDefault}
          roles={roles}
          overrides={data.inForce}
          canEdit={data.managePermissions}
          setPermissions={(target, value) => channel.setPermissions(target === "default" ? undefined : target, value)}
          more={({ isPrivate }) => <ChannelPeople channel={channel} members={data.members} isPrivate={isPrivate} canEdit={data.managePermissions} ownerId={info.ownerId} />}
          words={{
            title: t`Who can see this channel`,
            privateTitle: t`Private channel`,
            privateOn: t`Only the roles you let in below can see it.`,
            privateOff: t`Everyone in the server can see it.`,
            administrator: t`Administrator: sees every channel`,
            roleSees: t`Can see this channel`,
            roleHidden: t`Can't see this channel`,
            owner: t`The server owner sees every channel.`,
            hideFrom: (role) => t`Hide this channel from ${role}`,
            letIn: (role) => t`Let ${role} see this channel`,
          }}
        />
      )}

      {data.categoryId ? (
        <SettingsSection title={t`Category`}>
          <RowGroup>
            {data.synced ? (
              <NoteRow first testID="channel-follows-category" icon="link" title={t`Follows ${categoryTitle}`} description={t`Permissions come from the category. Changing one here stops following it.`} />
            ) : (
              <NoteRow
                first
                testID="channel-own-permissions"
                icon="link"
                title={t`Does not follow ${categoryTitle}`}
                description={t`This channel uses its own permissions.`}
                control={data.managePermissions ? <SmallButton testID="channel-follow-category" label={t`Follow category`} onPress={() => setFollowing(true)} /> : null}
              />
            )}
          </RowGroup>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t`Default permissions`}>
        <RowGroup>
          <NavRow first testID="channel-perm-default" lead={<Icon name="users" size={20} color={palette.iconNeutral} />} title={t`Everyone`} description={t`Permissions available when no role overrides apply`} onPress={() => setOpen("default")} />
        </RowGroup>
      </SettingsSection>

      <SettingsSection title={t`Role overrides`}>
        {withOverrides.length === 0 ? (
          <AText size={14} line={20} color={palette.muted}>
            {t`No role overrides have been configured.`}
          </AText>
        ) : (
          <RowGroup>
            {withOverrides.map((r, i) => (
              <NavRow key={r.id} first={i === 0} testID={`channel-perm-role-${r.id}`} lead={<RoleDot colour={r.colour} />} title={r.name} titleColour={HEX.test(r.colour ?? "") ? r.colour : undefined} description={counts(data.inForce.roles[r.id])} onPress={() => setOpen(r.id)} />
            ))}
          </RowGroup>
        )}
      </SettingsSection>

      {/* web: Member overrides; adding one picks a person, then opens their editor */}
      {memberRows.length || (data.managePermissions && server) ? (
        <SettingsSection title={t`Member overrides`}>
          <RowGroup>
            {memberRows.map(([id, value], i) => {
              const member = server ? client.serverMembers.getByKey({ server: server.id, user: id }) : undefined;
              const name = member?.displayName ?? member?.user?.displayName ?? client.users.get(id)?.displayName ?? t`Member`;
              return <NavRow key={id} first={i === 0} testID={`channel-perm-member-${id}`} lead={<Avatar url={member?.avatarURL ?? member?.user?.avatarURL} name={name} size={22} />} title={name} description={counts(value)} onPress={() => setOpen(`@${id}`)} />;
            })}
            {data.managePermissions && server ? (
              <NavRow
                first={memberRows.length === 0}
                testID="channel-perm-member-add"
                lead={<Icon name="user-plus" size={20} color={palette.iconNeutral} />}
                title={t`Add people`}
                description={t`Give one person their own permissions here, on top of their roles.`}
                onPress={() => setAdding(true)}
              />
            ) : null}
          </RowGroup>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t`Roles with No Overrides`}>
        {without.length === 0 ? (
          <AText size={14} line={20} color={palette.muted}>
            {t`All roles have overrides.`}
          </AText>
        ) : (
          <RowGroup>
            {without.map((r, i) => (
              <NavRow key={r.id} first={i === 0} testID={`channel-perm-role-${r.id}`} lead={<RoleDot colour={r.colour} />} title={r.name} titleColour={HEX.test(r.colour ?? "") ? r.colour : undefined} description={t`No permissions set yet`} onPress={() => setOpen(r.id)} />
            ))}
          </RowGroup>
        )}
      </SettingsSection>

      {server ? (
        <MemberPickerSheet
          server={server}
          visible={adding}
          title={t`Add people`}
          // people with an override already have a row; the owner has every permission
          exclude={[...memberRows.map(([id]) => id), self, info.ownerId]}
          onPick={(m) => {
            setPicked((now) => ({ ...now, [m.id.user]: memberName(m) }));
            setAdding(false);
            setOpen(`@${m.id.user}`);
          }}
          onClose={() => setAdding(false)}
          testID="channel-perm-member-picker"
        />
      ) : null}

      <ConfirmDialog
        visible={following}
        title={t`Follow ${categoryTitle}?`}
        text={t`The channel's own permissions for everyone and for roles are removed and it uses the category's. Member overrides stay.`}
        confirm={t`Follow category`}
        onClose={() => setFollowing(false)}
        onConfirm={async () => {
          await channel.syncPermissions();
        }}
      />
    </SettingsPage>
  );
}
