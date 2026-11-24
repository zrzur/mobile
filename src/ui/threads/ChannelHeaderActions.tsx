import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Alert, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { GroupRow, HeaderButton, RowGroup, Sheet } from "@/ui/app/parts";
import { openMemberList } from "@/ui/profile/ProfileSheet";
import type { DetailsTab } from "@/ui/search/detailsTabs";

import { StartThreadHost } from "./StartThreadSheet";
import { writeAccess } from "./threadAccess";

/**
 * The actions at the end of a channel's header on a phone (web:
 * ChannelHeader, phone layout): Search, Threads (text channels), and one
 * "More" sheet with pinned messages, members, notifications, the thread's
 * archive and lock, and channel settings. Also hosts the start-thread sheet
 * for this channel, so `startThread(channelId, messageId)` works from the
 * message sheet of the screen it is placed in.
 *
 * `onNotifications`: the bell row of the More sheet (the chat screen opens
 * the channel's notification levels); it runs after the More sheet closed.
 * Members: a server channel opens the member list page, a group its
 * members tab.
 *
 * A direct message has no More sheet, like the web on a phone: its pins
 * and notifications are on the details screen (the name opens it). Only on
 * a very narrow phone (under 360 px) does the video call move into one
 * (`videoCall`), so the name keeps its room.
 */
export function ChannelHeaderActions({ channelId, onNotifications, videoCall }: { channelId: string; onNotifications?: () => void; videoCall?: () => void }) {
  const { t } = useLingui();
  const selfId = useSelfId();
  const channel = useChannel(channelId);
  const f = useFields(
    channel,
    (c) => ({
      type: c.type,
      serverId: c.serverId || undefined,
      isThread: c.isThread,
      isForum: c.isForum,
      isVoice: c.isVoice,
      archived: !!c.thread?.archived,
      locked: !!c.thread?.locked,
      moderator: c.havePermission("ManageMessages"),
      owner: c.thread?.ownerId === selfId,
      writable: c.isThread ? writeAccess(c) === "allowed" : false,
      settings: (c.type === "Group" || !!c.serverId) && c.orPermission("ManageChannel", "ManagePermissions"),
    }),
    [selfId],
  );
  const [more, setMore] = useState(false);
  if (!f) return null;

  const canListThreads = f.type === "TextChannel" && !f.isVoice && !f.isThread && !f.isForum;
  const hasMembers = f.type !== "SavedMessages" && f.type !== "DirectMessage";
  /** anyone who can manage messages, or the owner of a thread still open */
  const canManageThread = f.isThread && (f.moderator || (f.owner && f.writable));
  const canLock = f.isThread && f.moderator;

  const details = (tab: DetailsTab) => router.push({ pathname: "/channel-details/[id]", params: { id: channelId, tab } });
  const fromMore = (fn: () => void) => () => {
    setMore(false);
    fn();
  };
  const edit = (data: { archived?: boolean; locked?: boolean }) => {
    setMore(false);
    channel?.editThread(data).catch((err) => Alert.alert(t`It didn't work`, describeError(err)));
  };

  const dm = f.type === "DirectMessage";
  const rows: { key: string; node: (first: boolean) => ReactNode }[] = [];
  if (videoCall) rows.push({ key: "video", node: (first) => <GroupRow first={first} testID="header-more-video-call" icon="video-camera" label={t`Start a video call`} onPress={fromMore(videoCall)} /> });
  if (!dm) rows.push({ key: "pins", node: (first) => <GroupRow first={first} testID="header-more-pins" icon="push-pin" label={t`Pinned messages`} chevron onPress={fromMore(() => details("pins"))} /> });
  if (hasMembers) rows.push({ key: "members", node: (first) => <GroupRow first={first} testID="header-more-members" icon="users" label={t`Member list`} chevron onPress={fromMore(() => (f.serverId ? openMemberList(f.serverId, channelId) : details("members")))} /> });
  if (onNotifications && !dm) rows.push({ key: "bell", node: (first) => <GroupRow first={first} testID="header-more-notifications" icon="bell" label={t`Notifications`} chevron onPress={fromMore(onNotifications)} /> });
  if (canManageThread)
    rows.push({ key: "archive", node: (first) => <GroupRow first={first} testID="header-more-archive" icon="archive" label={f.archived ? t`Reopen thread` : t`Archive thread`} onPress={() => edit({ archived: !f.archived })} /> });
  if (canLock)
    rows.push({ key: "lock", node: (first) => <GroupRow first={first} testID="header-more-lock" icon="lock-simple" label={f.locked ? t`Unlock thread` : t`Lock thread`} onPress={() => edit({ locked: !f.locked })} /> });
  if (f.settings)
    rows.push({
      key: "settings",
      node: (first) => <GroupRow first={first} testID="header-more-settings" icon="gear-six" label={t`Channel settings`} chevron onPress={fromMore(() => router.push({ pathname: "/channel-settings/[id]", params: { id: channelId } }))} />,
    });

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <HeaderButton testID="header-search" icon="magnifying-glass" label={t`Search messages`} onPress={() => router.push({ pathname: "/search/[id]", params: { id: channelId } })} />
      {canListThreads ? <HeaderButton testID="header-threads" icon="chat-circle" label={t`Threads`} onPress={() => details("threads")} /> : null}
      {rows.length ? (
        <>
          <HeaderButton testID="header-more" icon="dots-three" label={t`More`} onPress={() => setMore(true)} />
          <Sheet visible={more} onClose={() => setMore(false)} testID="header-more-sheet">
            <RowGroup>{rows.map((row, i) => <View key={row.key}>{row.node(i === 0)}</View>)}</RowGroup>
          </Sheet>
        </>
      ) : null}
      {canListThreads ? <StartThreadHost channelId={channelId} /> : null}
    </View>
  );
}
