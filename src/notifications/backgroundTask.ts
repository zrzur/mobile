/**
 * Android, app in the background or closed: pushd sends Firebase *data*
 * messages (no title, outbound/fcm.rs), which the system does not show by
 * itself. This task turns them into notifications, after this device's
 * copy of the member's mutes and levels.
 *
 * Must be imported at the top of the app's entry (src/app/_layout.tsx), so
 * the task is defined whenever Android starts the app's code for a push.
 * Apple pushes carry their own alert and are shown by iOS.
 */
import { getLocales } from "expo-localization";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { i18n } from "@/i18n/i18n";
import { pickLocale } from "@/i18n/locale";
import { secureStorage } from "@/lib/secureStorage";

import { endedCallId, fcmContent, taskData } from "./content";
import { parseOptions, pushAllowed } from "./levels";
import { appPresence } from "./presence";
import { loadCache } from "./store";

export const PUSH_TASK = "zrzur-push";

/** Same key as src/i18n/i18n.ts: the language the person picked */
const LOCALE_KEY = "zrzur.locale";

async function activateLanguage() {
  if (i18n.locale) return;
  // catalogs load with the i18n module; only the language is picked here
  const saved = await secureStorage.get(LOCALE_KEY).catch(() => null);
  i18n.activate(pickLocale(saved, getLocales().map((l) => l.languageTag)));
}

export async function handlePushData(data: Record<string, unknown>) {
  const ended = endedCallId(data);
  if (ended) {
    await Notifications.dismissNotificationAsync(ended).catch(() => {});
    return;
  }
  // the open, connected app shows its own notifications for these
  if (AppState.currentState === "active" && appPresence.connected) return;

  await activateLanguage();
  const content = fcmContent(i18n, data);
  if (!content) return;

  if (content.data.channelId) {
    const cache = await loadCache();
    const serverId = cache.servers[content.data.channelId];
    const allowed = pushAllowed({
      options: parseOptions(cache.value, Date.now()),
      channelId: content.data.channelId,
      serverId,
      serverDefault: serverId ? cache.serverDefaults[serverId] : undefined,
      now: Date.now(),
    });
    if (!allowed) return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: content.identifier,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      sound: "default",
    },
    trigger: Platform.OS === "android" ? { channelId: content.androidChannel } : null,
  });
}

if (Platform.OS === "android" && !TaskManager.isTaskDefined(PUSH_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
    if (error) return Notifications.BackgroundNotificationTaskResult.Failed;
    // a tap on a notification also comes here on Android; the app handles taps itself
    if (data && typeof data === "object" && "actionIdentifier" in data) return Notifications.BackgroundNotificationTaskResult.NoData;
    const fcm = taskData(data);
    if (!fcm) return Notifications.BackgroundNotificationTaskResult.NoData;
    try {
      await handlePushData(fcm);
      return Notifications.BackgroundNotificationTaskResult.NewData;
    } catch {
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  });
  Notifications.registerTaskAsync(PUSH_TASK).catch(() => {});
}
