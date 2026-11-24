/**
 * Who reacted (gap row 37): the reactions of one message as tabs, each with
 * the people who chose it. Pure helpers for the sheet.
 */

export type ReactionGroup = { emoji: string; users: string[]; mine: boolean };

/** Reactions with at least one person, in the message's order; yours marked */
export function reactionGroups(reactions: Iterable<[string, Iterable<string>]>, selfId?: string): ReactionGroup[] {
  const out: ReactionGroup[] = [];
  for (const [emoji, users] of reactions) {
    const list = [...users];
    if (!list.length) continue;
    out.push({ emoji, users: list, mine: !!selfId && list.includes(selfId) });
  }
  return out;
}

/** The tab to show: the asked one while it still has people, else the first */
export function pickGroup(groups: ReactionGroup[], wanted?: string): ReactionGroup | undefined {
  return groups.find((g) => g.emoji === wanted) ?? groups[0];
}

/** A custom emoji id (26 letters and digits) rather than a Unicode emoji */
export function isCustomEmoji(emoji: string): boolean {
  return /^[0-9A-Z]{26}$/.test(emoji);
}

/**
 * What a row offers: your own reaction can always be taken back; someone
 * else's only by people who can manage messages (web: Remove reaction).
 */
export function canRemove(userId: string, selfId: string | undefined, manage: boolean): boolean {
  return userId === selfId || manage;
}

/** The API path to remove one person's reaction (DELETE …?user_id=) */
export function reactionPath(channelId: string, messageId: string, emoji: string): string {
  return `/channels/${channelId}/messages/${messageId}/reactions/${emoji}`;
}
