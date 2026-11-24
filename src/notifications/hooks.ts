import { useClient } from "@/client/ClientProvider";
import { useSolid } from "@/sdk/bridge";

import type { NotificationOptions } from "./levels";
import { type NotificationStore, notificationStore } from "./store";

/** The signed-in client's notification levels and mutes */
export function useNotificationStore(): NotificationStore {
  return notificationStore(useClient());
}

/** The levels and mutes; re-renders when they change */
export function useNotificationOptions(): { store: NotificationStore; options: NotificationOptions; now: number } {
  const store = useNotificationStore();
  const options = useSolid(store.options);
  const now = useSolid(store.now);
  return { store, options, now };
}
