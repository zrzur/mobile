/**
 * The phone side of push: Android notification channels, the system
 * permission, the device token and its registration with the server.
 */
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Client } from "@zrzur/sdk/solid";
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { Platform } from "react-native";

import { secureStorage } from "@/lib/secureStorage";

import { ANDROID_CHANNELS } from "./content";
import { PUSH_PREF_KEY, type PushChoice, readPushChoice, subscriptionBody } from "./register";

const CHANNEL_MESSAGES = msg`Messages`;
const CHANNEL_FRIENDS = msg`Friend requests`;
const CHANNEL_CALLS = msg`Calls`;

/**
 * Android 8+: notifications belong to channels the person can tune in the
 * system settings. Android 13+ shows the permission prompt only once a
 * channel exists, so this runs before asking.
 */
export async function ensureAndroidChannels(i18n: I18n) {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.messages, {
      name: i18n._(CHANNEL_MESSAGES),
      importance: AndroidImportance.HIGH,
      showBadge: true,
    }),
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.friends, {
      name: i18n._(CHANNEL_FRIENDS),
      importance: AndroidImportance.DEFAULT,
      showBadge: true,
    }),
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.calls, {
      name: i18n._(CHANNEL_CALLS),
      importance: AndroidImportance.MAX,
      showBadge: false,
    }),
  ]);
}

export type PermissionState = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean };

function toState(answer: Notifications.NotificationPermissionsStatus): PermissionState {
  // iOS "provisional" delivers quietly: count it as allowed, like the system does
  const granted = answer.granted || answer.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  const status = granted ? "granted" : answer.status === "undetermined" ? "undetermined" : "denied";
  return { status, canAskAgain: answer.canAskAgain };
}

export async function readPermission(): Promise<PermissionState> {
  try {
    return toState(await Notifications.getPermissionsAsync());
  } catch {
    return { status: "denied", canAskAgain: false };
  }
}

export async function askPermission(): Promise<PermissionState> {
  try {
    return toState(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    );
  } catch {
    return { status: "denied", canAskAgain: false };
  }
}

export async function readPushChoiceStored(): Promise<PushChoice> {
  return readPushChoice(await secureStorage.get(PUSH_PREF_KEY).catch(() => null));
}

export async function storePushChoice(choice: "on" | "off") {
  await secureStorage.set(PUSH_PREF_KEY, choice).catch(() => {});
}

type PushApi = { post(path: string, body?: unknown): Promise<unknown> };

/**
 * Send this phone's token to the server for the signed-in session. Needs the
 * owner's Firebase project (Android) or Apple push key (iOS) in the build and
 * on the server; without them the system has no token and this throws.
 */
export async function registerDevice(client: Client, token?: string): Promise<void> {
  const value = token ?? (await Notifications.getDevicePushTokenAsync()).data;
  const body = subscriptionBody(Platform.OS, typeof value === "string" ? value : "");
  if (!body) throw new Error("no push token");
  await (client.api as unknown as PushApi).post("/push/subscribe", body);
}

/** Stop pushes to this session (the person switched push off) */
export async function unregisterDevice(client: Client): Promise<void> {
  await (client.api as unknown as PushApi).post("/push/unsubscribe");
}
