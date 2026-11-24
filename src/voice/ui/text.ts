import { useLingui } from "@lingui/react/macro";

import type { CallStatus } from "../call";
import type { OutputRoute, VoiceErrorKind } from "../logic";

/**
 * The call's words, exactly as the web app has them (Lingui msgids from
 * rtc/messages.ts, callCard and VoiceChannel.tsx). Routes are phone-only.
 */
export function useVoiceText() {
  const { t } = useLingui();

  const error = (kind: VoiceErrorKind | undefined): string | undefined => {
    switch (kind) {
      case undefined:
        return undefined;
      case "unavailable":
        return t`Voice isn't available right now. Try again later.`;
      case "rateLimited":
        return t`Too many actions. Wait a moment and try again.`;
      case "internal":
        return t`The server could not apply this voice change. Check the participant state before retrying.`;
      case "full":
        return t`This voice channel is full.`;
      case "permission":
        return t`You don't have permission.`;
      case "notElevated":
        return t`That member's role is too high.`;
      case "owner":
        return t`You can't do that to the server owner.`;
      case "notConnected":
        return t`That member is not in a voice channel.`;
      case "gone":
        return t`That voice channel is no longer available.`;
      case "elsewhere":
        return t`You joined voice from another tab or device.`;
      case "refused":
        return t`You were disconnected from voice.`;
      case "deviceAccess":
        return t`Allow microphone or camera access in your browser settings.`;
      case "noDevice":
        return t`No media device was found. Check your device settings.`;
      case "failed":
        return t`Voice connection failed. Check your connection and try again.`;
    }
  };

  const status = (s: CallStatus): string => {
    switch (s) {
      case "connected":
        return t`Connected`;
      case "connecting":
        return t`Connecting`;
      case "reconnecting":
        return t`Connection lost. Reconnecting…`;
      case "disconnected":
      case "idle":
        return t`Disconnected`;
    }
  };

  const route = (r: OutputRoute): string => {
    switch (r) {
      case "speaker":
        return t`Speaker`;
      case "earpiece":
        return t`Phone`;
      case "headset":
        return t`Headphones`;
      case "bluetooth":
        return t`Bluetooth`;
    }
  };

  return { error, status, route };
}
