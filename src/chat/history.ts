/**
 * The loaded part of a channel's history (web: history/window.ts): one
 * unbroken run of message ids, oldest first, and whether each side reaches
 * the channel's edge. Message ids are ULIDs, so comparing them as text
 * orders them by time.
 */

export type HistoryWindow = {
  /** Loaded ids, oldest first, no gaps, no duplicates */
  ids: string[];
  /** The oldest loaded message is the channel's first */
  atStart: boolean;
  /** The newest loaded message is the channel's newest (new messages are added live) */
  atEnd: boolean;
};

/** Rows asked for per page, and around a message */
export const PAGE = 50;

/** Oldest first, one entry per id */
function merge(...lists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of lists) for (const id of list) set.add(id);
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function emptyWindow(): HistoryWindow {
  return { ids: [], atStart: false, atEnd: true };
}

/** The newest page (`page` in any order) */
export function fromLatest(page: string[], limit = PAGE): HistoryWindow {
  return { ids: merge(page), atStart: page.length < limit, atEnd: true };
}

/**
 * A page around one message. The server answers up to `limit / 2 + 1`
 * messages at or after the target and as many before it; a short side has
 * reached its edge.
 */
export function fromNearby(page: string[], target: string, limit = PAGE): HistoryWindow {
  const half = Math.floor(limit / 2) + 1;
  const newer = page.filter((id) => id >= target).length;
  const older = page.length - newer;
  return { ids: merge(page), atStart: older < half, atEnd: newer < half };
}

/** Older messages arrived; past `max` the newest are dropped (the window is then no longer live) */
export function addOlder(w: HistoryWindow, page: string[], limit = PAGE, max = 400): HistoryWindow {
  const ids = merge(w.ids, page);
  const cut = ids.length > max;
  return { ids: cut ? ids.slice(0, max) : ids, atStart: page.length < limit, atEnd: w.atEnd && !cut };
}

/** Newer messages arrived; past `max` the oldest are dropped */
export function addNewer(w: HistoryWindow, page: string[], limit = PAGE, max = 400): HistoryWindow {
  const ids = merge(w.ids, page);
  const cut = ids.length > max;
  return { ids: cut ? ids.slice(ids.length - max) : ids, atStart: w.atStart && !cut, atEnd: page.length < limit };
}

/**
 * A message arrived from the gateway: kept only while the window shows the
 * present (otherwise it is fetched when the reader comes back down).
 */
export function addLive(w: HistoryWindow, id: string, max = 400): HistoryWindow {
  if (!w.atEnd || w.ids.includes(id)) return w;
  const ids = merge(w.ids, [id]);
  const cut = ids.length > max;
  return { ids: cut ? ids.slice(ids.length - max) : ids, atStart: w.atStart && !cut, atEnd: true };
}

export function removeId(w: HistoryWindow, id: string): HistoryWindow {
  return w.ids.includes(id) ? { ...w, ids: w.ids.filter((x) => x !== id) } : w;
}

/**
 * The message a jump lands on: the message itself, or the first one after
 * it when it was deleted (web: landingId).
 */
export function landingId(w: HistoryWindow, target: string): string | undefined {
  if (w.ids.includes(target)) return target;
  return w.ids.find((id) => id > target) ?? w.ids[w.ids.length - 1];
}

/** How many loaded messages are newer than `lastSeen` */
export function countNewer(ids: readonly string[], lastSeen: string | undefined): number {
  if (!lastSeen) return 0;
  let n = 0;
  for (let i = ids.length - 1; i >= 0 && ids[i] > lastSeen; i--) n++;
  return n;
}

/**
 * Messages that arrived while the gateway was closed (background) or
 * reconnecting: `page` is what the server has after the newest loaded id.
 * A short page fills the gap; a full page means more may be missing, so
 * the caller reloads the newest page instead (answers `null`). Only for a
 * window that shows the present.
 */
export function catchUp(w: HistoryWindow, page: string[], limit = PAGE, max = 400): HistoryWindow | null {
  if (!w.atEnd) return w;
  if (page.length >= limit) return null;
  if (!page.length) return w;
  return addNewer(w, page, limit, max);
}
