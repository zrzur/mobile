import { foldText } from "@/ui/find/fold";

/** What the member picker needs of a member */
export type PickableMember = { id: string; name: string; username?: string };

/** How many matches the picker lists at once; search narrows the rest */
export const PICKER_LIMIT = 100;

/**
 * The members a picker offers: never the excluded ones (you, the owner, people
 * already listed), matched on name or username in an Arabic-aware fold
 * (web: MemberPicker), at most `PICKER_LIMIT`.
 */
export function pickableMembers<T extends PickableMember>(members: readonly T[], query: string, exclude: Iterable<string | undefined>): T[] {
  const skip = new Set(exclude);
  const needle = foldText(query.trim());
  const out: T[] = [];
  for (const m of members) {
    if (skip.has(m.id)) continue;
    if (needle && ![m.name, m.username ?? ""].some((n) => foldText(n).includes(needle))) continue;
    out.push(m);
    if (out.length === PICKER_LIMIT) break;
  }
  return out;
}
