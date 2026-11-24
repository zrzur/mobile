/**
 * Selecting messages for a bulk delete (web: messageSelection.ts). The
 * backend takes at most 100 ids at once and nothing older than 7 days.
 */

export const BULK_DELETE_MAX = 100;
export const BULK_DELETE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Kept free before the age limit, so a message does not cross it while the request travels */
const AGE_MARGIN_MS = 60 * 1000;

const ULID = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** When a message was sent, from its ULID; NaN for anything else */
export function ulidTime(id: string): number {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return NaN;
  let time = 0;
  for (const c of id.slice(0, 10)) time = time * 32 + ULID.indexOf(c);
  return time;
}

export type SelectionResult = { ids: Set<string>; full: boolean };

/** Select or unselect one message; never more than the backend takes */
export function toggleSelected(ids: ReadonlySet<string>, id: string): SelectionResult {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
    return { ids: next, full: false };
  }
  if (next.size >= BULK_DELETE_MAX) return { ids: next, full: true };
  next.add(id);
  return { ids: next, full: false };
}

/** Split ids into those a bulk delete takes and those too old for it */
export function splitByAge(ids: readonly string[], now: number): { deletable: string[]; tooOld: string[] } {
  const deletable: string[] = [];
  const tooOld: string[] = [];
  for (const id of ids) {
    const at = ulidTime(id);
    if (Number.isFinite(at) && now - at < BULK_DELETE_MAX_AGE_MS - AGE_MARGIN_MS) deletable.push(id);
    else tooOld.push(id);
  }
  return { deletable, tooOld };
}

/** "Select all": every loaded message a bulk delete still takes, newest first past the limit */
export function pickAll(ordered: readonly string[], now: number): SelectionResult {
  const newest = splitByAge(ordered, now).deletable.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return { ids: new Set(newest.slice(0, BULK_DELETE_MAX)), full: newest.length > BULK_DELETE_MAX };
}
