import { useLingui } from "@lingui/react/macro";
import type { Server, ServerRole } from "@zrzur/sdk/solid";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { DARK, LIGHT } from "@/theme/palette";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, Sheet } from "@/ui/app/parts";
import { AText, TextField } from "@/ui/auth/parts";
import { Button, Chip } from "@/ui/kit";
import { describeError } from "@/auth/errorText";
import { Icon } from "@/ui/Icon";

import { PermissionList } from "../PermissionEditor";
import { ConfirmDialog, ControlRow, SaveBar, SettingsPage, SettingsSection, Toggle } from "../parts";
import { EmptyCard, RowTool } from "./controls";
import { copyToClipboard } from "@/ui/kit/share";

/** Colours offered for a role; any hex can be typed too */
const SWATCHES = ["#E0195F", "#FF7AA8", "#C2337A", "#F27488", "#F5B84B", "#55DCC8", "#3FB37F", "#64A9FF", "#8E8CF8", "#B5B6BD"];
const HEX = /^#[0-9a-fA-F]{6}$/;

type RoleView = { id: string; name: string; colour?: string; rank: number; icon?: string };

function useRoles(server: Server) {
  const json = useSolid(
    useCallback(
      () =>
        JSON.stringify(
          server.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour, rank: r.rank, icon: r.icon?.createFileURL?.() })),
        ),
      [server],
    ),
  );
  return useMemo(() => JSON.parse(json) as RoleView[], [json]);
}

/** The colour as text colour: gradients and odd values fall back to fg */
function textColour(colour: string | undefined, fallback: string) {
  return colour && HEX.test(colour) ? colour : fallback;
}

/** Role editor (web: ServerRoleEditor): one save bar for the form and permissions */
function RoleEditor({ server, role, locked, onBack }: { server: Server; role: ServerRole; locked: boolean; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const roleName = role.name;
  const [name, setName] = useState(role.name);
  const [colour, setColour] = useState(role.colour ?? "");
  const [hoist, setHoist] = useState(role.hoist);
  const [icon, setIcon] = useState<{ uri: string; name: string; type: string } | null | undefined>(undefined);
  const [allow, setAllow] = useState(role.permissions.a);
  const [deny, setDeny] = useState(role.permissions.d);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<"dark" | "light">("dark");

  const dirty =
    name !== role.name || colour !== (role.colour ?? "") || hoist !== role.hoist || icon !== undefined || allow !== role.permissions.a || deny !== role.permissions.d;

  const reset = () => {
    setName(role.name);
    setColour(role.colour ?? "");
    setHoist(role.hoist);
    setIcon(undefined);
    setAllow(role.permissions.a);
    setDeny(role.permissions.d);
    setError(undefined);
  };

  const save = async () => {
    if (!name.trim()) return setError(t`Please fill in this field.`);
    if (colour && !HEX.test(colour)) return setError(t`Use a colour like #E0195F.`);
    setSaving(true);
    setError(undefined);
    try {
      const data: Record<string, unknown> = {};
      const remove: string[] = [];
      if (name.trim() !== role.name) data.name = name.trim();
      if (colour !== (role.colour ?? "")) {
        if (colour) data.colour = colour;
        else remove.push("Colour");
      }
      if (hoist !== role.hoist) data.hoist = hoist;
      if (icon === null) remove.push("Icon");
      else if (icon) data.icon = await client.uploadFile("icons", icon as unknown as File);
      if (remove.length) data.remove = remove;
      if (Object.keys(data).length) await server.editRole(role.id, data as never);
      if (allow !== role.permissions.a || deny !== role.permissions.d) await server.setPermissions(role.id, { allow: Number(allow), deny: Number(deny) });
      onBack();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const shownIcon = icon === null ? undefined : icon ? icon.uri : role.icon?.createFileURL?.();
  // the preview shows the name on each app theme, whichever theme is on now
  const previewTheme = preview === "dark" ? DARK : LIGHT;

  return (
    <SettingsPage
      title={`${t`Roles`} › ${role.name}`}
      backLabel={t`Roles`}
      onBack={onBack}
      testID="role-editor"
      footer={locked ? null : <SaveBar dirty={dirty} saving={saving} error={error} onReset={reset} onSave={save} />}
    >
      {locked ? (
        <View style={{ flexDirection: "row", gap: 12, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
          <Icon name="lock-simple" size={20} color={palette.iconMuted} />
          <View style={{ flex: 1, gap: 2 }}>
            <AText size={14} line={20} weight="semibold" color={palette.fg}>
              {t`You can't change this role`}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {t`It is at or above your highest role. Only someone higher can change it.`}
            </AText>
          </View>
        </View>
      ) : null}
      <View pointerEvents={locked ? "none" : "auto"} style={{ gap: 32, opacity: locked ? 0.6 : 1 }}>
        <SettingsSection title={t`Role`}>
          <View style={{ gap: 16 }}>
            <TextField label={t`Role name`} value={name} onChangeText={setName} maxLength={32} testID="role-name" />
            <View style={{ gap: 8 }}>
              <TextField
                label={t`Role colour`}
                value={colour}
                onChangeText={(v) => setColour(v.trim())}
                placeholder="#E0195F"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                style={{ writingDirection: "ltr", textAlign: "left" }}
                testID="role-colour"
                end={<View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: palette.borderSoft, backgroundColor: HEX.test(colour) ? colour : palette.pill }} />}
              />
              <View accessibilityRole="radiogroup" accessibilityLabel={t`Role colour`} style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={t`No colour`}
                  accessibilityState={{ checked: !colour }}
                  aria-checked={!colour}
                  onPress={() => setColour("")}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: !colour ? palette.fg : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="prohibit" size={18} color={palette.iconMuted} />
                  </View>
                </Pressable>
                {SWATCHES.map((c) => {
                  const on = colour.toUpperCase() === c;
                  return (
                    <Pressable key={c} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ checked: on }} aria-checked={on} onPress={() => setColour(c)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c, borderWidth: 2, borderColor: on ? palette.fg : "transparent", alignItems: "center", justifyContent: "center" }}>
                        {on ? <Icon name="check" size={16} color={palette.knob} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AText size={13} line={20} weight="semibold" color={palette.fg2} style={{ flex: 1 }}>
                  {t`Preview`}
                </AText>
                <View accessibilityRole="radiogroup" accessibilityLabel={t`Preview`} style={{ flexDirection: "row", gap: 8 }}>
                  {(["light", "dark"] as const).map((m) => (
                    <Chip key={m} radio selected={preview === m} label={m === "light" ? t`Light` : t`Dark`} onPress={() => setPreview(m)} />
                  ))}
                </View>
              </View>
              <View style={{ padding: 12, borderRadius: 14, backgroundColor: previewTheme.frame, flexDirection: "row", gap: 12, borderWidth: 1, borderColor: palette.divider }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.accent }} />
                <View style={{ flex: 1 }}>
                  <AText size={15} line={20} weight="semibold" color={textColour(colour, previewTheme.fg)}>
                    {name || roleName}
                  </AText>
                  <AText size={15} line={22} color={previewTheme.fg}>
                    {t`Zrzur rocks!`}
                  </AText>
                </View>
              </View>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title={t`Display`}>
          <RowGroup>
            <ControlRow
              first
              title={t`Role icon`}
              description={t`Shown next to members' names.`}
              control={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {shownIcon ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t`Remove`} onPress={() => setIcon(null)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                      <Image source={{ uri: shownIcon }} style={{ width: 32, height: 32, borderRadius: 8 }} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t`Role icon`}
                    onPress={async () => {
                      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.92 });
                      if (r.canceled) return;
                      const a = r.assets[0];
                      setIcon({ uri: a.uri, name: a.fileName ?? "icon.png", type: a.mimeType ?? "image/png" });
                    }}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: palette.tonalBorder, backgroundColor: pressed ? palette.tonalHover : palette.tonal, alignItems: "center", justifyContent: "center" })}
                  >
                    <Icon name="image" size={20} color={palette.fg} />
                  </Pressable>
                </View>
              }
            />
            <ControlRow
              title={t`Show members separately`}
              description={t`List members with this role in their own group in the member list.`}
              control={<Toggle label={t`Show members separately`} value={hoist} onChange={setHoist} />}
            />
          </RowGroup>
        </SettingsSection>

        <PermissionList
          allow={allow}
          deny={deny}
          tri
          onChange={(a, d) => {
            setAllow(a);
            setDeny(d);
          }}
        />

        <SettingsSection title={t`Manage`}>
          <RowGroup>
            <ControlRow
              first
              title={t`Role ID`}
              description={role.id}
              control={
                <Button label={t`Copy`} variant="tonal" size="sm" onPress={() => void copyToClipboard(role.id)} />
              }
            />
            <ControlRow
              icon="trash"
              title={t`Delete role`}
              description={t`Members lose this role and its permissions.`}
              control={
                <Button testID="delete-role" label={t`Delete`} variant="danger" size="sm" onPress={() => setDeleting(true)} />
              }
            />
          </RowGroup>
        </SettingsSection>
      </View>
      <ConfirmDialog
        visible={deleting}
        title={t`Delete ${roleName}?`}
        text={t`Once it's deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await server.deleteRole(role.id);
          onBack();
        }}
      />
    </SettingsPage>
  );
}

/** Everyone (web: default permissions): allow-only toggles */
function EveryoneEditor({ server, onBack }: { server: Server; onBack: () => void }) {
  const { t } = useLingui();
  const initial = server.defaultPermissions;
  const [allow, setAllow] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <SettingsPage
      title={`${t`Roles`} › ${t`Everyone`}`}
      backLabel={t`Roles`}
      onBack={onBack}
      testID="everyone-editor"
      footer={
        <SaveBar
          dirty={allow !== initial}
          saving={saving}
          error={error}
          onReset={() => setAllow(initial)}
          onSave={async () => {
            setSaving(true);
            setError(undefined);
            try {
              await server.setPermissions(undefined, Number(allow));
              onBack();
            } catch (err) {
              setError(describeError(err));
            } finally {
              setSaving(false);
            }
          }}
        />
      }
    >
      <PermissionList allow={allow} deny={0n} tri={false} onChange={(a) => setAllow(a)} />
    </SettingsPage>
  );
}

/** Roles (web: ServerRoleOverview) */
export function RolesPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const roles = useRoles(server);
  const canEdit = server.orPermission("ManageRole", "ManagePermissions");
  const myRank = useSolid(useCallback(() => (server.owner?.self ? -Infinity : (server.member?.ranking ?? Infinity)), [server]));
  const locked = (rank: number) => rank <= myRank;
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string>();

  if (open === "everyone") return <EveryoneEditor server={server} onBack={() => setOpen(null)} />;
  const openRole = open ? server.roles.get(open) : undefined;
  if (openRole) return <RoleEditor key={openRole.id} server={server} role={openRole} locked={locked(openRole.rank)} onBack={() => setOpen(null)} />;

  const move = async (index: number, by: -1 | 1) => {
    const ids = roles.map((r) => r.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setOrdering(true);
    try {
      await server.setRoleOrdering(ids);
    } finally {
      setOrdering(false);
    }
  };

  return (
    <SettingsPage title={t`Roles`} description={t`Groups of members and what they may do.`} testID="server-roles">
      <SettingsSection
        title={t`Order`}
        description={ordering ? t`Saving the new order…` : t`Roles higher in the list rank above lower ones.`}
        readOnly={canEdit ? undefined : t`Manage roles`}
        aside={
          canEdit ? (
            <Button testID="create-role" label={t`Create role`} icon="plus" onPress={() => setCreating(true)} />
          ) : undefined
        }
      >
        {roles.length === 0 ? (
          <EmptyCard icon="key" title={t`No roles yet`} text={t`Roles group members and give them permissions and a colour.`} />
        ) : (
          <RowGroup>
            {roles.map((r, i) => {
              const lock = locked(r.rank);
              return (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                  <Pressable
                    testID={`role-${r.id}`}
                    accessibilityRole="button"
                    accessibilityHint={lock ? t`At or above your highest role: only someone higher can change it.` : undefined}
                    onPress={() => setOpen(r.id)}
                    style={({ pressed }) => ({ flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingStart: 16, paddingEnd: 8, backgroundColor: pressed ? palette.navSelected : "transparent" })}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: HEX.test(r.colour ?? "") ? r.colour : palette.pill }} />
                    {r.icon ? <Image source={{ uri: r.icon }} style={{ width: 20, height: 20, borderRadius: 4 }} /> : null}
                    <AText autoDir size={16} line={22} weight="medium" color={textColour(r.colour, palette.fg)} numberOfLines={1} style={{ flex: 1 }}>
                      {r.name}
                    </AText>
                    {lock ? <Icon name="lock-simple" size={16} color={palette.muted} /> : null}
                  </Pressable>
                  {canEdit && !lock ? (
                    <View style={{ flexDirection: "row", paddingEnd: 4 }}>
                      <RowTool icon="caret-up" label={t`Move up`} disabled={i === 0 || ordering || locked(roles[i - 1]?.rank ?? -Infinity)} onPress={() => void move(i, -1)} />
                      <RowTool icon="caret-down" label={t`Move down`} disabled={i === roles.length - 1 || ordering} onPress={() => void move(i, 1)} />
                    </View>
                  ) : (
                    <View style={{ width: 8 }} />
                  )}
                </View>
              );
            })}
          </RowGroup>
        )}
      </SettingsSection>

      <SettingsSection title={t`Default permissions`}>
        <RowGroup>
          <Pressable testID="role-everyone" accessibilityRole="button" onPress={() => setOpen("everyone")}>
            <ControlRow first icon="users" title={t`Everyone`} description={t`What every member can do before any role is added.`} control={<Icon name="caret-right" size={16} color={palette.iconMuted} />} />
          </Pressable>
        </RowGroup>
      </SettingsSection>

      <Sheet visible={creating} onClose={() => setCreating(false)}>
        <AText size={18} line={26} weight="bold" color={palette.header}>
          {t`Create role`}
        </AText>
        <TextField label={t`Role name`} value={newName} onChangeText={setNewName} maxLength={32} error={error} testID="new-role-name" />
        <Button
            label={t`Create role`}
            fill
            status={busy ? "submitting" : "ready"}
            testID="new-role-create"
            onPress={async () => {
              if (!newName.trim()) return setError(t`Please fill in this field.`);
              setBusy(true);
              setError(undefined);
              try {
                const { id } = await server.createRole(newName.trim());
                setCreating(false);
                setNewName("");
                setOpen(id);
              } catch (err) {
                setError(describeError(err));
              } finally {
                setBusy(false);
              }
            }}
          />
      </Sheet>
    </SettingsPage>
  );
}
