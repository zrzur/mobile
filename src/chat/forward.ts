/**
 * Where a message can be forwarded (web: modals/forwardTargets.ts): the
 * conversations and channels this person can write in, searched by name,
 * newest activity first. The server checks every rule again.
 */

export type TargetLike = {
  id: string;
  type: string;
  name: string;
  serverName?: string;
  serverMature?: boolean;
  /** Direct messages: whether the conversation is open */
  active: boolean;
  isForum: boolean;
  mature: boolean;
  updatedAt: number;
  canSend: boolean;
};

const KINDS = new Set(["SavedMessages", "DirectMessage", "Group", "TextChannel"]);

/** Lower case without Arabic diacritics and tatweel, alef forms folded (web: arabicFold) */
export function fold(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function forwardTargets<T extends TargetLike>(targets: Iterable<T>, query: string, sourceMature: boolean, limit = 50): T[] {
  const needle = fold(query.trim());
  const list: T[] = [];
  for (const t of targets) {
    if (!KINDS.has(t.type) || !t.canSend || t.isForum) continue;
    if (t.type === "DirectMessage" && !t.active) continue;
    if (sourceMature && !(t.mature || t.serverMature)) continue;
    if (needle && !fold(`${t.name}\n${t.serverName ?? ""}`).includes(needle)) continue;
    list.push(t);
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

/** A real message with something in it (web: canForwardMessage) */
export function canForwardMessage(message: { systemMessage?: unknown; content?: string; attachments?: unknown[]; embeds?: unknown[] }) {
  return !message.systemMessage && (!!message.content?.trim() || !!message.attachments?.length || !!message.embeds?.length);
}

/** Forwarding is on only on a clear yes from the server's config */
export function forwardingEnabled(client: { configuration?: { features?: object } } | null | undefined) {
  return (client?.configuration?.features as { forwarding?: boolean } | undefined)?.forwarding === true;
}
