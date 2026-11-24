import { type AudioPlayer, createAudioPlayer } from "expo-audio";

import { createPosterQueue } from "./posterQueue";

/**
 * The length of an audio file before it is played (web: the <audio>
 * element's metadata, or the decoded file). A voice note's player is only
 * made on the first press, so the row reads the length here: the file is
 * opened without playing, its length kept, the player released. Two at a
 * time, each address once, the last 200 remembered; a row that left the
 * screen drops its request before it starts.
 */

/** Seconds from a player's status, or undefined while it is not known */
export function knownSeconds(status: { isLoaded?: boolean; duration?: number }): number | undefined {
  const value = status.duration;
  return status.isLoaded && typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** How long to wait for a file's length before giving up */
const WAIT_MS = 10_000;

/** Open the file without playing it and read its length */
export function readDuration(uri: string, open: (uri: string) => AudioPlayer = (u) => createAudioPlayer(u, { updateInterval: 1000 })): Promise<number | null> {
  return new Promise((resolve) => {
    let player: AudioPlayer;
    try {
      player = open(uri);
    } catch {
      resolve(null);
      return;
    }
    let finished = false;
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      const seconds = knownSeconds(status);
      if (seconds !== undefined) finish(seconds);
    });
    const timer = setTimeout(() => finish(null), WAIT_MS);
    function finish(seconds: number | null) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sub.remove();
      try {
        player.remove();
      } catch {
        // already released
      }
      resolve(seconds);
    }
    // a file the player had already opened reports no new status
    const now = knownSeconds({ isLoaded: player.isLoaded, duration: player.duration });
    if (now !== undefined) finish(now);
  });
}

const queue = createPosterQueue<null>({
  generate: async (uri) => {
    const seconds = await readDuration(uri);
    return seconds ? { image: null, width: 0, height: 0, seconds } : null;
  },
  limit: 2,
  keep: 200,
});

/** Lengths learned while playing, so a row drawn again shows its length at once */
const played = new Map<string, number>();

export const audioDuration = {
  /** The length if it is already known */
  peek(uri: string): number | undefined {
    return played.get(uri) ?? queue.peek(uri)?.seconds;
  },
  /** Ask for the length; `done` runs once with it (not when it can't be read). Returns a cancel. */
  request(uri: string, done: (seconds: number) => void): () => void {
    const known = audioDuration.peek(uri);
    if (known) {
      done(known);
      return () => {};
    }
    return queue.request(uri, (poster) => {
      if (poster?.seconds) done(poster.seconds);
    });
  },
  /** The player learned the length while playing */
  remember(uri: string, seconds: number) {
    if (Number.isFinite(seconds) && seconds > 0) played.set(uri, seconds);
  },
};
