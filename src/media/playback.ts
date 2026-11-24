import { type AudioMode, setAudioModeAsync } from "expo-audio";
import { AppState } from "react-native";

import { call, callStore } from "@/voice/call";

/**
 * One owner for everything that makes sound in the chat: voice notes,
 * audio files and inline videos. Starting one pauses the one before;
 * leaving the app pauses whatever plays. The call is not part of this: it
 * keeps its own audio session, and while it runs nothing here changes the
 * session (iOS would drop the call's playAndRecord / voiceChat category).
 */

export type Coordinator = {
  /** Become the one playing; the previous owner is paused. Answers a release function */
  claim(pause: () => void): () => void;
  /** Pause whatever plays (leaving the app, a call starting) */
  pauseCurrent(): void;
  /** Something plays */
  busy(): boolean;
};

export function createCoordinator(): Coordinator {
  let current: { pause: () => void } | null = null;
  return {
    claim(pause) {
      const owner = { pause };
      const before = current;
      current = owner;
      if (before && before !== owner) before.pause();
      return () => {
        if (current === owner) current = null;
      };
    },
    pauseCurrent() {
      const before = current;
      current = null;
      before?.pause();
    },
    busy: () => current !== null,
  };
}

/** The app's one coordinator */
export const playback = createCoordinator();

let watching = false;
/** Pause on leaving the app (installed once, on the first claim) */
function watchAppState() {
  if (watching) return;
  watching = true;
  AppState.addEventListener("change", (next) => {
    if (next === "background") playback.pauseCurrent();
  });
  // a call starting pauses the note or video that plays
  let before = callStore.get().status;
  callStore.subscribe(() => {
    const now = callStore.get().status;
    if (before === "idle" && now !== "idle") playback.pauseCurrent();
    before = now;
  });
}

/** Claim playback (pauses the previous owner); answers the release function */
export function claimPlayback(pause: () => void): () => void {
  watchAppState();
  const release = playback.claim(pause);
  return () => {
    release();
    // a note or video played during the call: give the call its audio session back
    if (callActive()) void call.restoreAudioSession();
  };
}

/** A call is running (connecting, connected or reconnecting) */
export function callActive(status: string = callStore.get().status): boolean {
  return status !== "idle" && status !== "disconnected";
}

export type AudioUse = "play" | "record" | "record-end";

/**
 * The audio mode for a use, or `null` to leave the session as it is:
 * - during a call nothing changes (the call owns the session);
 * - a voice note or audio file pauses other apps' audio (Spotify, YouTube)
 *   instead of mixing with it; they resume when the note stops, because
 *   the player releases the session when it pauses or ends;
 * - recording takes the microphone and pauses other apps' audio.
 */
export function audioModeFor(use: AudioUse, inCall: boolean): Partial<AudioMode> | null {
  if (inCall) return null;
  switch (use) {
    case "play":
      return { playsInSilentMode: true, allowsRecording: false, interruptionMode: "doNotMix", shouldPlayInBackground: false };
    case "record":
      return { playsInSilentMode: true, allowsRecording: true, interruptionMode: "doNotMix", shouldPlayInBackground: false };
    case "record-end":
      return { allowsRecording: false };
  }
}

/** Set the audio mode for a use (no-op during a call); never throws */
export async function prepareAudio(use: AudioUse): Promise<void> {
  const mode = audioModeFor(use, callActive());
  if (!mode) return;
  await setAudioModeAsync(mode).catch(() => undefined);
}
