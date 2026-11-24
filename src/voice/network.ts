/**
 * Voice on a weak connection (web: rtc/weakNetwork.ts, rtc/callHealth.ts).
 * Pure, so it is unit tested.
 *
 * A call has three levels and moves one level at a time, down quickly and
 * back up slowly, so a short dip does not make the picture flicker:
 * - good: nothing changes;
 * - weak: a sign shows and others' video is received at its lowest quality;
 * - bad: others' video is paused and only sound is kept.
 *
 * The phone rates the connection from LiveKit's connection quality of your
 * own connection (the web reads packet loss and round trip from WebRTC
 * statistics, which the React Native SDK does not hand out the same way).
 */

/** LiveKit's ConnectionQuality values */
export type ConnectionQualityName = "excellent" | "good" | "poor" | "lost" | "unknown";

export type NetworkLevel = "good" | "weak" | "bad";

/** Samples in a row that have to be worse before a call steps down */
export const SAMPLES_TO_STEP_DOWN = 2;
/** Seconds of better samples before a call steps up again (web default) */
export const RECOVER_SECONDS = 10;

/** Whether to point out a participant's connection on their tile */
export function qualityWarn(quality: ConnectionQualityName | undefined): "weak" | "lost" | undefined {
  if (quality === "poor") return "weak";
  if (quality === "lost") return "lost";
  return undefined;
}

/** What one quality report says about the connection */
export function rateQuality(quality: ConnectionQualityName | undefined): NetworkLevel {
  if (quality === "poor") return "weak";
  if (quality === "lost") return "bad";
  return "good";
}

export type NetworkState = {
  level: NetworkLevel;
  /** Samples in a row that were worse than the level */
  worseCount: number;
  /** Since when every sample has been better than the level (ms) */
  betterSince?: number;
};

export const GOOD_NETWORK: NetworkState = { level: "good", worseCount: 0 };

const ORDER: NetworkLevel[] = ["good", "weak", "bad"];

/**
 * The state after one more sample: down one level after
 * `SAMPLES_TO_STEP_DOWN` worse samples in a row, up one level after
 * `recoverSeconds` in which every sample was better.
 */
export function nextNetworkState(state: NetworkState, rated: NetworkLevel, at: number, recoverSeconds = RECOVER_SECONDS): NetworkState {
  const next = ORDER.indexOf(rated);
  const current = ORDER.indexOf(state.level);
  if (next > current) {
    const worseCount = state.worseCount + 1;
    if (worseCount >= SAMPLES_TO_STEP_DOWN) return { level: ORDER[current + 1], worseCount: 0 };
    return { level: state.level, worseCount };
  }
  if (next < current) {
    const betterSince = state.betterSince ?? at;
    if (at - betterSince >= recoverSeconds * 1000) return { level: ORDER[current - 1], worseCount: 0 };
    return { level: state.level, worseCount: 0, betterSince };
  }
  return { level: state.level, worseCount: 0 };
}

/** What others' video does at a level */
export function remoteVideoFor(level: NetworkLevel): "auto" | "low" | "off" {
  return level === "bad" ? "off" : level === "weak" ? "low" : "auto";
}
