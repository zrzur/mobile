import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId, useServer } from "@/client/hooks";
import { useNotificationOptions } from "@/notifications/hooks";
import { effectiveServerState, muteActive } from "@/notifications/levels";
import { DetailRow, LevelPage, MutePage, useLevelText, useMutedUntil } from "@/notifications/NotificationRows";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { InterestsSheet } from "@/ui/onboarding/InterestsSheet";
import { hasInterests } from "@/ui/onboarding/onboardingLogic";
import { ReportSheet } from "@/ui/profile/ReportFlow";
import { ConfirmDialog } from "@/ui/settings/parts";
import { canOpenServerSettings } from "@/ui/settings/serverSections";

import { CreateCategorySheet, CreateChannelSheet } from "./CreateSheets";
import { IdentitySheet } from "./IdentitySheet";
import { MODAL_GAP } from "./ulid";
import { addToFolder, createFolder, folderOf, newFolderId, removeFromFolder } from "./syncedLogic";
import { useFolders } from "./useSyncedOptions";
import { copyToClipboard } from "@/ui/kit/share";

import { openChannel, OpenTicketSheet } from "./tickets/OpenTicketSheet";
import type { ServerTickets } from "./tickets/ticketLogic";
import { cachedServerTickets, openTicket, serverTickets } from "./tickets/ticketStore";

type Page = "menu" | "mute" | "folder" | "notifications";
type Panel = null | "identity" | "create-channel" | "create-category" | "interests" | "report" | "leave" | "ticket";

/** One of the three large buttons at the top of the phone sheet (web: QuickAction) */
function Quick({ icon, label, onPress, testID, accessibilityLabel }: { icon: IconName; label: string; onPress: () => void; testID?: string; accessibilityLabel?: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 64, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: pressed ? palette.navSelected : palette.field })}
    >
      <Icon name={icon} size={22} color={palette.fg} />
      {/* web: 12/16 medium captions, so a long word fits a third of 320 px */}
      <AText size={12} line={16} weight="medium" color={palette.fg} numberOfLines={1}>
        {label}
      </AText>
    </Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? palette.accent : palette.borderStrong, alignItems: "center", justifyContent: "center" }}>
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent }} /> : null}
    </View>
  );
}

function ChoiceRow({ label, text, on, onPress, first, icon }: { label: string; text?: string; on?: boolean; onPress: () => void; first?: boolean; icon?: IconName }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole={on === undefined ? "button" : "radio"}
      accessibilityState={on === undefined ? undefined : { checked: on }}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider, backgroundColor: pressed ? palette.navSelected : "transparent" })}
    >
      {/* the kit GroupRow's metrics (20 px icon in a 24 px slot), plus a radio and a second line */}
      {icon ? (
        <View style={{ width: 24, alignItems: "center" }}>
          <Icon name={icon} size={20} color={palette.iconNeutral} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText size={16} line={22} weight="medium" color={palette.fg}>
          {label}
        </AText>
        {text ? (
          <AText size={13} line={18} color={palette.muted}>
            {text}
          </AText>
        ) : null}
      </View>
      {on !== undefined ? <Radio on={on} /> : null}
    </Pressable>
  );
}

function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t`Back`} onPress={onBack} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon name="arrow-left" size={20} color={palette.muted} />
      <AText size={16} line={22} weight="semibold" color={palette.header}>
        {title}
      </AText>
    </Pressable>
  );
}

/**
 * The server's menu as the web's phone sheet (web: ServerContextMenu): the
 * server, Invite / Server info / Settings, then everything else. Submenus
 * (mute, folders, notifications) open inside the same sheet; anything that
 * needs a window of its own closes the sheet first, so only one shows.
 * Mutes and levels go through the notification store (src/notifications),
 * the one owner of the synced `notifications` key; folders through the
 * synced store (`server-folders`).
 */
export function ServerSheet({ serverId, visible, onClose }: { serverId: string; visible: boolean; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const selfId = useSelfId();
  const [page, setPage] = useState<Page>("menu");
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string>();
  const { store, options, now } = useNotificationOptions();
  const mutedUntil = useMutedUntil();
  const levelText = useLevelText();
  const folders = useFolders();
  const client = useClient();
  // the server's ticket settings: the installed SDK does not keep them, so they are asked for (web: server.tickets)
  const [tickets, setTickets] = useState<ServerTickets | undefined>(() => cachedServerTickets(serverId));
  useEffect(() => {
    if (!visible) return;
    let live = true;
    serverTickets(client, serverId, true).then(
      (value) => live && setTickets(value),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, serverId, visible]);
  const f = useFields(
    server,
    (s) => ({
      name: s.name,
      icon: s.animatedIconURL ?? s.iconURL,
      members: s.approximateMemberCount,
      unread: s.unread,
      interests: hasInterests((s.lobby?.onboarding ?? []).map((q) => ({ options: (q.options ?? []).map((o) => ({ role: o.role ?? "" })) }))),
      invite: s.channels.some((c) => c.havePermission("InviteOthers")),
      settings: canOpenServerSettings(s, selfId),
      identity: s.havePermission("ChangeNickname") || s.havePermission("ChangeAvatar"),
      manageChannels: s.havePermission("ManageChannel"),
      owner: s.ownerId === selfId,
      serverDefault: s.defaultNotifications,
    }),
    [selfId],
  );
  if (!server || !f) return null;

  const close = () => {
    setPage("menu");
    onClose();
  };
  /** close the menu, then open a window of its own */
  const openPanel = (next: Panel) => {
    setPage("menu");
    onClose();
    // iOS shows a new window only once the sheet has gone
    setTimeout(() => setPanel(next), Platform.OS === "ios" ? MODAL_GAP : 0);
  };
  const go = (run: () => void) => {
    close();
    run();
  };
  const save = (run: () => Promise<void>) => {
    setError(undefined);
    run().then(close, (err) => setError(describeError(err)));
  };

  /** Open a ticket with the staff, or go to the one already open (the server hands it back) */
  const startTicket = () => {
    if (tickets?.types.length) return openPanel("ticket");
    setError(undefined);
    openTicket(client, serverId).then(
      (id) => {
        close();
        openChannel(id);
      },
      (err) => setError(describeError(err)),
    );
  };

  const mute = options.server_mutes[serverId];
  const muted = muteActive(mute, now);
  const level = options.server[serverId];
  const folder = folderOf(folders.folders, serverId);
  const name = f.name;

  const menu = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, paddingBottom: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: palette.borderSubtle }}>
          <Avatar url={f.icon} name={f.name} size={54} square />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AText autoDir size={18} line={24} weight="bold" color={palette.fg} numberOfLines={1}>
            {f.name}
          </AText>
          {f.members ? (
            <AText size={13} line={18} color={palette.muted}>
              {t`${plural(f.members, { one: "# member", other: "# members" })}`}
            </AText>
          ) : null}
        </View>
      </View>
      <View accessibilityRole="menu" style={{ flexDirection: "row", gap: 8 }}>
        {f.invite ? <Quick icon="user-plus" label={t`Invite`} accessibilityLabel={t`Create invite`} testID="server-quick-invite" onPress={() => go(() => router.push({ pathname: "/invite/[serverId]", params: { serverId } }))} /> : null}
        <Quick icon="info" label={t`Server info`} testID="server-quick-info" onPress={() => go(() => router.push({ pathname: "/server-info/[id]", params: { id: serverId } }))} />
        {f.settings ? <Quick icon="gear-six" label={t`Settings`} accessibilityLabel={t`Open server settings`} testID="open-server-settings" onPress={() => go(() => router.push({ pathname: "/server-settings/[id]", params: { id: serverId } }))} /> : null}
      </View>
      {f.unread || f.interests ? (
        <RowGroup>
          {f.unread ? <GroupRow first icon="check-circle" label={t`Mark as read`} onPress={() => go(() => void server.ack().catch(() => undefined))} /> : null}
          {f.interests ? <GroupRow first={!f.unread} icon="smiley" label={t`Your interests`} testID="server-interests" onPress={() => openPanel("interests")} /> : null}
        </RowGroup>
      ) : null}
      <RowGroup>
        {muted ? (
          <DetailRow
            first
            icon="bell"
            label={t`Unmute server`}
            detail={mutedUntil(mute)}
            testID="server-unmute"
            onPress={() => {
              store.setServerMute(serverId, null);
              close();
            }}
          />
        ) : (
          <GroupRow first icon="bell-slash" label={t`Mute server`} chevron testID="server-mute" onPress={() => setPage("mute")} />
        )}
        <GroupRow icon="folder" label={t`Add to folder`} chevron testID="server-add-folder" onPress={() => setPage("folder")} />
        {folder ? <GroupRow icon="folder-minus" label={t`Remove from folder`} onPress={() => save(() => folders.save((list) => removeFromFolder(list, serverId)))} /> : null}
        <GroupRow
          icon="bell-ringing"
          label={t`Notifications`}
          value={levelText(effectiveServerState(level, f.serverDefault))}
          chevron
          testID="server-notifications"
          onPress={() => setPage("notifications")}
        />
      </RowGroup>
      {tickets?.enabled ? (
        <RowGroup>
          <GroupRow first icon="ticket" label={tickets.label || t`Open a ticket`} testID="ticket-entry" onPress={startTicket} />
        </RowGroup>
      ) : null}
      {f.identity || f.manageChannels ? (
        <RowGroup>
          {f.identity ? <GroupRow first icon="identification-card" label={t`Edit your identity`} testID="server-identity" onPress={() => openPanel("identity")} /> : null}
          {f.manageChannels ? <GroupRow first={!f.identity} icon="plus" label={t`Create channel`} testID="server-create-channel" onPress={() => openPanel("create-channel")} /> : null}
          {f.manageChannels ? <GroupRow icon="folder-plus" label={t`Create category`} testID="server-create-category" onPress={() => openPanel("create-category")} /> : null}
        </RowGroup>
      ) : null}
      <RowGroup>
        <GroupRow first icon="flag" label={t`Report server`} danger testID="server-report" onPress={() => openPanel("report")} />
        {!f.owner ? <GroupRow icon="sign-out" label={t`Leave server`} danger testID="server-leave" onPress={() => openPanel("leave")} /> : null}
      </RowGroup>
      <RowGroup>
        <GroupRow first icon="copy" label={t`Copy server ID`} onPress={() => go(() => void copyToClipboard(server.id))} />
      </RowGroup>
    </>
  );

  const mutePage = (
    <MutePage
      title={t`Mute server`}
      testID="mute-server"
      onBack={() => setPage("menu")}
      onPick={(minutes) => {
        store.setServerMute(serverId, minutes);
        close();
      }}
    />
  );

  const folderPage = (
    <>
      <SubHead title={t`Add to folder`} onBack={() => setPage("menu")} />
      <RowGroup>
        {folders.folders.map((x, i) => (
          <ChoiceRow key={x.id} first={i === 0} icon="folder" label={x.name || t`Unnamed folder`} on={x.id === folder?.id} onPress={() => save(() => folders.save((list) => addToFolder(list, x.id, serverId)))} />
        ))}
        <ChoiceRow first={!folders.folders.length} icon="folder-plus" label={t`New folder`} onPress={() => save(() => folders.save((list) => createFolder(list, newFolderId(Date.now(), Math.random()), t`New folder`, [serverId])))} />
      </RowGroup>
    </>
  );

  const notificationsPage = (
    <LevelPage
      own={level}
      defaultTitle={t`Server default`}
      defaultText={f.serverDefault === "All" ? t`All messages` : t`Mentions only`}
      onChange={(state) => store.setServer(serverId, state)}
      suppress={{
        everyone: options.suppress_everyone[serverId] ?? false,
        roles: options.suppress_roles[serverId] ?? false,
        onChange: (kind, on) => store.setSuppress(kind, serverId, on),
      }}
      onBack={() => setPage("menu")}
    />
  );

  return (
    <>
      <Sheet visible={visible} onClose={close} testID="server-menu">
        {page === "mute" ? mutePage : page === "folder" ? folderPage : page === "notifications" ? notificationsPage : menu}
        {error ? (
          <AText size={13} line={18} color={palette.danger} accessibilityRole="alert">
            {error}
          </AText>
        ) : null}
      </Sheet>
      {panel === "interests" ? <InterestsSheet server={server} visible onClose={() => setPanel(null)} /> : null}
      {panel === "identity" ? <IdentitySheet serverId={serverId} onClose={() => setPanel(null)} /> : null}
      {panel === "create-channel" ? <CreateChannelSheet serverId={serverId} onClose={() => setPanel(null)} /> : null}
      {panel === "create-category" ? <CreateCategorySheet serverId={serverId} onClose={() => setPanel(null)} /> : null}
      {panel === "ticket" && tickets ? <OpenTicketSheet serverId={serverId} types={tickets.types} onClose={() => setPanel(null)} /> : null}
      {panel === "report" ? <ReportSheet spec={{ kind: "Server", id: serverId, label: name, image: f.icon }} onClose={() => setPanel(null)} /> : null}
      <ConfirmDialog
        visible={panel === "leave"}
        title={t`Leave server`}
        text={name}
        confirm={t`Leave`}
        onClose={() => setPanel(null)}
        onConfirm={async () => {
          await server.delete();
          router.replace("/home");
        }}
      />
    </>
  );
}
