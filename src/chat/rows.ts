/**
 * Turn a channel's messages into list rows the way the web app does:
 * a new group (avatar + name) starts on another author, 7 minutes or more
 * apart, a different masquerade, a system message, a reply, an
 * interaction, an official author, or a new day (which also gets a
 * divider). Everything else is a "tail" without avatar and name.
 */

export type MessageMeta = {
  id: string;
  authorId?: string;
  createdAt: number;
  masquerade?: string;
  system?: boolean;
  reply?: boolean;
  interaction?: boolean;
  official?: boolean;
};

export type ChatRow =
  | { kind: "start" }
  | { kind: "date"; key: string; at: number }
  | { kind: "unread" }
  | { kind: "message"; id: string; tail: boolean };

const GROUP_GAP = 7 * 60 * 1000;

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * @param lastReadId The last message the reader had read: a "New" divider
 *   goes above the first message after it (web: Messages.tsx), and that
 *   message starts a new group.
 */
export function buildRows(messages: MessageMeta[], atStart: boolean, lastReadId?: string): ChatRow[] {
  const rows: ChatRow[] = [];
  if (atStart) rows.push({ kind: "start" });
  let prev: MessageMeta | undefined;
  let unreadPlaced = !lastReadId;
  for (const m of messages) {
    const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
    if (newDay && (prev || atStart)) {
      rows.push({ kind: "date", key: `date-${m.id}`, at: m.createdAt });
    }
    const unread = !unreadPlaced && m.id > lastReadId!;
    if (unread) {
      unreadPlaced = true;
      rows.push({ kind: "unread" });
    }
    const tail =
      !unread &&
      !!prev &&
      !newDay &&
      prev.authorId === m.authorId &&
      m.createdAt - prev.createdAt < GROUP_GAP &&
      (prev.masquerade ?? "") === (m.masquerade ?? "") &&
      !prev.system &&
      !m.system &&
      !m.reply &&
      !m.interaction &&
      !m.official;
    rows.push({ kind: "message", id: m.id, tail });
    prev = m;
  }
  return rows;
}
