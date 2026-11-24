/**
 * The outbox store: one list per channel, kept on disk, sent one message at
 * a time in the order written. See rules.ts for the behaviour.
 */
import type { Channel, Client } from "@zrzur/sdk/solid";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { useClient, useLiveStatus } from "@/client/ClientProvider";
import { newUlid } from "@/ui/server/ulid";

import { jsonFile } from "../persist";
import { uploadAttachment } from "../upload";
import {
  cleanOutbox,
  dropEntry,
  type Outbox,
  type OutboxEntry,
  type OutboxFile,
  type OutboxReply,
  outboxRetryDelay,
  outcomeOfError,
  patchEntry,
  putEntry,
  storedOutbox,
  uploadName,
  waitsToBeSent,
} from "./rules";

const file = jsonFile("zrzur-outbox.json", cleanOutbox);
let outbox: Outbox = {};
let loading: Promise<void> | undefined;
/** Upload progress per entry key (0–1), not stored */
let progress: Record<string, number> = {};
const listeners = new Set<() => void>();
const EMPTY: OutboxEntry[] = [];

function set(next: Outbox) {
  outbox = next;
  file.write(storedOutbox(outbox));
  for (const l of listeners) l();
}

function setProgress(key: string, value: number | undefined) {
  progress = { ...progress };
  if (value === undefined) delete progress[key];
  else progress[key] = value;
  for (const l of listeners) l();
}

/** Load the stored outbox (once); entries written meanwhile are kept */
export function loadOutbox(): Promise<void> {
  loading ??= file.read().then((stored) => {
    let merged = stored;
    for (const list of Object.values(outbox)) for (const e of list) merged = putEntry(merged, e);
    outbox = merged;
    for (const l of listeners) l();
  });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A channel's outbox entries (live) */
export function useOutbox(channelId: string): OutboxEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => outbox[channelId] ?? EMPTY,
    () => outbox[channelId] ?? EMPTY,
  );
}

/** Upload progress of one entry (0–1), or undefined */
export function useOutboxProgress(key: string): number | undefined {
  return useSyncExternalStore(
    subscribe,
    () => progress[key],
    () => progress[key],
  );
}

export const findEntry = (channelId: string, key: string) => outbox[channelId]?.find((e) => e.key === key);

/** Files uploaded already, per entry, so a retry does not upload again */
const uploaded = new Map<string, string[]>();

async function uploadAll(client: Client, entry: OutboxEntry): Promise<string[]> {
  const ids = uploaded.get(entry.key) ?? [];
  const files = entry.files ?? [];
  for (let i = ids.length; i < files.length; i++) {
    const f: OutboxFile = files[i];
    let uri = f.uri;
    const name = uploadName(f);
    if (name !== f.name) {
      // the server reads "spoiler" from the file name: upload a copy named so
      const copy = new File(Paths.cache, `${entry.key}-${i}`, name);
      try {
        if (!copy.parentDirectory.exists) copy.parentDirectory.create({ intermediates: true });
        if (!copy.exists) new File(f.uri).copy(copy);
        uri = copy.uri;
      } catch {
        // the plain file still goes out
      }
    }
    const job = uploadAttachment(client, { uri, name, type: f.type, size: f.size }, (fraction) =>
      setProgress(entry.key, (i + fraction) / files.length),
    );
    ids.push(await job.promise);
    uploaded.set(entry.key, ids);
  }
  return ids;
}

/** Try one entry now; answers whether it may still wait for a later pass */
async function attempt(client: Client, channel: Channel, entry: OutboxEntry): Promise<"sent" | "wait" | "failed"> {
  set(patchEntry(outbox, entry.channelId, entry.key, { status: "sending", error: undefined }));
  try {
    const attachments = entry.files?.length ? await uploadAll(client, entry) : [];
    const message = await channel.sendMessage(
      {
        content: entry.content || undefined,
        attachments: attachments.length ? attachments : undefined,
        replies: entry.replies?.length ? entry.replies : undefined,
      } as never,
      entry.key,
    );
    uploaded.delete(entry.key);
    setProgress(entry.key, undefined);
    const id = (message as { id?: string } | undefined)?.id;
    if (id) {
      set(patchEntry(outbox, entry.channelId, entry.key, { status: "sent", messageId: id }));
      // the row hides when the message shows; this is only the safety net
      setTimeout(() => set(dropEntry(outbox, entry.channelId, entry.key)), 30_000);
    } else set(dropEntry(outbox, entry.channelId, entry.key));
    return "sent";
  } catch (error) {
    setProgress(entry.key, undefined);
    const outcome = outcomeOfError(error);
    if (outcome.kind === "sent") {
      uploaded.delete(entry.key);
      set(dropEntry(outbox, entry.channelId, entry.key));
      return "sent";
    }
    if (outcome.kind === "wait") {
      set(patchEntry(outbox, entry.channelId, entry.key, { status: "unsent", error: undefined }));
      scheduleFlush(client);
      return "wait";
    }
    set(patchEntry(outbox, entry.channelId, entry.key, { status: "failed", error: outcome.error }));
    return "failed";
  }
}

let failures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
/** The newest client and whether it is online, for the timed passes */
let online = true;

function scheduleFlush(client: Client) {
  if (timer) return;
  failures++;
  timer = setTimeout(() => {
    timer = undefined;
    void flushOutbox(client);
  }, outboxRetryDelay(failures));
}

/**
 * Send what waits: when the connection is back, when the app comes to the
 * front, and after a failed pass. One at a time, in the order written; a
 * channel whose message fails keeps the rest for the next pass.
 */
export async function flushOutbox(client: Client) {
  if (flushing || !online) return;
  flushing = true;
  let failed = false;
  try {
    await loadOutbox();
    for (const channelId of Object.keys(outbox)) {
      const channel = client.channels.get(channelId);
      if (!channel) continue;
      for (const entry of [...(outbox[channelId] ?? [])]) {
        if (!waitsToBeSent(entry)) continue;
        if ((await attempt(client, channel, entry)) === "wait") {
          failed = true;
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (!failed) failures = 0;
}

export type OutgoingMessage = { content: string; replies?: OutboxReply[]; files?: OutboxFile[] };

/**
 * Put a message in the outbox and send it (waits when offline). The row
 * shows at once; the promise settles after the first attempt.
 */
export function sendMessage(client: Client, channel: Channel, message: OutgoingMessage, connected: boolean): Promise<"sent" | "wait" | "failed"> {
  const entry: OutboxEntry = {
    key: newUlid(Date.now(), Math.random),
    channelId: channel.id,
    content: message.content,
    replies: message.replies?.length ? message.replies : undefined,
    files: message.files?.length ? message.files : undefined,
    status: connected ? "sending" : "unsent",
    createdAt: Date.now(),
  };
  set(putEntry(outbox, entry));
  if (!connected) return Promise.resolve("wait");
  // one at a time: a message written while another is uploading goes after it
  const earlier = (outbox[channel.id] ?? []).some((e) => e.key !== entry.key && e.status === "sending");
  if (earlier) {
    set(patchEntry(outbox, channel.id, entry.key, { status: "unsent" }));
    scheduleFlush(client);
    return Promise.resolve("wait");
  }
  return attempt(client, channel, entry);
}

/** Retry a waiting or refused message, with the same key */
export function retrySend(client: Client, channel: Channel, key: string) {
  const entry = findEntry(channel.id, key);
  if (!entry || entry.status === "sending" || entry.status === "sent") return;
  void attempt(client, channel, entry);
}

/** Remove a waiting or refused message */
export function cancelSend(channelId: string, key: string) {
  uploaded.delete(key);
  set(dropEntry(outbox, channelId, key));
}

/**
 * Mount once per chat screen: loads the stored outbox and sends what waits
 * when the connection comes back or the app returns to the front.
 */
export function useOutboxFlush() {
  const client = useClient();
  const status = useLiveStatus();
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
    online = status === "connected";
  });
  const flush = useCallback(() => {
    if (online) void flushOutbox(clientRef.current);
  }, []);
  useEffect(() => {
    if (status === "connected") {
      failures = 0;
      flush();
    }
  }, [status, flush]);
  useEffect(() => {
    void loadOutbox().then(flush);
    const sub = AppState.addEventListener("change", (next) => next === "active" && flush());
    return () => sub.remove();
  }, [flush]);
}
