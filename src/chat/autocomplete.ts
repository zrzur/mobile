/**
 * Suggestions while typing (web: ui/directives/autoComplete.ts): `@` for
 * people and roles, `#` for channels, `:` for emoji. Picking one puts the
 * mention or emoji in place of what was typed.
 */
import { fold } from "./forward";

export type Operator = "@" | "#" | ":";

export type Trigger = { operator: Operator; query: string; start: number; end: number };

/**
 * The word being typed at the cursor, when it starts with an operator at
 * the start of the text or after a space.
 */
export function findTrigger(text: string, cursor: number): Trigger | undefined {
  const before = text.slice(0, cursor);
  const m = /(^|\s)([@#:])([^\s@#:]*)$/u.exec(before);
  if (!m) return;
  const operator = m[2] as Operator;
  const query = m[3];
  // emoji need at least one letter (":" alone is too common in text)
  if (operator === ":" && query.length < 1) return;
  if (query.length > 32) return;
  const start = before.length - query.length - 1;
  return { operator, query, start, end: cursor };
}

/** Replace the typed word with the pick; a space follows it */
export function applyCompletion(text: string, trigger: Trigger, replacement: string): { text: string; cursor: number } {
  const insert = `${replacement} `;
  const after = text.slice(trigger.end).replace(/^ /, "");
  return { text: text.slice(0, trigger.start) + insert + after, cursor: trigger.start + insert.length };
}

/**
 * Items whose names match the query: names starting with it first, then
 * names containing it; an empty query keeps the given order.
 */
export function rank<T>(items: Iterable<T>, query: string, names: (item: T) => (string | undefined)[], limit = 8): T[] {
  const needle = fold(query);
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    if (!needle) {
      starts.push(item);
      if (starts.length >= limit) break;
      continue;
    }
    const list = names(item).filter((n): n is string => !!n).map(fold);
    if (list.some((n) => n.startsWith(needle))) starts.push(item);
    else if (list.some((n) => n.includes(needle))) contains.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export const mentionUser = (id: string) => `<@${id}>`;
export const mentionRole = (id: string) => `<@&${id}>`;
export const mentionChannel = (id: string) => `<#${id}>`;
export const customEmoji = (id: string) => `:${id}:`;
