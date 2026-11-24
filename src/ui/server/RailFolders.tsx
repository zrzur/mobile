import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useServerIds } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { AText, AuthButton, TextField } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { alpha } from "@/ui/lobby/lobbyLogic";

import { deleteFolder, editFolder, FOLDER_COLOURS, type RailEntry, railEntries, type ServerFolder, toggleFolder } from "./syncedLogic";
import { RailDraggable, useRailA11y, useRailDrag } from "./RailDrag";
import { MODAL_GAP } from "./ulid";
import { useFolders, useRailOrder } from "./useSyncedOptions";

const isHex = (c?: string): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

/**
 * The rail's servers and folders in the order synced with the web (web:
 * Ordering.orderedEntries). Use in place of `useServerIds()` in the rail.
 */
export function useRailEntries(): RailEntry[] {
  const ids = useServerIds();
  const order = useRailOrder();
  const { folders } = useFolders();
  return railEntries(ids, order, folders);
}

/** Mentions and unread of a folder's servers, as one snapshot */
function useFolderState(servers: string[]) {
  const client = useClient();
  const key = servers.join(",");
  const json = useSolid(
    useCallback(() => {
      let mentions = 0;
      let unread = false;
      const icons: { id: string; url?: string; name: string }[] = [];
      for (const id of key.split(",")) {
        const s = client.servers.get(id);
        if (!s) continue;
        if (icons.length < 4) icons.push({ id, url: s.iconURL, name: s.name });
        if (s.unread) unread = true;
        for (const c of s.channels) if (!c.muted) mentions += c.mentions?.size ?? 0;
      }
      return JSON.stringify({ mentions, unread, icons });
    }, [client, key]),
  );
  return JSON.parse(json) as { mentions: number; unread: boolean; icons: { id: string; url?: string; name: string }[] };
}

/**
 * A folder of servers in the rail, collapsible in place (web: FolderEntry):
 * closed it shows up to four server icons on the folder colour; open, the
 * folder icon on top and its servers under it on a tinted column. A press
 * opens or closes it; a long press offers Edit folder and Delete folder.
 * `renderServer` draws one server tile as the rail does.
 */
export function FolderTile({ folder, servers, selected, renderServer }: { folder: ServerFolder; servers: string[]; selected?: string; renderServer: (id: string) => ReactNode }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { save } = useFolders();
  const state = useFolderState(servers);
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const collapsed = folder.collapsed ?? false;
  const name = folder.name || t`Folder`;
  const colour = isHex(folder.colour) ? folder.colour : undefined;
  const holdsSelected = !!selected && servers.includes(selected);
  const bar = collapsed && holdsSelected ? "selected" : collapsed && state.unread ? "unread" : null;
  const size = state.icons.length > 2 ? 14 : 17;
  const drag = useRailDrag();
  const openMenu = useCallback(() => setMenu(true), []);
  const a11y = useRailA11y(folder.id, openMenu);
  const label = useCallback(() => name, [name]);

  return (
    <View testID={`rail-folder-${folder.id}`} style={{ alignItems: "center", gap: 8, paddingVertical: collapsed ? 0 : 6, borderRadius: 16, backgroundColor: collapsed ? "transparent" : colour ? alpha(colour, 0.18) : palette.navHover }}>
      {/* a resting finger lifts the folder to drag it; resting longer, or letting go, opens its menu */}
      <RailDraggable id={folder.id} label={label} onMenu={openMenu}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ expanded: !collapsed }}
        {...a11y}
        onPress={() => {
          if (drag && !drag.tapAllowed()) return;
          void save((list) => toggleFolder(list, folder.id)).catch(() => undefined);
        }}
        style={{ width: 54, height: 48, alignItems: "center", justifyContent: "center" }}
      >
        {bar ? <View style={{ position: "absolute", start: -9, top: "50%", width: 3, height: bar === "selected" ? 32 : 8, marginTop: bar === "selected" ? -16 : -4, borderTopEndRadius: 4, borderBottomEndRadius: 4, backgroundColor: bar === "selected" ? palette.accent : palette.unread }} /> : null}
        <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: collapsed ? (colour ? alpha(colour, 0.3) : palette.field) : "transparent" }}>
          {collapsed && state.icons.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, width: size * 2 + 2, justifyContent: "center", alignContent: "center" }}>
              {state.icons.map((s) => (
                <Avatar key={s.id} url={s.url} name={s.name} size={size} square />
              ))}
            </View>
          ) : (
            <Icon name="folder" size={24} color={colour ?? palette.fg} />
          )}
        </View>
        {collapsed && state.mentions > 0 ? (
          <View style={{ position: "absolute", top: -2, end: -2, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: palette.mentionBadge, borderWidth: 2, borderColor: palette.frame, alignItems: "center", justifyContent: "center" }}>
            <AText size={10} line={12} weight="bold" color={palette.onAccent}>
              {state.mentions < 10 ? String(state.mentions) : "9+"}
            </AText>
          </View>
        ) : null}
      </Pressable>
      </RailDraggable>
      {!collapsed ? servers.map((id) => <View key={id}>{renderServer(id)}</View>) : null}
      <FolderMenu
        visible={menu}
        onClose={() => setMenu(false)}
        onEdit={() => {
          setMenu(false);
          setTimeout(() => setEdit(true), Platform.OS === "ios" ? MODAL_GAP : 0);
        }}
        onDelete={() => {
          setMenu(false);
          void save((list) => deleteFolder(list, folder.id)).catch(() => undefined);
        }}
      />
      {edit ? <FolderEditSheet folder={folder} onClose={() => setEdit(false)} /> : null}
    </View>
  );
}

/** A closed folder's face, carried under the finger while dragging */
export function FolderGhost({ folder, servers }: { folder: ServerFolder; servers: string[] }) {
  const { palette } = useTheme();
  const state = useFolderState(servers);
  const colour = isHex(folder.colour) ? folder.colour : undefined;
  const size = state.icons.length > 2 ? 14 : 17;
  return (
    <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colour ? alpha(colour, 0.3) : palette.field }}>
      {state.icons.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, width: size * 2 + 2, justifyContent: "center", alignContent: "center" }}>
          {state.icons.map((s) => (
            <Avatar key={s.id} url={s.url} name={s.name} size={size} square />
          ))}
        </View>
      ) : (
        <Icon name="folder" size={24} color={colour ?? palette.fg} />
      )}
    </View>
  );
}

/** Edit folder / Delete folder (web: ServerFolderContextMenu); deleting keeps the servers */
function FolderMenu({ visible, onClose, onEdit, onDelete }: { visible: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { t } = useLingui();
  return (
    <Sheet visible={visible} onClose={onClose} testID="folder-menu">
      <RowGroup>
        <GroupRow first icon="pencil-simple" label={t`Edit folder`} onPress={onEdit} testID="folder-edit" />
      </RowGroup>
      <RowGroup>
        <GroupRow first icon="trash" danger label={t`Delete folder`} onPress={onDelete} testID="folder-delete" />
      </RowGroup>
    </Sheet>
  );
}

/** Rename a folder or change its colour (web: EditServerFolder) */
function FolderEditSheet({ folder, onClose }: { folder: ServerFolder; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { save } = useFolders();
  const [name, setName] = useState(folder.name);
  const [colour, setColour] = useState<string | undefined>(folder.colour);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await save((list) => editFolder(list, folder.id, { name, colour }));
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} testID="folder-edit-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="folder" size={22} color={palette.accentText} />
        <AText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
          {t`Edit folder`}
        </AText>
      </View>
      <TextField label={t`Name`} value={name} onChangeText={setName} testID="folder-name" />
      <AText size={13} line={20} weight="semibold" color={palette.fg2}>
        {t`Folder colour`}
      </AText>
      <View style={{ gap: 8 }}>
        {FOLDER_COLOURS.map((row, r) => (
          <View key={r} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {row.map((value) => {
              const on = colour === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t`Set folder colour to ${value}`}
                  onPress={() => setColour(on ? undefined : value)}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: value, borderWidth: on ? 3 : 0, borderColor: palette.fg }} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
          {error}
        </AText>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: "center" }}>
          <AText size={15} line={20} weight="semibold" color={palette.fg2}>
            {t`Cancel`}
          </AText>
        </Pressable>
        <AuthButton status={busy ? "submitting" : "ready"} onPress={() => void submit()} testID="folder-save">
          {t`Save`}
        </AuthButton>
      </View>
    </Sheet>
  );
}
