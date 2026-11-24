/**
 * Everything notifications do while someone is signed in (web:
 * NotificationsController + NotificationsWorker). Renders nothing; mounted
 * once inside ClientProvider (src/app/(app)/_layout.tsx).
 *
 * - asks for the permission once, the first time the app is connected,
 *   after the Android channels exist; then sends the device token to the
 *   server (`POST /push/subscribe`, endpoint `fcm` or `apn`) and again when
 *   the system hands out a new token;
 * - while the app is open and connected, a message raises a notification
 *   here, after the web's rules (own messages, the channel on screen,
 *   blocked people, mutes, level, Busy/Focus); pushes from the server stay
 *   quiet then, so nothing shows twice;
 * - a tap on a notification opens its channel, DM or profile;
 * - reading a channel takes its notifications away;
 * - the app icon shows the unread mention count;
 * - a link that opened the app before sign-in opens now.
 */
import { useLingui } from "@lingui/react/macro";
import type { Channel, Message } from "@zrzur/sdk/solid";
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useClient, useLiveStatus } from "@/client/ClientProvider";
import { type Emitter, useSdkEvent, useSolid } from "@/sdk/bridge";

import { badgeCount } from "./badge";
import { ANDROID_CHANNELS, messageBody, messageTitle } from "./content";
import { type ChannelType, effectiveSuppress, mentionsForNotification, shouldNotify } from "./levels";
import { pushTarget } from "./links";
import { setInsideApp, takeLink } from "./pending";
import { appPresence } from "./presence";
import { askPermission, ensureAndroidChannels, readPermission, readPushChoiceStored, registerDevice } from "./push";
import { shouldPrompt, shouldRegister } from "./register";
import { dropNotificationStore, notificationStore } from "./store";

/** Every place a notification keeps its data: our own, Apple's payload, Firebase's data */
export function notificationData(notification: Notifications.Notification): Record<string, unknown> {
  const request = notification.request;
  const trigger = request.trigger as { type?: string; payload?: Record<string, unknown>; remoteMessage?: { data?: Record<string, unknown> } } | null;
  return {
    ...(trigger?.remoteMessage?.data ?? {}),
    ...(trigger?.payload ?? {}),
    ...((request.content.data as Record<string, unknown> | null) ?? {}),
  };
}

function isRemote(notification: Notifications.Notification): boolean {
  return (notification.request.trigger as { type?: string } | null)?.type === "push";
}

// decided before any component mounts, so a push in the first second is handled too
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const target = pushTarget(notificationData(notification));
    const onScreen = !!target?.channelId && target.channelId === appPresence.viewingChannelId;
    // the connected app shows its own notifications; a push would be a second one
    const quiet = onScreen || (isRemote(notification) && appPresence.connected);
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet && isRemote(notification), shouldSetBadge: false };
  },
});

/** Take away the notifications of a channel that has been read */
async function dismissChannel(channelId: string) {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => pushTarget(notificationData(n))?.channelId === channelId || n.request.identifier === `channel-${channelId}`)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // nothing shown, or the system refused: nothing to take away
  }
}

type ClientEvents = {
  messageCreate: [message: Message];
  channelAcknowledged: [channel: Channel, messageId: string];
};

const SYSTEM_USER = "00000000000000000000000000";

export function NotificationsController() {
  const client = useClient();
  const status = useLiveStatus();
  const pathname = usePathname();
  const { t, i18n } = useLingui();
  const ready = useSolid(client.ready);
  const store = notificationStore(client);
  const prompted = useRef(false);
  const handledResponse = useRef<string | undefined>(undefined);

  // the open channel and the connection, for the push handlers
  const viewing = /^\/channel\/([^/?]+)/.exec(pathname)?.[1];
  useEffect(() => {
    appPresence.viewingChannelId = viewing;
    if (viewing) void dismissChannel(viewing);
  }, [viewing]);
  useEffect(() => {
    appPresence.connected = status === "connected";
  }, [status]);

  // signed in: links open here from now on; a kept one opens now
  useEffect(() => {
    setInsideApp(true);
    const href = takeLink();
    if (href && href.split("?")[0] !== pathname) router.push(href as never);
    return () => setInsideApp(false);
    // once, when the signed-in app appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new client is a new account: its store and what it showed go with it
  useEffect(
    () => () => {
      dropNotificationStore(client);
      appPresence.connected = false;
      appPresence.viewingChannelId = undefined;
      void Notifications.dismissAllNotificationsAsync().catch(() => {});
      void Notifications.setBadgeCountAsync(0).catch(() => {});
    },
    [client],
  );

  useEffect(() => {
    if (ready) store.rememberChannels();
  }, [ready, store]);

  // permission and token
  useEffect(() => {
    if (status !== "connected" || Platform.OS === "web") return;
    let live = true;
    void (async () => {
      await ensureAndroidChannels(i18n).catch(() => {});
      const choice = await readPushChoiceStored();
      let permission = await readPermission();
      if (!prompted.current && shouldPrompt({ choice, ...permission, connected: true })) {
        prompted.current = true;
        permission = await askPermission();
      }
      if (live && shouldRegister({ choice, status: permission.status })) {
        await registerDevice(client).catch(() => {});
      }
    })();
    return () => {
      live = false;
    };
  }, [status, client, i18n]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addPushTokenListener((token) => {
      void (async () => {
        const choice = await readPushChoiceStored();
        const permission = await readPermission();
        if (shouldRegister({ choice, status: permission.status }) && typeof token.data === "string") {
          await registerDevice(client, token.data).catch(() => {});
        }
      })();
    });
    return () => sub.remove();
  }, [client]);

  // a tap on a notification (also the one that started the app)
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier + String(response.notification.date);
    if (handledResponse.current === id) return;
    handledResponse.current = id;
    const target = pushTarget(notificationData(response.notification));
    if (target) router.push(target.href as never);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // older native module: the handled id above keeps it from opening twice
    }
  }, [response]);

  // read elsewhere (another device, or here): its notifications go
  const events = client as unknown as Emitter<ClientEvents>;
  useSdkEvent(events, "channelAcknowledged", (channel) => {
    void dismissChannel(channel.id);
  });

  // a message while the app is open (web: NotificationsWorker.onMessage)
  useSdkEvent(events, "messageCreate", (message) => {
    const channel = message.channel;
    if (!channel || Platform.OS === "web") return;
    const us = client.user;
    const options = store.options();
    const serverId = channel.serverId || undefined;
    const mentioned = mentionsForNotification({
      selfId: us?.id,
      mentionIds: message.mentionIds,
      flags: message.flags,
      mentionsMyRole: !!message.roleMentions?.some((role) => role.assigned),
      suppressEveryone: serverId ? effectiveSuppress(options.suppress_everyone[channel.id], options.suppress_everyone[serverId]) : false,
      suppressRoles: serverId ? effectiveSuppress(options.suppress_roles[channel.id], options.suppress_roles[serverId]) : false,
    });
    const notify = shouldNotify({
      selfId: us?.id,
      authorId: message.authorId,
      authorBlocked: message.author?.relationship === "Blocked",
      channelId: channel.id,
      channelType: channel.type as ChannelType,
      serverId,
      serverDefault: channel.server?.defaultNotifications,
      viewingChannelId: appPresence.viewingChannelId,
      appActive: true,
      mentioned,
      presence: us?.status?.presence ?? undefined,
      options,
      now: Date.now(),
    });
    if (!notify) return;
    const title = messageTitle({
      channelType: channel.type,
      username: message.username ?? "",
      channelName: channel.name,
      serverName: channel.server?.name,
      systemAuthor: message.authorId === SYSTEM_USER,
    });
    if (!title) return;
    const body = messageBody(i18n, { content: message.content ? message.contentPlain : undefined, attachments: message.attachments?.length ?? 0 });
    void Notifications.scheduleNotificationAsync({
      identifier: `channel-${channel.id}`,
      content: {
        title,
        body: body ?? t`New message`,
        data: { href: `/channel/${channel.id}`, channelId: channel.id },
      },
      trigger: Platform.OS === "android" ? { channelId: ANDROID_CHANNELS.messages } : null,
    }).catch(() => {});
  });

  // the number on the app icon
  const badge = useSolid(
    useCallback(
      () =>
        client.ready()
          ? badgeCount(
              client.channels.toList().map((c) => ({
                type: c.type,
                unread: c.unread,
                muted: c.muted,
                mentions: c.mentions?.size ?? 0,
              })),
            )
          : 0,
      [client],
    ),
  );
  useEffect(() => {
    if (Platform.OS === "web" || !ready) return;
    void Notifications.setBadgeCountAsync(badge).catch(() => {});
  }, [badge, ready]);

  return null;
}
