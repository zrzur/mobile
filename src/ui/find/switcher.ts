/**
 * "Go to" (web: keybinds/quickSwitch.ts, the Ctrl+K switcher): one search
 * over the places a person can go — channels, conversations, servers and
 * friends. Names are matched folded (fold.ts), so «اسامة» finds «أسامة». A
 * first character narrows the kind: # channels, @ people and
 * conversations, * servers. Names are folded once when the list is built.
 */
import { foldText, withoutArticle } from "./fold";

export type SwitchKind = "channel" | "conversation" | "server" | "friend";

export type SwitchItem = {
  kind: SwitchKind;
  /** Channel, server or user id */
  id: string;
  name: string;
  /** Second line: the server of a channel, "Direct message", … */
  place?: string;
  unread: boolean;
  mentions: number;
  /** Last activity, ms */
  updatedAt: number;
  folded?: string;
  foldedPlace?: string;
};

/** The item with its folded name and place, done once per list */
export function withFolds<T extends SwitchItem>(item: T): T {
  item.folded = foldText(item.name);
  item.foldedPlace = item.place ? `${item.folded} ${foldText(item.place)}` : item.folded;
  return item;
}

type ChannelLike = {
  type: string;
  server?: unknown;
  active?: boolean;
  havePermission?: (permission: "ViewChannel") => boolean;
};

/**
 * Whether a channel may be listed: server channels only with View Channel
 * (the cache can hold channels the person can't open), direct messages only
 * when open
 */
export function channelListed(channel: ChannelLike): boolean {
  switch (channel.type) {
    case "TextChannel":
      return !!channel.server && !!channel.havePermission?.("ViewChannel");
    case "DirectMessage":
      return !!channel.active;
    case "Group":
    case "SavedMessages":
      return true;
    default:
      return false;
  }
}

const PREFIX: Record<string, SwitchKind[]> = {
  "#": ["channel"],
  "@": ["conversation", "friend"],
  "*": ["server"],
};

/** What was typed: the kinds it narrows to, and the text to look for */
export function parseQuery(query: string): { kinds?: SwitchKind[]; text: string } {
  const trimmed = query.trimStart();
  const kinds = PREFIX[trimmed[0] ?? ""];
  return kinds ? { kinds, text: trimmed.slice(1).trim() } : { text: trimmed.trim() };
}

function hasWords(haystack: string, words: string[]) {
  return words.every((word) => haystack.includes(word) || haystack.includes(withoutArticle(word)));
}

/**
 * The results in order. With nothing typed: recent places first (most
 * recent first), then places with mentions, then unread ones, then the
 * latest activity. With text: names that start with it, then names that
 * contain it, then places matched by their second line; ties go to the
 * recent and the latest.
 */
export function rankItems<T extends SwitchItem>(items: Iterable<T>, query: string, recents: string[] = [], limit = 30): T[] {
  const { kinds, text } = parseQuery(query);
  const needle = foldText(text);
  const words = needle.split(" ").filter(Boolean);
  const recent = new Map(recents.map((id, index) => [id, index]));
  const scored: { item: T; score: number }[] = [];

  for (const item of items) {
    if (kinds && !kinds.includes(item.kind)) continue;
    let score: number;
    if (needle) {
      const name = item.folded ?? foldText(item.name);
      if (name.startsWith(needle) || name.startsWith(withoutArticle(needle))) score = 0;
      else if (hasWords(name, words)) score = 1;
      else if (item.place && hasWords(item.foldedPlace ?? `${name} ${foldText(item.place)}`, words)) score = 2;
      else continue;
    } else {
      score = recent.has(item.id) ? 0 : item.mentions ? 1 : item.unread ? 2 : 3;
    }
    scored.push({ item, score });
  }

  const at = (id: string) => recent.get(id) ?? Number.MAX_SAFE_INTEGER;
  return scored
    .sort((a, b) => a.score - b.score || at(a.item.id) - at(b.item.id) || b.item.updatedAt - a.item.updatedAt)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Index of the next matching item, wrapping around the ends, never the
 * item you are on, or -1 when nothing else matches (web: keybinds/navigate)
 */
export function nextIndex(length: number, from: number, step: 1 | -1, matches: (index: number) => boolean = () => true): number {
  if (length <= 0) return -1;
  const start = from < 0 ? (step === 1 ? -1 : length) : from;
  for (let n = 1; n <= length; n++) {
    const index = (((start + step * n) % length) + length) % length;
    if (index === from) break;
    if (matches(index)) return index;
  }
  return -1;
}

/**
 * "Next unread channel" (web: Alt+Shift+Down): the next place with
 * something new after the one open now, mentions first in the same order
 * the list shows them
 */
export function nextUnread<T extends { id: string; unread: boolean; mentions: number }>(list: T[], currentId: string | undefined): T | undefined {
  const from = list.findIndex((item) => item.id === currentId);
  const withMention = nextIndex(list.length, from, 1, (i) => list[i].mentions > 0);
  if (withMention >= 0) return list[withMention];
  const unread = nextIndex(list.length, from, 1, (i) => list[i].unread);
  return unread >= 0 ? list[unread] : undefined;
}
