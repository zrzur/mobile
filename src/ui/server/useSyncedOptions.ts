/**
 * Folders and rail order from the synced settings. Notification levels
 * and mutes live in src/notifications (useNotificationOptions there).
 */
import { useClient } from "@/client/ClientProvider";

import { saveSynced, syncedNow, useSynced } from "./syncedStore";
import { cleanFolders, cleanOrdering, type ServerFolder } from "./syncedLogic";

/** The synced server folders and a writer (web: state["server-folders"]) */
export function useFolders() {
  const client = useClient();
  const { value, loaded } = useSynced("server-folders");
  const folders = cleanFolders(value);
  const save = (change: (current: ServerFolder[]) => ServerFolder[]) => saveSynced(client, "server-folders", { folders: change(cleanFolders(syncedNow("server-folders"))) });
  return { folders, loaded, save };
}

/** The synced rail order (web: state.ordering serverSidebar) */
export function useRailOrder(): string[] {
  const { value } = useSynced("ordering");
  return cleanOrdering(value);
}
