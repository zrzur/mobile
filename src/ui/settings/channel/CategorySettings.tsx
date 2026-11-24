import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { describeError } from "@/auth/errorText";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { categoryChanges, isPrivate, leaksOutside, splitRoles, withoutCategory } from "../overrides";
import { ConfirmDialog, SaveBar, SettingsPage, SettingsSection, SmallButton } from "../parts";
import { EmptyCard, ListCategory, ListHead, ListRow, ListScreen, ScreenLoading } from "../server/controls";
import { NavRow, NoteRow, RoleDot, useCountsText } from "./ChannelPermissions";
import { type CategoryData, useCategoryData, useServerRoles } from "./data";
import { OverrideEditor } from "./OverrideEditor";
import { VisibilitySection } from "./Visibility";
import { editServer } from "@/ui/server/serverEdit";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Category › Overview: name and note (Reset / Save), then its channels */
function CategoryOverview({ server, data, onBack }: { server: Server; data: CategoryData; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const [title, setTitle] = useState(data.title);
  const [note, setNote] = useState(data.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [follow, setFollow] = useState<string[] | null>(null);
  const can = data.manageChannel;
  const changes = categoryChanges({ title: data.title, description: data.description }, { title, description: note });
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    if (!title.trim()) return setError(t`Please fill in this field.`);
    setSaving(true);
    setError(undefined);
    try {
      // SDK 2.0.0 has no editCategory: the route directly
      await client.api.patch(`/servers/${server.id}/categories/${data.id}` as never, changes as never);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const own = data.channels.filter((c) => !c.synced && c.canSync);
  const followNames = (follow ?? []).map((id) => data.channels.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
  const hidden = data.hidden;

  return (
    <SettingsPage
      title={t`Overview`}
      backLabel={data.title}
      onBack={onBack}
      testID="category-overview"
      footer={
        can ? (
          <SaveBar
            dirty={dirty}
            saving={saving}
            error={error}
            onReset={() => {
              setTitle(data.title);
              setNote(data.description);
              setError(undefined);
            }}
            onSave={save}
          />
        ) : null
      }
    >
      <SettingsSection title={t`Category info`}>
        <View style={{ gap: 16, opacity: can ? 1 : 0.6 }}>
          <TextField testID="category-name" label={t`Category name`} value={title} onChangeText={setTitle} maxLength={32} editable={can} helper={`${[...title].length}/32`} />
          <TextField testID="category-note" label={t`Note (optional)`} placeholder={t`One short line about this category`} value={note} onChangeText={setNote} maxLength={120} editable={can} helper={`${[...note].length}/120`} />
        </View>
      </SettingsSection>

      <SettingsSection
        title={t`Channels in this category`}
        description={t`A channel follows the category's permissions until you change permissions on the channel itself.`}
        aside={
          own.length > 1 ? (
            <Pressable testID="category-follow-all" accessibilityRole="button" onPress={() => setFollow(own.map((c) => c.id))} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center", backgroundColor: pressed ? palette.navHover : "transparent" })}>
              <AText size={14} line={20} weight="semibold" color={palette.accentText}>
                {t`Make all follow`}
              </AText>
            </Pressable>
          ) : undefined
        }
      >
        {data.channels.length === 0 ? (
          <EmptyCard icon="folder" title={t`No channels in this category yet.`} />
        ) : (
          <RowGroup>
            {data.channels.map((c, i) => {
              const channelName = c.name;
              return (
                <NoteRow
                  key={c.id}
                  first={i === 0}
                  testID={`category-channel-${c.id}`}
                  icon={c.voice ? "speaker-high" : "hash"}
                  title={c.name}
                  description={c.synced ? t`Follows the category` : t`Own permissions`}
                  control={
                    !c.synced && c.canSync ? (
                      <SmallButton testID={`category-channel-follow-${c.id}`} label={t`Follow category`} accessibilityLabel={t`Make ${channelName} follow the category`} onPress={() => setFollow([c.id])} />
                    ) : null
                  }
                />
              );
            })}
          </RowGroup>
        )}
        {hidden > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }}>
            <Icon name="lock-simple" size={16} color={palette.iconMuted} />
            <AText size={13} line={18} color={palette.muted} style={{ flex: 1 }}>
              {t`Channels here that are hidden from you: ${hidden}`}
            </AText>
          </View>
        ) : null}
      </SettingsSection>

      <ConfirmDialog
        visible={!!follow}
        title={t`Follow the category?`}
        text={t`The channel's own permissions for everyone and for roles are removed and it uses the category's. Member overrides stay.`}
        confirm={t`Follow category`}
        onClose={() => setFollow(null)}
        onConfirm={async () => {
          for (const id of follow ?? []) {
            const channel = client.channels.get(id);
            if (channel) await channel.syncPermissions();
          }
        }}
      >
        <AText size={15} line={22} weight="semibold" color={palette.fg}>
          {followNames}
        </AText>
      </ConfirmDialog>
    </SettingsPage>
  );
}

/** Category › Permissions: who can see it, default and role overrides */
function CategoryPermissions({ server, data, onBack, onOverview }: { server: Server; data: CategoryData; onBack: () => void; onOverview: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const info = useServerRoles(server);
  const counts = useCountsText();
  const [open, setOpen] = useState<string | null>(null);
  if (!info) return null;
  const back = t`Permissions`;
  const save = (target: string) => (value: { allow: number; deny: number }) => server.setCategoryPermissions(data.id, target, value);

  if (open === "default")
    return <OverrideEditor key="default" testID="category-override-default" title={t`Everyone`} backLabel={back} initial={data.inForce.everyone} held={data.held} variant="category" onSave={save("default")} onBack={() => setOpen(null)} />;
  const openRole = open ? info.roles.find((r) => r.id === open) : undefined;
  if (openRole)
    return (
      <OverrideEditor
        key={openRole.id}
        testID="category-override-role"
        title={openRole.name}
        backLabel={back}
        initial={data.inForce.roles[openRole.id] ?? { a: 0n, d: 0n }}
        held={data.held}
        variant="category"
        onSave={save(openRole.id)}
        onBack={() => setOpen(null)}
      />
    );

  const privateCategory = isPrivate(info.serverDefault, data.inForce.everyone);
  const leaking = privateCategory ? data.channels.filter((c) => !c.synced && leaksOutside(info.serverDefault, data.inForce, c.own, info.roles)) : [];
  const leakNames = leaking.map((c) => c.name).join(", ");
  const { withOverrides, without } = splitRoles(info.roles, data.inForce.roles);

  return (
    <SettingsPage title={t`Permissions`} backLabel={data.title} onBack={onBack} testID="category-permissions">
      <VisibilitySection
        testID="category"
        serverDefault={info.serverDefault}
        roles={info.roles}
        overrides={data.inForce}
        canEdit={data.managePermissions}
        setPermissions={(target, value) => server.setCategoryPermissions(data.id, target, value)}
        words={{
          title: t`Who can see this category`,
          privateTitle: t`Private category`,
          privateOn: t`Hidden from everyone except the roles you let in below. Its name stays visible to people who can see a channel inside it, and to those who manage channels or permissions or read the audit log.`,
          privateOff: t`Everyone in the server can see it.`,
          administrator: t`Administrator: sees every category`,
          roleSees: t`Can see this category`,
          roleHidden: t`Can't see this category`,
          owner: t`The server owner and whoever manages channels or permissions see every category.`,
          hideFrom: (role) => t`Hide this category from ${role}`,
          letIn: (role) => t`Let ${role} see this category`,
        }}
      />

      {leaking.length ? (
        <RowGroup>
          <Pressable testID="category-leak-warning" accessibilityRole="button" onPress={onOverview} style={({ pressed }) => ({ flexDirection: "row", gap: 14, alignItems: "center", minHeight: 56, padding: 14, backgroundColor: pressed ? palette.navSelected : "transparent" })}>
            <Icon name="warning" size={20} color="#F5B84B" />
            <View style={{ flex: 1, gap: 2 }}>
              <AText size={16} line={22} weight="medium" color={palette.fg}>
                {t`Some channels here can be seen by people outside this category`}
              </AText>
              <AText size={13} line={18} color={palette.muted}>
                {t`They have their own permissions: ${leakNames}. Make them follow the category in Overview.`}
              </AText>
            </View>
            <Icon name="caret-right" size={16} color={palette.iconMuted} />
          </Pressable>
        </RowGroup>
      ) : null}

      <SettingsSection title={t`Default permissions`} description={t`Channels that follow this category use these permissions.`}>
        <RowGroup>
          <NavRow first testID="category-perm-default" lead={<Icon name="users" size={20} color={palette.iconNeutral} />} title={t`Everyone`} description={t`Permissions available when no role overrides apply`} onPress={() => setOpen("default")} />
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
              <NavRow key={r.id} first={i === 0} testID={`category-perm-role-${r.id}`} lead={<RoleDot colour={r.colour} />} title={r.name} titleColour={HEX.test(r.colour ?? "") ? r.colour : undefined} description={counts(data.inForce.roles[r.id])} onPress={() => setOpen(r.id)} />
            ))}
          </RowGroup>
        )}
      </SettingsSection>

      {without.length ? (
        <SettingsSection title={t`Roles with No Overrides`}>
          <RowGroup>
            {without.map((r, i) => (
              <NavRow key={r.id} first={i === 0} testID={`category-perm-role-${r.id}`} lead={<RoleDot colour={r.colour} />} title={r.name} titleColour={HEX.test(r.colour ?? "") ? r.colour : undefined} description={t`No permissions set yet`} onPress={() => setOpen(r.id)} />
            ))}
          </RowGroup>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

/**
 * Category settings (web: CategorySettings.tsx): a card, Overview,
 * Permissions and Delete category; sub-pages in local state.
 */
export function CategorySettings({ server, categoryId }: { server: Server; categoryId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const data = useCategoryData(server, categoryId);
  const info = useServerRoles(server);
  const [page, setPage] = useState<"overview" | "permissions" | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (data === undefined) return <ScreenLoading />;

  if (!data || !(data.manageChannel || data.managePermissions)) {
    return (
      <SettingsPage title={t`Category settings`} testID="category-settings">
        <RowGroup>
          <NoteRow first testID="category-gone" icon="folder" title={t`This category is no longer here.`} description={t`It was deleted, or you can no longer see it.`} />
        </RowGroup>
      </SettingsPage>
    );
  }

  if (page === "overview") return <CategoryOverview server={server} data={data} onBack={() => setPage(null)} />;
  if (page === "permissions") return <CategoryPermissions server={server} data={data} onBack={() => setPage(null)} onOverview={() => setPage("overview")} />;

  const locked = info ? isPrivate(info.serverDefault, data.inForce.everyone) : false;

  return (
    <ListScreen testID="category-settings">
      {/* the same list as server and channel settings: Back, the card, the pages */}
      <ListHead
        backTestID="settings-back"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        leading={
          <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
            <Icon name={locked ? "lock-simple" : "folder"} size={20} color={palette.fg2} />
          </View>
        }
        name={data.title}
        sub={t`Category settings`}
      />

      <ListCategory title={t`General`}>
        <ListRow first testID="category-settings-overview" icon="info" title={t`Overview`} onPress={() => setPage("overview")} />
      </ListCategory>

      {data.managePermissions ? (
        <ListCategory title={t`Access`}>
          <ListRow first testID="category-settings-permissions" icon="shield-check" title={t`Permissions`} onPress={() => setPage("permissions")} />
        </ListCategory>
      ) : null}

      {data.manageChannel ? (
        <ListCategory>
          <ListRow first danger testID="category-settings-delete" icon="trash" title={t`Delete category`} onPress={() => setDeleting(true)} />
        </ListCategory>
      ) : null}

      <ConfirmDialog
        visible={deleting}
        title={t`Delete category`}
        text={t`Its channels stay, and the same people keep seeing them. Once the category is deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await editServer(server, (s) => ({ categories: withoutCategory(s.categories, data.id) }));
          if (router.canGoBack()) router.back();
        }}
      />
    </ListScreen>
  );
}

