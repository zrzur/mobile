/**
 * Ask for the "Start a thread" / "New post" sheet from anywhere (a message's
 * long-press sheet, the threads tab, the forum's New post button). The sheet
 * itself is drawn by `StartThreadHost` of the screen showing that channel, so
 * only one sheet opens at a time.
 */
export type StartThreadRequest = {
  /** the channel the thread or post goes in */
  channelId: string;
  /** the message the thread starts from (text channels only) */
  messageId?: string;
  /** a suggested name, e.g. the start of the message */
  name?: string;
};

let current: StartThreadRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Open the sheet for a channel, from a message or empty */
export function startThread(channelId: string, messageId?: string, name?: string) {
  current = { channelId, messageId, name };
  emit();
}

/** Close the sheet */
export function closeStartThread() {
  if (!current) return;
  current = null;
  emit();
}

export function subscribeStartThread(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startThreadRequest() {
  return current;
}

/**
 * Screens below the top one stay mounted in a stack, so several hosts can
 * show the same channel; only the one mounted last draws the sheet.
 */
let hosts: { token: number; channelId: string }[] = [];
let nextToken = 1;

/** A token for a new host */
export function newHostToken() {
  return nextToken++;
}

/** A host is on screen for this channel; returns the clean-up */
export function registerHost(token: number, channelId: string) {
  hosts = [...hosts, { token, channelId }];
  emit();
  return () => {
    hosts = hosts.filter((h) => h.token !== token);
    emit();
  };
}

/** The token of the host that draws the sheet for this channel (0: none) */
export function topHost(channelId: string) {
  const mine = hosts.filter((h) => h.channelId === channelId);
  return mine.length ? mine[mine.length - 1].token : 0;
}

/** A thread named after the message's first words (web: MessageContextMenu startThread) */
export function threadNameFrom(text: string | undefined) {
  const words = (text ?? "").trim().replace(/\s+/g, " ");
  return words.length > 60 ? `${words.slice(0, 60)}…` : words;
}
