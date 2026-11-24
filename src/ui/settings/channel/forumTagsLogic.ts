/**
 * A forum's tag editor (web: settings/channel/ForumTags.tsx), the pure part.
 */
import type { EmojiEntry } from "@/ui/emoji/prefs";
import { validTagEmoji } from "@/ui/forum/tags";

/** The API takes at most this many tags */
export const MAX_TAGS = 20;
/** Longest tag name the API takes */
export const MAX_NAME = 20;

export type EditTag = { id: string; name: string; emoji?: string };

/** Tags saved before the server checked emoji may hold plain text: those start with none */
export function storedTags(tags: { id: string; name: string; emoji?: string | null }[] | undefined): EditTag[] {
  return (tags ?? []).map(({ id, name, emoji }) => {
    const valid = validTagEmoji(emoji);
    return valid ? { id, name, emoji: valid } : { id, name };
  });
}

export function tagsDirty(tags: EditTag[], stored: EditTag[], requireTag: boolean, storedRequire: boolean): boolean {
  return JSON.stringify(tags) !== JSON.stringify(stored) || requireTag !== storedRequire;
}

/** Every tag has a name of 1 to 20 characters */
export function tagsValid(tags: EditTag[]): boolean {
  return tags.every((tag) => tag.name.trim().length > 0 && tag.name.length <= MAX_NAME);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new tag's id: 12 characters, like the tail of a ulid (web) */
export function newTagId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 12; i++) id += CROCKFORD[Math.floor(random() * 32) % 32];
  return id;
}

/** What a tag stores for a picked emoji: the Unicode text or the custom emoji's id */
export function tagEmojiOf(entry: EmojiEntry): string | undefined {
  return validTagEmoji(entry.kind === "custom" ? entry.id : entry.text);
}

/** The body for `channel.edit` */
export function tagsBody(tags: EditTag[], requireTag: boolean) {
  return {
    forum_tags: tags.map((tag) => ({ id: tag.id, name: tag.name.trim(), ...(tag.emoji ? { emoji: tag.emoji } : {}) })),
    require_tag: requireTag,
  };
}
