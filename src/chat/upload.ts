import type { Client } from "@zrzur/sdk/solid";
import { Directory, File, Paths, UploadType } from "expo-file-system";
import { Platform } from "react-native";

export type PickedFile = { uri: string; name: string; type: string; size?: number };

export type UploadJob = { promise: Promise<string>; cancel: () => void };

/** The file service's answer: `{ id }`, or an error the API layer understands */
function readId(status: number, body: string): string {
  let data: { id?: string; type?: string } = {};
  try {
    data = JSON.parse(body);
  } catch {
    // not JSON
  }
  if (status >= 200 && status < 300 && data.id) return data.id;
  const error = new Error(data.type ?? "UploadFailed") as Error & { type?: string; status?: number };
  error.type = data.type ?? "UploadFailed";
  error.status = status;
  throw error;
}

/**
 * Upload one attachment to the file service with progress (0–1) and a way
 * to cancel it. Phones use the native uploader (expo-file-system), which
 * streams from disk instead of reading the file into memory; the web build
 * falls back to the SDK.
 */
export function uploadAttachment(client: Client, file: PickedFile, onProgress: (fraction: number) => void): UploadJob {
  const base = client.configuration?.features?.autumn?.url;
  if (Platform.OS === "web" || !base) {
    return { promise: client.uploadFile("attachments", file as unknown as globalThis.File), cancel: () => {} };
  }
  const headers = (client.api as unknown as { auth: Record<string, string> }).auth;
  let task: ReturnType<File["createUploadTask"]> | undefined;
  let cancelled = false;
  const promise = namedCopy(file).then((source) => {
    if (cancelled) throw Object.assign(new Error("Cancelled"), { type: "Cancelled" });
    task = source.createUploadTask(`${base.replace(/\/$/, "")}/attachments`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: file.type,
      headers,
      onProgress: ({ bytesSent, totalBytes }) => {
        // iOS reports the byte counts as BigInt: mixing them with numbers throws
        const sent = Number(bytesSent);
        const total = Number(totalBytes);
        if (total > 0) onProgress(Math.min(1, sent / total));
      },
    });
    return task.uploadAsync().then((result) => readId(result.status, result.body));
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/**
 * The native uploader sends the file's name on disk, not `file.name`. When
 * they differ (a Photos copy, a picker cache file) upload a copy that carries
 * the chosen name, so the server and the web see the real file name.
 */
async function namedCopy(file: PickedFile): Promise<File> {
  const source = new File(file.uri);
  const wanted = file.name?.trim();
  if (!wanted || source.name === wanted) return source;
  const folder = new Directory(Paths.cache, "upload", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, wanted.replace(/[/\\]/g, "_"));
  await source.copy(target);
  return target;
}
