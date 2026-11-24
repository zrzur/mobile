/**
 * Video posters (gap row 121): the first frame of a video, made on the phone
 * when the server gives none. Making one opens the video, so this keeps the
 * cost small: at most `limit` at a time, each address made once, the last
 * `keep` results remembered, and a request that is no longer wanted (the row
 * left the screen) is dropped before it starts.
 */

export type Poster<T> = { image: T; width: number; height: number; seconds?: number };

export type PosterQueue<T> = {
  /** The poster if it is already made */
  peek(uri: string): Poster<T> | null | undefined;
  /** Ask for a poster; `done` runs once with it (or null when it can't be made). Returns a cancel. */
  request(uri: string, done: (poster: Poster<T> | null) => void): () => void;
  /** How many are being made now (for tests) */
  running(): number;
};

export function createPosterQueue<T>({
  generate,
  limit = 2,
  keep = 40,
}: {
  generate: (uri: string) => Promise<Poster<T> | null>;
  limit?: number;
  keep?: number;
}): PosterQueue<T> {
  // made posters, oldest first (null: tried and failed, not tried again)
  const made = new Map<string, Poster<T> | null>();
  const waiting = new Map<string, Set<(p: Poster<T> | null) => void>>();
  const order: string[] = [];
  let active = 0;

  const remember = (uri: string, poster: Poster<T> | null) => {
    made.delete(uri);
    made.set(uri, poster);
    while (made.size > keep) {
      const oldest = made.keys().next().value as string;
      made.delete(oldest);
    }
  };

  const pump = () => {
    while (active < limit && order.length) {
      const uri = order.shift()!;
      const listeners = waiting.get(uri);
      if (!listeners?.size) {
        waiting.delete(uri);
        continue;
      }
      active++;
      void generate(uri)
        .catch(() => null)
        .then((poster) => {
          active--;
          remember(uri, poster);
          const now = waiting.get(uri);
          waiting.delete(uri);
          for (const fn of now ?? []) fn(poster);
          pump();
        });
    }
  };

  return {
    peek: (uri) => made.get(uri),
    request(uri, done) {
      if (made.has(uri)) {
        done(made.get(uri) ?? null);
        return () => {};
      }
      let set = waiting.get(uri);
      if (!set) {
        set = new Set();
        waiting.set(uri, set);
        order.push(uri);
      }
      set.add(done);
      pump();
      return () => {
        waiting.get(uri)?.delete(done);
      };
    },
    running: () => active,
  };
}

/** "1:05", "12:00", "1:02:03": a video's length on its poster */
export function posterClock(seconds: number | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
