import { useLingui } from "@lingui/react/macro";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";

import { useChannel, useFields } from "@/client/hooks";
import { DetailRow, LevelPage, type MenuPage, MutePage, useLevelText, useMutedUntil } from "@/notifications/NotificationRows";
import { channelState, effectiveServerState, effectiveSuppress, muteActive } from "@/notifications/levels";
import { channelLink } from "@/notifications/links";
import { useNotificationOptions } from "@/notifications/hooks";
import { ReportFlow } from "@/ui/profile/ProfileSheet";
import { ConfirmDialog } from "@/ui/settings/parts";
import { haptics } from "@/ui/kit/haptics";
import { shareText } from "@/ui/kit/share";
import type { ReportStep } from "@/ui/profile/logic";

import { GroupRow, RowGroup, Sheet } from "./parts";

/**
 * A channel's menu, opened by a long press on its row (web:
 * ChannelContextMenu + shared/NotificationContextMenu). "Mute channel",
 * "Notifications" and "Report channel" open inside the same sheet.
 * `startPage: "level"` opens straight on the notification levels (the
 * chat header's bell); `"mute"` on the mute times and `"close"` on the
 * leave / close / delete question (the conversation row's swipe actions).
 */
export function ChannelMenu({
  channelId,
  visible,
  onClose: close,
  startPage = "main",
}: {
  channelId: string;
  visible: boolean;
  onClose: () => void;
  startPage?: MenuPage | "close";
}) {
  const { t } = useLingui();
  const channel = useChannel(channelId);
  const firstPage: MenuPage = startPage === "close" ? "main" : startPage;
  const [page, setPage] = useState<MenuPage | "report">(firstPage);
  const [reportStep, setReportStep] = useState<ReportStep>("reason");
  const [confirming, setConfirming] = useState(startPage === "close");
  const { store, options, now } = useNotificationOptions();
  const mutedUntil = useMutedUntil();
  const levelText = useLevelText();
  const fields = useFields(channel, (c) => ({
    name: c.name,
    type: c.type,
    serverId: c.serverId || undefined,
    serverDefault: c.server?.defaultNotifications,
    unread: c.unread || (c.mentions?.size ?? 0) > 0,
    invite: !!c.serverId && !c.isVoice && c.havePermission("InviteOthers"),
    addToGroup: c.type === "Group" && c.havePermission("InviteOthers"),
    // a DM is closed, never managed; a group's settings are its own (web: group wording)
    manage: c.type !== "DirectMessage" && c.type !== "SavedMessages" && c.havePermission("ManageChannel"),
    icon: c.iconURL,
    recipientId: c.type === "DirectMessage" ? c.recipient?.id : undefined,
    recipientName: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : "",
  }));
  if (!channel || !fields) return null;

  const onClose = () => {
    setPage(firstPage);
    setReportStep("reason");
    setConfirming(startPage === "close");
    close();
  };
  const group = fields.type === "Group";
  const dm = fields.type === "DirectMessage";
  const conversation = group || dm;
  const back = () => (firstPage === "main" && startPage !== "close" ? setPage("main") : onClose());
  const mute = options.channel_mutes[channelId];
  const muted = muteActive(mute, now);
  const own = options.channel[channelId];
  const level = channelState(options, { id: channelId, type: fields.type, serverId: fields.serverId, serverDefault: fields.serverDefault });

  if (page === "mute") {
    return (
      <Sheet visible={visible} onClose={onClose} testID="channel-menu">
        <MutePage
          title={conversation ? t`Mute` : t`Mute channel`}
          testID="mute-channel"
          onBack={back}
          onPick={(minutes) => {
            store.setChannelMute(channelId, minutes);
            onClose();
          }}
        />
      </Sheet>
    );
  }

  if (page === "level") {
    const inherited = fields.serverId ? effectiveServerState(options.server[fields.serverId], fields.serverDefault) : "all";
    return (
      <Sheet visible={visible} onClose={onClose} testID="channel-menu">
        <LevelPage
          own={own}
          defaultTitle={fields.serverId ? t`Server default` : t`Default`}
          defaultText={levelText(inherited)}
          onChange={(state) => store.setChannel(channelId, state)}
          suppress={
            fields.serverId
              ? {
                  everyone: effectiveSuppress(options.suppress_everyone[channelId], options.suppress_everyone[fields.serverId]),
                  roles: effectiveSuppress(options.suppress_roles[channelId], options.suppress_roles[fields.serverId]),
                  onChange: (kind, on) => store.setSuppress(kind, channelId, on),
                }
              : undefined
          }
          onBack={back}
        />
      </Sheet>
    );
  }

  if (page === "report") {
    // past the first step a tap outside keeps what was entered (web: persistent)
    const persistent = reportStep !== "reason" && reportStep !== "done";
    return (
      <Sheet visible={visible} onClose={persistent ? () => {} : onClose} testID="channel-menu">
        <ReportFlow spec={{ kind: "Channel", id: channelId, serverId: fields.serverId, label: fields.name, image: fields.icon }} onClose={onClose} onStepChange={setReportStep} />
      </Sheet>
    );
  }

  // web DeleteChannel: leave a group, close a DM, delete a channel
  if (confirming) {
    const recipient = fields.recipientName;
    const name = fields.name;
    return (
      <ConfirmDialog
        visible={visible}
        title={group ? t`Leave ${name}?` : dm ? t`Close conversation with ${recipient}?` : t`Delete ${name}?`}
        text={group ? t`You won't be able to rejoin unless you are re-invited.` : dm ? t`You can re-open it later, but it will disappear on both sides.` : t`Once it's deleted, there's no going back.`}
        confirm={group ? t`Leave` : dm ? t`Close` : t`Delete`}
        onClose={onClose}
        onConfirm={async () => {
          await channel.delete();
          // a server channel goes back to its server; a conversation leaves the list it was opened from
          if (fields.serverId) router.replace({ pathname: "/server/[id]", params: { id: fields.serverId } });
        }}
      />
    );
  }

  const firstGroup = fields.unread || fields.invite || fields.addToGroup;
  return (
    <Sheet visible={visible} onClose={onClose} testID="channel-menu">
      {firstGroup ? (
        <RowGroup>
          {fields.unread ? (
            <GroupRow
              first
              icon="check-circle"
              label={t`Mark as read`}
              testID="channel-mark-read"
              onPress={() => {
                onClose();
                void channel.ack();
              }}
            />
          ) : null}
          {fields.invite && fields.serverId ? (
            <GroupRow
              first={!fields.unread}
              icon="user-plus"
              label={t`Create invite`}
              testID="channel-invite"
              onPress={() => {
                onClose();
                router.push({ pathname: "/invite/[serverId]", params: { serverId: fields.serverId! } });
              }}
            />
          ) : null}
          {fields.addToGroup ? (
            <GroupRow
              first={!fields.unread}
              icon="user-plus"
              label={t`Add friends to group`}
              testID="channel-add-to-group"
              onPress={() => {
                onClose();
                router.push({ pathname: "/new-group", params: { group: channelId } });
              }}
            />
          ) : null}
        </RowGroup>
      ) : null}
      <RowGroup>
        {muted ? (
          <DetailRow
            first
            icon="bell"
            label={conversation ? t`Unmute` : t`Unmute channel`}
            detail={mutedUntil(mute)}
            testID="unmute-channel"
            onPress={() => {
              store.setChannelMute(channelId, null);
              onClose();
            }}
          />
        ) : (
          <GroupRow first icon="bell-slash" label={conversation ? t`Mute` : t`Mute channel`} chevron testID="mute-channel" onPress={() => setPage("mute")} />
        )}
        <GroupRow
          icon="bell-ringing"
          label={t`Notifications`}
          value={levelText(level)}
          chevron
          testID="channel-notifications"
          onPress={() => setPage("level")}
        />
      </RowGroup>
      {fields.manage ? (
        <RowGroup>
          <GroupRow
            first
            icon="gear-six"
            label={group ? t`Settings` : t`Open channel settings`}
            testID="channel-open-settings"
            onPress={() => {
              onClose();
              router.push({ pathname: "/channel-settings/[id]", params: { id: channelId } });
            }}
          />
        </RowGroup>
      ) : null}
      <RowGroup>
        <GroupRow
          first
          icon="link"
          label={t`Copy link`}
          testID="channel-copy-link"
          onPress={() => {
            onClose();
            void Clipboard.setStringAsync(channelLink(channelId, fields.serverId));
            haptics.success();
          }}
        />
        <GroupRow
          icon="share-network"
          label={t`Share`}
          testID="channel-share"
          onPress={() => {
            onClose();
            void shareText({ url: channelLink(channelId, fields.serverId) });
          }}
        />
        <GroupRow
          icon="copy"
          label={t`Copy channel ID`}
          testID="channel-copy-id"
          onPress={() => {
            onClose();
            void Clipboard.setStringAsync(channelId);
            haptics.success();
          }}
        />
        {fields.recipientId ? (
          <GroupRow
            icon="identification-card"
            label={t`Copy user ID`}
            testID="channel-copy-user-id"
            onPress={() => {
              onClose();
              void Clipboard.setStringAsync(fields.recipientId!);
              haptics.success();
            }}
          />
        ) : null}
      </RowGroup>
      {fields.serverId && !fields.manage ? (
        <RowGroup>
          <GroupRow first icon="flag" label={t`Report channel`} danger testID="channel-report" onPress={() => setPage("report")} />
        </RowGroup>
      ) : null}
      {group || dm || fields.manage ? (
        <RowGroup>
          <GroupRow
            first
            icon={group ? "sign-out" : dm ? "x-circle" : "trash"}
            label={group ? t`Leave group` : dm ? t`Close` : t`Delete channel`}
            danger
            testID="channel-delete"
            onPress={() => setConfirming(true)}
          />
        </RowGroup>
      ) : null}
    </Sheet>
  );
}
