/**
 * Which file of a message the message sheet's file rows act on (web: the
 * right-clicked file of MessageContextMenu). A hold on a picture, video or
 * file marks it just before the sheet opens; a hold elsewhere on a message
 * with one file uses that file; with several files and no mark, the sheet
 * shows no file rows (it can't know which one is meant).
 */

export type SheetFile = {
  id: string;
  /** The original file (download, save, share) */
  url: string;
  /** What "Open file" shows (the web's preview address) */
  previewUrl?: string;
  name: string;
  kind: "image" | "video" | "audio" | "file";
};

let marked: { messageId: string; fileId: string; at: number } | null = null;

/** A hold on one file of a message, just before the sheet opens */
export function markPressedFile(messageId: string, fileId: string, now = Date.now()) {
  marked = { messageId, fileId, at: now };
}

export function clearPressedFile() {
  marked = null;
}

/** A mark is good for the sheet that opens right after it */
const FRESH_MS = 3000;

/** The file the sheet acts on, or null */
export function pickSheetFile(messageId: string, files: SheetFile[], now = Date.now()): SheetFile | null {
  const mark = marked && marked.messageId === messageId && now - marked.at < FRESH_MS ? marked : null;
  if (mark) {
    const found = files.find((f) => f.id === mark.fileId);
    if (found) return found;
  }
  return files.length === 1 ? files[0] : null;
}

/** Photos and videos go to the phone's Photos; anything else is saved through the share sheet (Save to Files) */
export function savesToPhotos(file: SheetFile): boolean {
  return file.kind === "image" || file.kind === "video";
}
