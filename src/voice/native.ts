/**
 * LiveKit on the phone, loaded only where its native code is there: a
 * development or store build with @livekit/react-native-webrtc. Expo Go has
 * no such module, so nothing is required there and the voice screens show
 * "Voice isn't available right now" instead of crashing. The web preview
 * uses native.web.ts.
 */
import { NativeModules, Platform } from "react-native";

import type * as LiveKitClient from "livekit-client";
import type * as LiveKitNative from "@livekit/react-native";

export type VoiceRuntime = {
  lk: typeof LiveKitClient;
  rn: typeof LiveKitNative;
};

let cached: VoiceRuntime | null | undefined;

/** Whether this build carries the native voice modules */
export function hasNativeVoice(): boolean {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  return !!NativeModules.LKRNWebRTCModule || !!NativeModules.WebRTCModule || !!NativeModules.LivekitReactNativeModule;
}

/** LiveKit, or null where this build has no native voice */
export function voiceRuntime(): VoiceRuntime | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (!hasNativeVoice()) return cached;
  try {
    // required here, not imported: the modules' own top level touches the
    // native side, which Expo Go does not have
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("@livekit/react-native") as typeof LiveKitNative;
    rn.registerGlobals();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lk = require("livekit-client") as typeof LiveKitClient;
    cached = { lk, rn };
  } catch (error) {
    console.warn("[voice] LiveKit could not load", error);
    cached = null;
  }
  return cached;
}
