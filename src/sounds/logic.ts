/**
 * Which interface sound plays when (web: components/client/Sounds.tsx and
 * the Sounds store). Pure, so it is unit tested.
 */
import { SOUND_DEFAULTS, type SoundPrefs } from "@/ui/settings/user/userPrefs";

export type SoundKey =
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "userJoinVoice"
  | "userLeaveVoice"
  | "userMoved"
  | "streamStart"
  | "streamEnd"
  | "ringtoneIncoming"
  | "ringtoneOutgoing";

/** Sounds the person can switch off in Notifications > Sounds; the rest always play */
const SWITCHABLE = new Set<string>(Object.keys(SOUND_DEFAULTS));

/** Whether a sound plays with these preferences */
export function soundAllowed(key: SoundKey, prefs: Partial<SoundPrefs>): boolean {
  if (!SWITCHABLE.has(key)) return true;
  return prefs[key as keyof SoundPrefs] !== false;
}

/**
 * How a sound shares the phone's audio:
 * - during a call the call owns the session: play into it as it is;
 * - otherwise a short cue mixes with other apps' audio and stays silent
 *   when the ring/silent switch is on (iOS `playsInSilentMode: false`);
 * - a voice note or video playing keeps its session: the cue is skipped.
 */
export function soundPlan(options: { inCall: boolean; mediaPlaying: boolean }): "as-is" | "ambient" | "skip" {
  if (options.inCall) return "as-is";
  if (options.mediaPlaying) return "skip";
  return "ambient";
}
