/**
 * Over-the-air updates (web: swUpdate.ts, the service worker's "a new
 * version is ready"): the app looks for a new update when it starts and
 * when it comes back to the front, at most every half hour, and downloads
 * it quietly. The phone tab bar then shows one quiet row; the app reloads
 * only when "Update" is tapped. Store updates need no row: the store does
 * them.
 */
import * as Updates from "expo-updates";
import { AppState } from "react-native";

/** Least time between two looks */
export const UPDATE_CHECK_GAP_MS = 30 * 60_000;

/** Whether it is time to look again */
export function shouldCheckUpdate(lastCheck: number | undefined, now: number, enabled: boolean): boolean {
  if (!enabled) return false;
  return lastCheck === undefined || now - lastCheck >= UPDATE_CHECK_GAP_MS;
}

let lastCheck: number | undefined;
let running = false;

/** Look for an update and download it (silent on failure: offline, no channel) */
export async function checkForUpdate(now = Date.now()) {
  if (running || __DEV__ || !shouldCheckUpdate(lastCheck, now, Updates.isEnabled)) return;
  running = true;
  lastCheck = now;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // tried again on the next start or return to the front
  } finally {
    running = false;
  }
}

let watching = false;

/** Start looking (once per app run): now and whenever the app returns to the front */
export function watchForUpdates() {
  if (watching) return;
  watching = true;
  void checkForUpdate();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void checkForUpdate();
  });
}

/** Restart into the downloaded update */
export function applyUpdate() {
  void Updates.reloadAsync().catch(() => {});
}
