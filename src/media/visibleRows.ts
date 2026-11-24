/** Which rows of one chat list are on screen (media in rows off screen pauses) */

/** The visible row ids of one list; `null` until the list reports (then all count as visible) */
export type VisibleRows = {
  set(ids: readonly string[]): void;
  has(id: string): boolean;
  subscribe(listener: () => void): () => void;
  version(): number;
};

export function createVisibleRows(): VisibleRows {
  let ids: Set<string> | null = null;
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      const nextSet = new Set(next);
      if (ids && ids.size === nextSet.size && [...nextSet].every((id) => ids!.has(id))) return;
      ids = nextSet;
      version++;
      for (const listener of [...listeners]) listener();
    },
    has: (id) => ids === null || ids.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
  };
}
