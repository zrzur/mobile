/**
 * The rows drawn after the loaded messages: messages on their way (the
 * outbox), and the bots' private answers and command progress. They only
 * show while the newest messages are loaded, ordered by time.
 */
import type { OutboxEntry } from "./rules";

export type ExtraRow<I> = { kind: "outbox"; key: string; entry: OutboxEntry; tail: boolean } | { kind: "interaction"; key: string; entry: I };

const GROUP_GAP = 7 * 60 * 1000;

/**
 * @param last The newest loaded message: a message on its way groups under
 *   it (no avatar again) when it is yours and less than 7 minutes older
 */
export function extraRows<I extends { key: string; at: number }>(
  outbox: readonly OutboxEntry[],
  interactions: readonly I[],
  last: { authorId?: string; at: number; tail?: boolean } | undefined,
  selfId: string | undefined,
): ExtraRow<I>[] {
  const items: ({ at: number; row: Omit<Extract<ExtraRow<I>, { kind: "outbox" }>, "tail"> } | { at: number; row: Extract<ExtraRow<I>, { kind: "interaction" }> })[] = [
    ...outbox.map((entry) => ({ at: entry.createdAt, row: { kind: "outbox" as const, key: `outbox-${entry.key}`, entry } })),
    ...interactions.map((entry) => ({ at: entry.at, row: { kind: "interaction" as const, key: entry.key, entry } })),
  ];
  // stable: equal times keep outbox first, in the order written
  items.sort((a, b) => a.at - b.at);
  const rows: ExtraRow<I>[] = [];
  let prev: { mine: boolean; at: number } | undefined = last ? { mine: !!selfId && last.authorId === selfId, at: last.at } : undefined;
  for (const item of items) {
    if (item.row.kind === "outbox") {
      const entry = item.row.entry;
      const tail = !!prev && prev.mine && item.at - prev.at < GROUP_GAP && !entry.replies?.length;
      rows.push({ ...item.row, tail });
      prev = { mine: true, at: item.at };
    } else {
      rows.push(item.row);
      prev = { mine: false, at: item.at };
    }
  }
  return rows;
}
