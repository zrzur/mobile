/**
 * Interface sounds in the app (web: components/client/Sounds.tsx): mute,
 * deafen, someone joining or leaving the call, and the ringtones. Files are
 * Zrzur's own (assets/SOURCES.md). Nothing here throws: a sound that cannot
 * play is skipped.
 */
import { type AudioPlayer, type AudioSource, createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { secureStorage } from "@/lib/secureStorage";
import { readPrefs, SOUND_DEFAULTS, SOUNDS_KEY, type SoundPrefs } from "@/ui/settings/user/userPrefs";

import { type SoundKey, soundAllowed, soundPlan } from "./logic";

/** The files, loaded on first use */
function source(key: SoundKey): AudioSource {
  switch (key) {
    case "mute":
      return require("./assets/mute.wav");
    case "unmute":
      return require("./assets/unmute.wav");
    case "deafen":
      return require("./assets/deafen.wav");
    case "undeafen":
      return require("./assets/undeafen.wav");
    case "userJoinVoice":
      return require("./assets/user_join_voice.wav");
    case "userLeaveVoice":
      return require("./assets/user_leave_voice.wav");
    case "userMoved":
      return require("./assets/user_moved.wav");
    case "streamStart":
      return require("./assets/stream_start.wav");
    case "streamEnd":
      return require("./assets/stream_end.wav");
    case "ringtoneIncoming":
      return require("./assets/ringtone_incoming.wav");
    case "ringtoneOutgoing":
      return require("./assets/ringtone_outgoing.wav");
  }
}

let prefs: Partial<SoundPrefs> | undefined;
let prefsAt = 0;

/** The sound switches, read again at most every few seconds */
async function soundPrefs(): Promise<Partial<SoundPrefs>> {
  if (prefs && Date.now() - prefsAt < 5000) return prefs;
  const raw = await secureStorage.get(SOUNDS_KEY).catch(() => null);
  prefs = readPrefs(raw, SOUND_DEFAULTS);
  prefsAt = Date.now();
  return prefs;
}

/** Settings changed the switches: read them on the next sound */
export function soundPrefsChanged() {
  prefs = undefined;
}

/** A voice note or video is playing (read late: media/playback imports the call) */
function mediaPlaying(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("@/media/playback") as typeof import("@/media/playback")).playback.busy();
  } catch {
    return false;
  }
}

async function start(key: SoundKey, inCall: boolean, loop: boolean, preview = false): Promise<AudioPlayer | undefined> {
  if (!preview && !soundAllowed(key, await soundPrefs())) return;
  const plan = soundPlan({ inCall, mediaPlaying: !preview && mediaPlaying() });
  if (plan === "skip") return;
  if (plan === "ambient") {
    // a cue mixes with other apps and stays quiet on the silent switch
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", allowsRecording: false, shouldPlayInBackground: false }).catch(() => undefined);
  }
  const player = createAudioPlayer(source(key));
  player.loop = loop;
  player.volume = 0.6;
  player.play();
  return player;
}

/**
 * Play a short sound once.
 * @param inCall The call owns the audio session: play into it as it is
 */
export function playSound(key: SoundKey, inCall = false): void {
  void play(key, inCall, false);
}

/**
 * Play a sound from settings whatever its switch says (web: the preview
 * button). Answers when it ended or could not play.
 */
export function previewSound(key: SoundKey, inCall = false): Promise<boolean> {
  return play(key, inCall, true);
}

function play(key: SoundKey, inCall: boolean, preview: boolean): Promise<boolean> {
  return start(key, inCall, false, preview)
    .then(
      (player) =>
        new Promise<boolean>((resolve) => {
          if (!player) return resolve(false);
          const sub = player.addListener("playbackStatusUpdate", (status) => {
            if (!status.didJustFinish) return;
            sub.remove();
            player.remove();
            resolve(true);
          });
          // a status that never comes must not keep a preview "playing"
          setTimeout(() => resolve(true), 3000);
        }),
    )
    .catch((error: unknown) => {
      console.warn("[sounds] not played", key, error);
      return false;
    });
}

/** Play a sound over and over (a ringtone); answers the function that stops it */
export function loopSound(key: SoundKey, inCall = false): () => void {
  let stopped = false;
  let player: AudioPlayer | undefined;
  void start(key, inCall, true)
    .then((started) => {
      player = started;
      if (stopped) stopPlayer(player);
    })
    .catch((error: unknown) => console.warn("[sounds] not played", key, error));
  return () => {
    stopped = true;
    stopPlayer(player);
    player = undefined;
  };
}

function stopPlayer(player: AudioPlayer | undefined) {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // already released
  }
}
