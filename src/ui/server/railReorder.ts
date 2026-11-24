/**
 * Pure maths of the rail drag (web: servers/railDrag.ts and the `fold` /
 * `place` handlers of ServerList.tsx, stores Ordering and ServerFolders).
 *
 * The rail does not rearrange itself while a finger drags: entries stay where
 * they are, an indicator shows where the drop will land, and dropping on the
 * middle of a top-level server folds the two into a folder (or adds the
 * server to that folder). The results are written to the same synced keys
 * as the web (`ordering.serverSidebar`, `server-folders.folders`), so a move
 * on the phone shows on the computer and back.
 *
 * The functions used while dragging carry the "worklet" directive so they
 * run on the UI thread; they are plain functions everywhere else (tests).
 */
import type { RailEntry, ServerFolder } from "./syncedLogic";

/** Time a finger rests before the entry lifts and can be dragged (web: TOUCH_HOLD_MS) */
export const HOLD_MS = 350;
/** A lifted finger that keeps resting this long opens the menu (web: TOUCH_MENU_MS) */
export const MENU_MS = 500;
/** How far a lifted finger moves before the drag starts (web: TOUCH_DRAG_PX) */
export const DRAG_PX = 5;
/** Band at the top and bottom of the rail where a drag scrolls it (web: EDGE_SCROLL_PX) */
const EDGE_SCROLL_PX = 48;
/** Fastest edge scroll in points per frame (web: EDGE_SCROLL_MAX) */
const EDGE_SCROLL_MAX = 14;
/** Part of an entry, around its middle, that folds rather than reorders (web: FOLD_BAND) */
const FOLD_BAND = 0.5;
/** How far beside the rail the finger may go before the drop is abandoned (web: CANCEL_MARGIN_PX) */
export const CANCEL_MARGIN_PX = 80;
/** Half the 8 pt gap between entries: a finger in a gap still aims at its neighbour */
const HALF_GAP = 4;

/** One draggable entry, in the order drawn (web: railDrag RailEntry) */
export type RailItem = { id: string; kind: "server" | "folder"; parent?: string };

/** A measured entry in rail content coordinates */
export type RailBox = RailItem & { top: number; bottom: number };

export type RailIntent = { type: "fold"; target: string } | { type: "move"; before: string | undefined; parent: string | undefined };

/** The draggable entries: folders, and the members of open folders (web: ServerList drag entries) */
export function railItems(entries: RailEntry[]): RailItem[] {
  const out: RailItem[] = [];
  for (const entry of entries) {
    if (entry.type === "server") out.push({ id: entry.id, kind: "server" });
    else {
      out.push({ id: entry.id, kind: "folder" });
      // members are only draggable while you can see them
      if (!entry.folder.collapsed) for (const id of entry.servers) out.push({ id, kind: "server", parent: entry.id });
    }
  }
  return out;
}

/**
 * Points to scroll the rail by in one frame while dragging
 * @returns negative up, positive down, zero to stay
 */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
  "worklet";
  const band = Math.min(EDGE_SCROLL_PX, (bottom - top) / 4);
  if (band <= 0) return 0;
  if (y < top + band) return -Math.ceil(EDGE_SCROLL_MAX * Math.min(1, (top + band - y) / band));
  if (y > bottom - band) return Math.ceil(EDGE_SCROLL_MAX * Math.min(1, (y - (bottom - band)) / band));
  return 0;
}

/**
 * What dropping at content position `y` would do (web: railDrag intentAt)
 * @param boxes measured entries, in drawn order
 * @param held id being dragged
 * @param outside the finger is far beside the rail: no drop
 */
export function intentAt(y: number, held: string, boxes: RailBox[], outside = false): RailIntent | undefined {
  "worklet";
  if (outside) return undefined;
  if (!boxes.length) return { type: "move", before: undefined, parent: undefined };
  let source: RailBox | undefined;
  for (const b of boxes) if (b.id === held) source = b;
  // a folder can be moved around the list but never into anything
  const canFold = source?.kind === "server";
  const canNest = source?.kind === "server";

  const insertAt = (index: number): RailIntent => {
    let at = index;
    // a folder dropped among another folder's servers belongs after them
    while (at < boxes.length && !canNest && boxes[at].parent) at++;
    const neighbour = at < boxes.length ? boxes[at] : undefined;
    return { type: "move", before: neighbour?.id, parent: neighbour?.parent };
  };

  let hit = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (y >= boxes[i].top - HALF_GAP && y <= boxes[i].bottom + HALF_GAP) {
      hit = i;
      break;
    }
  }
  if (hit === -1) {
    if (y < boxes[0].top) return insertAt(0);
    if (y > boxes[boxes.length - 1].bottom) return { type: "move", before: undefined, parent: undefined };
    // a wider gap (an open folder's padding): the nearest entry
    let best = 0;
    let distance = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const d = Math.min(Math.abs(y - boxes[i].top), Math.abs(y - boxes[i].bottom));
      if (d < distance) {
        distance = d;
        best = i;
      }
    }
    hit = best;
  }
  const box = boxes[hit];
  const height = Math.max(1, box.bottom - box.top);
  const offset = Math.min(1, Math.max(0, (y - box.top) / height));
  // the middle of an entry folds, the edges insert either side of it;
  // servers already inside a folder are only ever reordered
  if (box.id !== held && canFold && !box.parent && Math.abs(offset - 0.5) < FOLD_BAND / 2) return { type: "fold", target: box.id };
  return insertAt(offset >= 0.5 ? hit + 1 : hit);
}

/** Whether a move leaves the entry where it already is (web: drop / sitsBefore) */
export function isNoop(held: string, intent: RailIntent | undefined, items: RailItem[]): boolean {
  "worklet";
  if (!intent) return true;
  if (intent.type === "fold") return intent.target === held;
  let at = -1;
  for (let i = 0; i < items.length; i++) if (items[i].id === held) at = i;
  if (at === -1) return false;
  if (intent.parent !== items[at].parent) return false;
  if (intent.before === held) return true;
  let next = at + 1;
  while (next < items.length && items[next].parent === held) next++;
  return intent.before === undefined ? next === items.length : items[next]?.id === intent.before;
}

/**
 * Where to draw the drop indicator: a 4 pt line centred in the gap above
 * `before` (or under the last entry), or the fold ring around a target.
 * Content coordinates; undefined draws nothing.
 */
export function indicatorAt(intent: RailIntent | undefined, boxes: RailBox[]): { type: "line" | "ring"; y: number; height: number } | undefined {
  "worklet";
  if (!intent || !boxes.length) return undefined;
  if (intent.type === "fold") {
    for (const b of boxes) if (b.id === intent.target) return { type: "ring", y: b.top, height: b.bottom - b.top };
    return undefined;
  }
  if (intent.before === undefined) {
    let bottom = 0;
    for (const b of boxes) bottom = Math.max(bottom, b.bottom);
    return { type: "line", y: bottom + HALF_GAP - 2, height: 4 };
  }
  for (const b of boxes) if (b.id === intent.before) return { type: "line", y: b.top - HALF_GAP - 2, height: 4 };
  return undefined;
}

// ---- writing the result (web: ServerList fold / place, Ordering, ServerFolders) ----

/** Folders written back: empty ones are forgotten (web: ServerFolders #write) */
const write = (folders: ServerFolder[]) => folders.filter((f) => f.servers.length > 0);

/** A server put at a position in a folder, taken out of wherever it was (web: ServerFolders.place) */
export function placeInFolder(folders: ServerFolder[], folderId: string, serverId: string, before?: string): ServerFolder[] {
  return write(
    folders.map((folder) => {
      const servers = folder.servers.filter((s) => s !== serverId);
      if (folder.id !== folderId) return { ...folder, servers };
      const at = before ? servers.indexOf(before) : -1;
      const index = at === -1 ? servers.length : at;
      return { ...folder, servers: [...servers.slice(0, index), serverId, ...servers.slice(index)] };
    }),
  );
}

/** The stored sidebar order: folder members trail their folder (web: Ordering.setServerOrder) */
export function sidebarOrder(ids: string[], folders: ServerFolder[]): string[] {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  return ids.flatMap((id) => {
    const folder = byId.get(id);
    return folder ? [id, ...folder.servers] : [id];
  });
}

export type RailChange = { order: string[]; folders: ServerFolder[] };

/**
 * Drop a server onto another entry (web: ServerList fold): onto a folder it
 * joins it, onto a server the two make a new folder in the target's place.
 */
export function applyFold(entries: RailEntry[], folders: ServerFolder[], target: string, incoming: string, newId: string, name: string): RailChange | undefined {
  const entry = entries.find((e) => e.id === target);
  if (!entry || target === incoming) return undefined;
  const ids = entries.map((e) => e.id).filter((id) => id !== incoming);
  let next: ServerFolder[];
  if (entry.type === "folder") {
    next = write(
      folders.map((f) => {
        if (f.id === entry.folder.id) return f.servers.includes(incoming) ? f : { ...f, servers: [...f.servers, incoming] };
        return { ...f, servers: f.servers.filter((s) => s !== incoming) };
      }),
    );
  } else {
    const claimed = new Set([target, incoming]);
    next = write([...folders.map((f) => ({ ...f, servers: f.servers.filter((s) => !claimed.has(s)) })), { id: newId, name, servers: [target, incoming] }]);
    const at = ids.indexOf(target);
    if (at !== -1) ids[at] = newId;
  }
  return { order: sidebarOrder(ids, next), folders: next };
}

/** Move an entry in front of `before`, inside `parent` or at the top level (web: ServerList place) */
export function applyMove(entries: RailEntry[], folders: ServerFolder[], moved: string, before: string | undefined, parent: string | undefined): RailChange | undefined {
  const current = entries.map((e) => e.id);
  const ids = current.filter((id) => id !== moved);
  if (parent) {
    const next = placeInFolder(folders, parent, moved, before);
    return { order: sidebarOrder(ids, next), folders: next };
  }
  const inFolder = folders.some((f) => f.servers.includes(moved));
  const next = inFolder ? write(folders.map((f) => ({ ...f, servers: f.servers.filter((s) => s !== moved) }))) : folders;
  const at = before ? ids.indexOf(before) : -1;
  const index = at === -1 ? ids.length : at;
  const order = [...ids.slice(0, index), moved, ...ids.slice(index)];
  if (!inFolder && order.length === current.length && order.every((id, i) => id === current[i])) return undefined;
  return { order: sidebarOrder(order, next), folders: next };
}

/**
 * One step up or down among the entry's siblings, for VoiceOver and
 * TalkBack actions (web: railDrag shift). `position` is 1-based.
 */
export function shiftTarget(items: RailItem[], id: string, direction: -1 | 1): { before: string | undefined; parent: string | undefined; position: number; total: number } | { edge: "top" | "bottom" } {
  const parent = items.find((i) => i.id === id)?.parent;
  const list = items.filter((i) => i.parent === parent);
  const at = list.findIndex((i) => i.id === id);
  const to = at + direction;
  if (at === -1 || to < 0 || to >= list.length) return { edge: direction < 0 ? "top" : "bottom" };
  const before = direction < 0 ? list[to].id : list[to + 1]?.id;
  return { before, parent, position: to + 1, total: list.length };
}

/** The `ordering` value to store: the legacy `servers` list kept as older clients last saw it */
export function orderingValue(raw: unknown, serverSidebar: string[]): { servers: unknown[]; serverSidebar: string[] } {
  const servers = raw && typeof raw === "object" && Array.isArray((raw as { servers?: unknown }).servers) ? (raw as { servers: unknown[] }).servers : [];
  return { servers, serverSidebar };
}
