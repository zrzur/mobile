/**
 * The idempotency key a message is sent with. A send that timed out may
 * still have reached the server; trying the same message again with the
 * same key returns the first message instead of posting it twice. A
 * changed message (text, files, reply) gets a new key.
 */
export type SendKey = { key: string; signature: string };

/** What makes two sends "the same message" */
export function sendSignature(channelId: string, text: string, fileUris: readonly string[], replyId?: string): string {
  return JSON.stringify([channelId, text.trim(), [...fileUris], replyId ?? null]);
}

/** The key for this send: the kept one when the message is unchanged, else a new one */
export function keyFor(kept: SendKey | null, signature: string, make: () => string): SendKey {
  return kept && kept.signature === signature ? kept : { key: make(), signature };
}
