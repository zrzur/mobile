/** Address of a custom emoji on the file service (its own file, so sheets can use it without importing MessageContent) */
export function emojiUrl(base: string | undefined, id: string) {
  return base ? `${base.replace(/\/$/, "")}/emojis/${id}` : undefined;
}
