import { useLingui } from "@lingui/react/macro";
import { useWindowDimensions, View } from "react-native";
import { type PanGesture, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { useTheme } from "@/theme/ThemeProvider";
import { haptics } from "@/ui/kit/haptics";
import { PressScale } from "@/ui/kit/Press";

import { call, callStore } from "../call";
import { barButtons, CALL_EDGE } from "../layout";
import { micLabel } from "../logic";
import { useStoreFields } from "../store";
import { ControlButton } from "./parts";

const FIELDS = ["status", "micOn", "deafen", "canSpeak", "canVideo", "camera", "serverMuted"] as const;

/**
 * The call's floating bar (web: VoiceCallCardActions in phoneCall.css):
 * one rounded bar above the bottom edge with camera, microphone, chat, more
 * and the red hang up, and a drag handle above it (drag it up or tap it for
 * the rest: sound output, hearing, screen share, soundboard, room controls).
 * Every button is at least 44 px, presses spring and tick.
 *
 * @param live false in a build without voice or before joining: camera and
 *   chat stay, the microphone keeps the choice for the call
 */
export function CallControls({
  live,
  hangUpLabel,
  onChat,
  onMore,
  onLeave,
}: {
  live: boolean;
  /** "Disconnect" in a call, "Cancel" while ringing, "Close" without voice */
  hangUpLabel?: string;
  onChat?: () => void;
  onMore: () => void;
  onLeave: () => void;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const s = useStoreFields(callStore, FIELDS);
  const connected = s.status === "connected";
  const unmuted = s.micOn && !s.deafen && s.canSpeak;
  const count = 4 + (onChat ? 1 : 0);
  const { size, hangUp } = barButtons(count, width);
  const radius = Math.round((size * 18) / 52);
  const mic = micLabel({ serverMuted: s.serverMuted, canSpeak: s.canSpeak, unmuted });

  // drag the handle up: the rest of the controls
  const pull: PanGesture = usePanGesture({
    activeOffsetY: [-10, 10],
    onDeactivate: (e) => {
      "worklet";
      if (e.translationY < -24 || e.velocityY < -600) scheduleOnRN(onMore);
    },
  });

  return (
    <View style={{ alignItems: "center", paddingHorizontal: CALL_EDGE, paddingBottom: 14 }}>
      <GestureDetector gesture={pull}>
        <PressScale
          testID="voice-controls-handle"
          accessibilityRole="button"
          accessibilityLabel={t`More`}
          onPress={onMore}
          haptic="selection"
          scale={0.94}
          style={{ width: 88, height: 24, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong }} />
        </PressScale>
      </GestureDetector>
      <View
        testID="voice-controls"
        style={{
          maxWidth: 572,
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: 12,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: palette.borderSubtle,
          backgroundColor: palette.field,
          shadowColor: palette.shadow,
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        }}
      >
        <ControlButton
          size={size}
          radius={radius}
          testID="voice-control-camera"
          icon={s.camera ? "video-camera" : "video-camera-slash"}
          tone={s.camera ? "on" : "neutral"}
          pressed={s.camera}
          disabled={!live || !connected || (!s.canVideo && !s.camera)}
          label={!s.canVideo && !s.camera ? t`Camera unavailable` : s.camera ? t`Stop camera` : t`Start camera`}
          onPress={() => {
            haptics.light();
            void call.toggleCamera();
          }}
        />
        <ControlButton
          size={size}
          radius={radius}
          testID="voice-control-microphone"
          icon={unmuted ? "microphone" : "microphone-slash"}
          tone={unmuted ? "neutral" : "off"}
          pressed={!unmuted}
          disabled={!s.canSpeak}
          label={mic === "serverMuted" ? t`Server muted` : mic === "missing" ? t`Missing permission` : mic === "mute" ? t`Mute` : t`Unmute`}
          onPress={() => {
            haptics.light();
            void call.toggleMute();
          }}
        />
        {onChat ? (
          <ControlButton
            size={size}
            radius={radius}
            testID="voice-control-chat"
            icon="chat-circle"
            label={t`Chat`}
            onPress={() => {
              haptics.selection();
              onChat();
            }}
          />
        ) : null}
        <ControlButton
          size={size}
          radius={radius}
          testID="voice-control-more"
          icon="dots-three"
          label={t`More`}
          onPress={() => {
            haptics.selection();
            onMore();
          }}
        />
        <ControlButton
          size={size}
          width={hangUp}
          radius={radius}
          testID="voice-control-disconnect"
          icon="phone-disconnect"
          tone="danger"
          label={hangUpLabel ?? t`Disconnect`}
          onPress={() => {
            haptics.medium();
            onLeave();
          }}
        />
      </View>
    </View>
  );
}
