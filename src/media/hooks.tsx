import type { VideoPlayer } from "expo-video";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

import { claimPlayback } from "./playback";
import { createVisibleRows, type VisibleRows } from "./visibleRows";

export { createVisibleRows };

/** The app is in the foreground (not locked, not in the app switcher) */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setActive(next === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Take part in "one sound at a time": while `playing`, this player owns
 * playback; another one starting calls `pause` here.
 */
export function usePlaybackOwner(playing: boolean, pause: () => void) {
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  });
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (playing && !release.current) {
      release.current = claimPlayback(() => {
        release.current = null;
        pauseRef.current();
      });
    } else if (!playing && release.current) {
      release.current();
      release.current = null;
    }
  }, [playing]);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [],
  );
}

/** Whether an expo-video player is playing (also when started from its own controls) */
export function useVideoPlaying(player: VideoPlayer): boolean {
  const [playing, setPlaying] = useState(player.playing);
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);
  return playing;
}

/** GIFs and looping media show their still frame (app setting, or the phone's when it follows the device) */
export function useStillMotion(): boolean {
  const { appearance } = useTheme();
  const device = useReducedMotion();
  return appearance.reduceMotion === "reduce" || (appearance.reduceMotion === "device" && device);
}

// --- which chat rows are on screen ------------------------------------------

const VisibleRowsContext = createContext<VisibleRows | null>(null);
const RowIdContext = createContext<string | undefined>(undefined);

/** Give a list's rows their visibility (one store per list) */
export function VisibleRowsProvider({ rows, children }: { rows: VisibleRows; children: ReactNode }) {
  return <VisibleRowsContext.Provider value={rows}>{children}</VisibleRowsContext.Provider>;
}

/** Mark the row a piece of media sits in */
export function RowIdProvider({ id, children }: { id: string; children: ReactNode }) {
  return <RowIdContext.Provider value={id}>{children}</RowIdContext.Provider>;
}

/** The row this media sits in is on screen (true outside a reporting list) */
export function useRowVisible(): boolean {
  const rows = useContext(VisibleRowsContext);
  const id = useContext(RowIdContext);
  const store = useMemo(() => rows ?? createVisibleRows(), [rows]);
  return useSyncExternalStore(
    store.subscribe,
    () => !id || store.has(id),
    () => true,
  );
}
