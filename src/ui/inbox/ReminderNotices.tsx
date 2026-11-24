import { useLingui } from "@lingui/react/macro";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { attachReminders, savedRemindersEnabled } from "@/chat/keep";
import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";
import { ANDROID_CHANNELS } from "@/notifications/content";
import { showSnack } from "@/ui/notices/snack";

import { openMessage } from "./InboxPage";

/**
 * A reminder that comes due while the app is open (web: MentionsHost
 * onDue): a short message with a way to the message ("Reminder: words…",
 * Open message), and a phone notification when the app is in the
 * background. A due reminder whose message is gone points to the list.
 * The Notifications page counts the ones not looked at on its Reminders
 * chip.
 */
export function ReminderNotices() {
  const { t } = useLingui();
  const client = useClient();
  const ready = useSolid(client.ready);
  const on = ready && savedRemindersEnabled(client);

  useEffect(() => {
    if (!on) return;
    attachReminders(client, (reminder, message) => {
      const words = message ? client.markdownToText(message.content ?? "") : "";
      const text = message ? t`Reminder: ${words.slice(0, 80)}` : t`A reminder is due, but its message is no longer available.`;
      const go = () => (message ? openMessage(message) : router.push("/reminders"));
      showSnack({ message: text, action: message ? t`Open message` : t`Show reminders`, onAction: go });
      if (AppState.currentState !== "active") {
        void Notifications.scheduleNotificationAsync({
          identifier: `reminder-${reminder._id}`,
          content: {
            title: t`Reminder`,
            body: message ? words.slice(0, 200) : text,
            data: message ? { href: `/channel/${reminder.channel}?message=${reminder.message}`, channelId: reminder.channel } : { href: "/reminders" },
          },
          trigger: Platform.OS === "android" ? { channelId: ANDROID_CHANNELS.messages } : null,
        }).catch(() => {});
      }
    });
    // attached once per client; the words are read when a reminder comes due
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, on]);

  return null;
}
