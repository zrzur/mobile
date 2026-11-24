import type { Message } from "@zrzur/sdk/solid";

import type { SheetFile } from "@/media/pressedFile";

import { isVoiceAttachment } from "./voice";

type FileLike = {
  id: string;
  filename?: string;
  metadata?: { type?: string };
  originalUrl?: string;
  previewUrl?: string;
  createFileURL?: () => string | undefined;
};

/** One attachment as the message sheet's file rows use it */
export function toSheetFile(a: FileLike): SheetFile | null {
  const url = a.originalUrl || a.createFileURL?.();
  if (!url) return null;
  const type = a.metadata?.type;
  return {
    id: a.id,
    url,
    previewUrl: a.previewUrl || undefined,
    name: a.filename || a.id,
    // a voice note is audio even where the media server labelled it a video or a plain file
    kind: isVoiceAttachment(a) || type === "Audio" ? "audio" : type === "Image" ? "image" : type === "Video" ? "video" : "file",
  };
}

/** Every attachment of a message, in order */
export function sheetFiles(message: Pick<Message, "attachments">): SheetFile[] {
  return ((message.attachments ?? []) as unknown as FileLike[]).map(toSheetFile).filter((f): f is SheetFile => !!f);
}
