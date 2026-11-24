/**
 * The web preview has no phone voice runtime: the voice screens show
 * "Voice isn't available right now" (the native build uses native.ts).
 */
import type * as LiveKitClient from "livekit-client";
import type * as LiveKitNative from "@livekit/react-native";

export type VoiceRuntime = {
  lk: typeof LiveKitClient;
  rn: typeof LiveKitNative;
};

export function hasNativeVoice(): boolean {
  return false;
}

export function voiceRuntime(): VoiceRuntime | null {
  return null;
}
