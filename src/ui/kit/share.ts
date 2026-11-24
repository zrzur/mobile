/**
 * Saving and sharing out (attachment viewer, message sheet, menus).
 *
 *   saveToPhotos(url, name)  downloads to the cache, asks for add-only Photos
 *                            access (never reads the library) and saves the
 *                            image or video; "saved" | "denied" | "failed".
 *                            A blocked permission offers Open settings.
 *   shareFile(url, name)     downloads, then the system share sheet (Save to
 *                            Files, AirDrop, other apps)
 *   shareText({ message, url })  the share sheet for a link or text
 *   copyToClipboard(text)    copies with a success tap (every Copy … row)
 *
 * Haptics: success when saved, error when it fails. Callers show the toast.
 */
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

import { explainPermission, permissionOutcome } from "@/lib/permissions";

import { haptics } from "./haptics";

/** A file name safe for the cache folder, keeping the extension */
export function cacheName(name: string | undefined, url: string): string {
  const fromUrl = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
  const raw = (name || fromUrl || "file").replace(/[\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return raw.slice(-120) || "file";
}

async function download(url: string, name?: string): Promise<File> {
  const target = new File(Paths.cache, `${Date.now()}-${cacheName(name, url)}`);
  return File.downloadFileAsync(url, target, { idempotent: true });
}

export async function saveToPhotos(url: string, name?: string): Promise<"saved" | "denied" | "failed"> {
  if (Platform.OS === "web") return "failed";
  try {
    const answer = await requestPermissionsAsync(true);
    const outcome = permissionOutcome(answer);
    if (outcome !== "granted") {
      explainPermission("photos-save", outcome);
      return "denied";
    }
    const file = await download(url, name);
    await saveToLibraryAsync(file.uri);
    haptics.success();
    return "saved";
  } catch {
    haptics.error();
    return "failed";
  }
}

export async function shareFile(url: string, name?: string): Promise<void> {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
    await Share.share({ url, message: url }).catch(() => {});
    return;
  }
  try {
    const file = await download(url, name);
    await Sharing.shareAsync(file.uri, { dialogTitle: name });
  } catch {
    haptics.error();
  }
}

export async function shareText({ message, url }: { message?: string; url?: string }): Promise<void> {
  // iOS shows the url as a link card; Android only reads `message`
  if (Platform.OS === "ios") await Share.share(url ? { url, message: message ?? "" } : { message: message ?? "" }).catch(() => {});
  else await Share.share({ message: [message, url].filter(Boolean).join("\n") }).catch(() => {});
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
  haptics.success();
}
