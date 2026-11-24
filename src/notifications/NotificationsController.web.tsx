/**
 * Web build (preview and tests in a browser): there is no phone push,
 * badge or notification tray, and expo-notifications' native calls throw
 * there, so the controller does nothing.
 */
export function notificationData(): Record<string, unknown> {
  return {};
}

export function NotificationsController() {
  return null;
}
