/**
 * The outbox (web: stores/Draft.ts outbox + stores/outboxRules.ts): every
 * message is shown in the chat the moment it is sent, as "Sending…", and
 * stays until the server has it. Without a connection it waits ("Waiting to
 * send") and goes out by itself when the connection is back; a message the
 * server refuses stays as "Failed to send" until the person retries or
 * deletes it.
 *
 * Every message keeps one idempotency key for its whole life, also across
 * retries and restarts: the server answers a second post with the same key
 * with `DuplicateNonce`, so a message whose first answer was lost is never
 * posted twice.
 */

export type OutboxFile = { uri: string; name: string; type: string; size?: number; spoiler?: boolean };
export type OutboxReply = { id: string; mention: boolean };

export type OutboxStatus = "sending" | "unsent" | "failed" | "sent";

export type OutboxEntry = {
  /** The idempotency key (a ULID, so it also orders by time) */
  key: string;
  channelId: string;
  content: string;
  replies?: OutboxReply[];
  files?: OutboxFile[];
  status: OutboxStatus;
  /** API error type of the last refused attempt */
  error?: string;
  /** Set once the server has it: the row hides when this message is on screen */
  messageId?: string;
  createdAt: number;
};

export type Outbox = Record<string, OutboxEntry[]>;

export type OutboxOutcome =
  /** The server has it (now, or from an earlier attempt) */
  | { kind: "sent" }
  /** The network failed: it waits and is sent again by itself */
  | { kind: "wait" }
  /** The server refused it: it stays, marked, until the person decides */
  | { kind: "failed"; error?: string };

/** API error types that mean "this exact message is already posted" */
const ALREADY_SENT = new Set(["DuplicateNonce"]);
/** API error types another try can fix by itself */
const TRY_AGAIN = new Set(["InternalError", "DatabaseError", "ProxyError"]);

/** Read the outcome of a failed attempt from what was thrown */
export function outcomeOfError(error: unknown): OutboxOutcome {
  const type = (error as { type?: unknown } | null | undefined)?.type;
  if (typeof type !== "string") return { kind: "wait" }; // no answer at all
  if (ALREADY_SENT.has(type)) return { kind: "sent" };
  if (TRY_AGAIN.has(type)) return { kind: "wait" };
  return { kind: "failed", error: type };
}

/** Pause before the queue is tried again after a failed pass, in milliseconds */
export function outboxRetryDelay(failures: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1));
}

/** Whether an entry is one the queue sends by itself */
export const waitsToBeSent = (entry: { status: OutboxStatus }) => entry.status === "unsent";

/** The outbox with one entry added or replaced (kept in key order) */
export function putEntry(outbox: Outbox, entry: OutboxEntry): Outbox {
  const list = (outbox[entry.channelId] ?? []).filter((e) => e.key !== entry.key);
  list.push(entry);
  list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { ...outbox, [entry.channelId]: list };
}

/** The outbox with one entry changed (nothing when it is gone) */
export function patchEntry(outbox: Outbox, channelId: string, key: string, patch: Partial<OutboxEntry>): Outbox {
  const list = outbox[channelId];
  if (!list?.some((e) => e.key === key)) return outbox;
  return { ...outbox, [channelId]: list.map((e) => (e.key === key ? { ...e, ...patch } : e)) };
}

/** The outbox without one entry */
export function dropEntry(outbox: Outbox, channelId: string, key: string): Outbox {
  const list = outbox[channelId];
  if (!list) return outbox;
  const left = list.filter((e) => e.key !== key);
  const next = { ...outbox };
  if (left.length) next[channelId] = left;
  else delete next[channelId];
  return next;
}

/**
 * The rows to draw under the loaded messages: sending ones first, then the
 * waiting and failed ones (web: DraftMessages). A sent entry stays until its
 * message is on screen, so the row never blinks away before the message
 * shows (no jump on send).
 */
export function visibleEntries(list: readonly OutboxEntry[] | undefined, shown: ReadonlySet<string> | readonly string[]): OutboxEntry[] {
  if (!list?.length) return [];
  const has = (id: string) => ("has" in shown ? (shown as ReadonlySet<string>).has(id) : (shown as readonly string[]).includes(id));
  const live = list.filter((e) => !(e.status === "sent" && e.messageId && has(e.messageId)));
  return [...live.filter((e) => e.status === "sending" || e.status === "sent"), ...live.filter((e) => e.status === "unsent" || e.status === "failed")];
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Read the stored outbox: what was sending when the app closed waits again;
 * a message the server refused stays refused; sent ones are dropped.
 */
export function cleanOutbox(raw: unknown): Outbox {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Outbox = {};
  for (const [channelId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!ULID.test(channelId) || !Array.isArray(list)) continue;
    const kept: OutboxEntry[] = [];
    for (const item of list) {
      const e = item as Partial<OutboxEntry> | null;
      if (!e || typeof e.key !== "string" || !ULID.test(e.key) || typeof e.content !== "string") continue;
      if (e.status === "sent" || !["sending", "unsent", "failed"].includes(e.status as string)) continue;
      const files = Array.isArray(e.files) ? e.files.filter((f) => f && typeof f.uri === "string" && typeof f.name === "string" && typeof f.type === "string") : undefined;
      if (!e.content && !files?.length) continue;
      const refused = e.status === "failed" && typeof e.error === "string";
      const entry: OutboxEntry = {
        key: e.key,
        channelId,
        content: e.content,
        status: refused ? "failed" : "unsent",
        createdAt: typeof e.createdAt === "number" ? e.createdAt : 0,
      };
      if (refused) entry.error = e.error;
      if (files?.length) entry.files = files;
      if (Array.isArray(e.replies)) entry.replies = e.replies.filter((r) => r && typeof r.id === "string").map((r) => ({ id: r.id, mention: !!r.mention }));
      kept.push(entry);
    }
    if (kept.length) out[channelId] = kept;
  }
  return out;
}

/** What is written to disk: everything except the entries already sent */
export function storedOutbox(outbox: Outbox): Outbox {
  const out: Outbox = {};
  for (const [id, list] of Object.entries(outbox)) {
    const kept = list.filter((e) => e.status !== "sent");
    if (kept.length) out[id] = kept;
  }
  return out;
}

/** The file name the server reads as "spoiler" (web: SPOILER_ prefix) */
export const uploadName = (file: OutboxFile) => (file.spoiler && !file.name.startsWith("SPOILER_") ? `SPOILER_${file.name}` : file.name);
