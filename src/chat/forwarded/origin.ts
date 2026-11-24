/**
 * Where "Forwarded" links back to (web: channels/text/forwardOrigin.ts): the
 * original message, if this reader's app knows its channel (it only knows
 * channels its person can see). The server decides again when it opens.
 */

/** The parts of a channel the link reads */
export type KnownChannel = {
  id: string;
  type: string;
  displayName?: string;
  isForum?: boolean;
  isThread?: boolean;
  isVoice?: boolean;
  server?: { name: string };
};

export type Origin = { channel?: string | null; message: string; sent_at?: string; note?: string | null };

export function originLink(origin: Origin, channel: (id: string) => KnownChannel | undefined): { channel: KnownChannel; message: string; place: string } | undefined {
  if (!origin.channel) return;
  const source = channel(origin.channel);
  if (!source) return;
  const name = source.displayName ?? "";
  const place = source.type === "TextChannel" ? `#${name}${source.server ? ` · ${source.server.name}` : ""}` : name;
  return { channel: source, message: origin.message, place };
}

/** Unicode isolates keep a Latin place name or date in one piece inside Arabic text (web: the same marks) */
export function isolated(text: string): string {
  return `⁨${text}⁩`;
}

/** The forwarded copy's origin, or undefined when it is not a copy */
export function forwardOrigin(value: unknown): Origin | undefined {
  if (!value || typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  if (typeof o.message !== "string") return;
  return {
    message: o.message,
    channel: typeof o.channel === "string" ? o.channel : null,
    sent_at: typeof o.sent_at === "string" ? o.sent_at : undefined,
    note: typeof o.note === "string" && o.note.trim() ? o.note : null,
  };
}
