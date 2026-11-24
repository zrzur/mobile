/** A custom emoji id (ULID) */
export const CUSTOM_EMOJI = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * A stored tag emoji, if it is one the server accepts (web: validTagEmoji):
 * a custom emoji id, or a short Unicode emoji. Tags saved before that rule
 * may hold plain text such as "csc"; those show no emoji.
 */
export function validTagEmoji(emoji?: string | null) {
  if (!emoji) return undefined;
  if (CUSTOM_EMOJI.test(emoji)) return emoji;
  const ok =
    [...emoji].length <= 16 &&
    /[^\x00-\x7F]/.test(emoji) &&
    !/[A-Za-z\s\x00-\x1F\x7F]/.test(emoji);
  return ok ? emoji : undefined;
}

/** Tags picked for a new post: one more, or one less */
export function toggleTag(tags: readonly string[], id: string): string[] {
  return tags.includes(id) ? tags.filter((tag) => tag !== id) : [...tags, id];
}

/** Whether a new thread or post can be sent (web: CreateThread form rules) */
export function canSubmitThread(input: { name: string; content: string; tags: readonly string[] }, forum?: { requireTag: boolean }) {
  const name = input.name.trim();
  if (!name || [...name].length > 100) return false;
  if (forum && !input.content.trim()) return false;
  if (forum?.requireTag && input.tags.length === 0) return false;
  return true;
}
