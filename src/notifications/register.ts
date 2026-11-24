/**
 * The body of `POST /push/subscribe` for a phone, and when the app asks
 * for the notification permission. Pure, so it is unit tested.
 *
 * The server (delta routes/push/subscribe.rs, WebPushSubscription::is_allowed)
 * takes the endpoints `apn` and `fcm` for phones, with the device token in
 * `auth`; pushd then sends through Apple (outbound/apn.rs) or Firebase
 * (outbound/fcm.rs). `p256dh` is only for Web Push and stays empty.
 */

export type PushProvider = "apn" | "fcm";

export function pushProvider(os: string): PushProvider | undefined {
  if (os === "ios") return "apn";
  if (os === "android") return "fcm";
  return undefined;
}

/** The server refuses longer tokens (MAX_ENDPOINT) */
export const MAX_TOKEN = 1024;

export function subscriptionBody(os: string, token: string): { endpoint: PushProvider; p256dh: string; auth: string } | undefined {
  const endpoint = pushProvider(os);
  if (!endpoint || !token || token.length > MAX_TOKEN) return undefined;
  return { endpoint, p256dh: "", auth: token };
}

/** The person's own switch in Settings > Notifications, kept on this device */
export const PUSH_PREF_KEY = "zrzur.prefs.push";
export type PushChoice = "on" | "off" | undefined;

export function readPushChoice(raw: string | null | undefined): PushChoice {
  return raw === "on" || raw === "off" ? raw : undefined;
}

/**
 * Whether to show the system prompt now. Asked once, the first time the
 * signed-in app is connected (web: on the first click after the page loads),
 * never when the person switched push off or the system will not ask again.
 */
export function shouldPrompt(input: { choice: PushChoice; status: "granted" | "denied" | "undetermined"; canAskAgain: boolean; connected: boolean }): boolean {
  if (!input.connected || input.choice === "off") return false;
  return input.status === "undetermined" && input.canAskAgain;
}

/** Whether the device token should be (re)sent to the server */
export function shouldRegister(input: { choice: PushChoice; status: "granted" | "denied" | "undetermined" }): boolean {
  return input.choice !== "off" && input.status === "granted";
}
