import { useLingui } from "@lingui/react/macro";
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Linking, Pressable, View } from "react-native";

import { callActive, playback, prepareAudio } from "@/media/playback";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";

import { RText, withAlpha } from "./parts";
import { fileNameOf, MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, WAVEFORM_BARS, mediaTime, meteringToLevel, pushLevel, VOICE_PREFIX, voiceRenameTo } from "./voice";
import { haptics } from "@/ui/kit/haptics";

/** A finished recording, ready for `client.uploadFile("attachments", file)` */
export type VoiceFile = {
  /** local file address (React Native's FormData takes { uri, name, type }) */
  uri: string;
  /** `voice-message-<ms>.m4a`: the name is what makes it a voice note */
  name: string;
  type: "audio/mp4";
  /** seconds */
  duration: number;
};

/** `stopped`: the system or leaving the app ended the recording early (it can still be sent); `in-call`: a call holds the microphone */
type State = "starting" | "recording" | "limit" | "stopped" | "blocked" | "failed" | "in-call";

const OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
};

/** Stop without throwing: the recorder may be released already */
function safeStop(recorder: { stop(): Promise<void> }) {
  try {
    return recorder.stop().catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/** The recording under a voice-message name (when the recorder did not take the name it was given) */
function withVoiceName(uri: string): string {
  const name = voiceRenameTo(uri);
  if (!name) return uri;
  try {
    const file = new File(uri);
    file.rename(name);
    return file.uri;
  } catch {
    return uri;
  }
}

function Dot({ paused }: { paused: boolean }) {
  const { palette } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (paused) {
      opacity.setValue(0.5);
      return;
    }
    let loop: Animated.CompositeAnimation | undefined;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      alive = false;
      loop?.stop();
      opacity.setValue(1);
    };
  }, [paused, opacity]);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette.danger, opacity }} />;
}

/**
 * The recording bar shown above the message box (web VoiceRecorder): live
 * level meter, timer, discard and send. Recording starts as soon as it
 * opens; the microphone is released whenever it closes. Stops at five
 * minutes ("Limit reached"). With `held`, it is a hold-to-record: letting
 * go (`held` turning false) sends.
 */
export function VoiceRecorder({
  onSend,
  onClose,
  held,
}: {
  /** the recording, at least half a second long */
  onSend: (file: VoiceFile) => void;
  /** closed without a recording (discarded, too short, or blocked) */
  onClose: () => void;
  /** hold-to-record: true while the finger is down; false sends */
  held?: boolean;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<State>("starting");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(WAVEFORM_BARS).fill(0.08));
  const done = useRef(false);
  const live = useRef({ onSend, onClose, seconds: 0 });
  useEffect(() => {
    live.current = { onSend, onClose, seconds };
  });

  // start at once; release on close
  useEffect(() => {
    let alive = true;
    (async () => {
      // a call owns the microphone and the audio session: changing the
      // session for a recording would cut the call's microphone (iOS)
      if (callActive()) {
        setState("in-call");
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!alive) return;
      if (!permission.granted) {
        setState("blocked");
        return;
      }
      playback.pauseCurrent();
      await prepareAudio("record");
      // the uploader sends the file's own name, and the name is what makes
      // it a voice note (web and phone): record straight into
      // voice-message-<ms>.m4a instead of expo-audio's recording-<UUID>.m4a
      await recorder.prepareToRecordAsync({ ...OPTIONS, fileName: `${VOICE_PREFIX}-${Date.now()}` });
      if (!alive) return;
      recorder.record();
      setState("recording");
    })().catch(() => alive && setState("failed"));
    return () => {
      alive = false;
      if (!done.current) {
        done.current = true;
        void safeStop(recorder);
      }
      void prepareAudio("record-end");
    };
  }, [recorder]);

  // leaving the app stops the recording (iOS would end it anyway); what was
  // recorded can still be sent or discarded
  useEffect(() => {
    if (state !== "recording") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background") return;
      try {
        recorder.pause();
      } catch {
        // already stopped by the system
      }
      setState("stopped");
    });
    return () => sub.remove();
  }, [state, recorder]);

  // meter and timer: one bar every 100 ms, newest on the end
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      const status = recorder.getStatus();
      const elapsed = status.durationMillis / 1000;
      setSeconds(elapsed);
      // a phone call or Siri took the microphone: the recording ended here
      if (!status.isRecording) {
        setState("stopped");
        return;
      }
      if (elapsed >= MAX_VOICE_SECONDS) {
        recorder.pause();
        setState("limit");
        return;
      }
      setLevels((previous) => pushLevel(previous, meteringToLevel(status.metering)));
    }, 100);
    return () => clearInterval(timer);
  }, [state, recorder]);

  const finish = async () => {
    if (done.current) return;
    const length = live.current.seconds;
    if ((state !== "recording" && state !== "limit" && state !== "stopped") || length < MIN_VOICE_SECONDS) {
      done.current = true;
      void safeStop(recorder);
      live.current.onClose();
      return;
    }
    done.current = true;
    await safeStop(recorder);
    const uri = recorder.uri;
    if (!uri) {
      live.current.onClose();
      return;
    }
    const named = withVoiceName(uri);
    live.current.onSend({ uri: named, name: fileNameOf(named), type: "audio/mp4", duration: length });
  };

  const discard = () => {
    if (!done.current) {
      done.current = true;
      void safeStop(recorder);
    }
    live.current.onClose();
  };

  // hold-to-record: letting go sends
  const wasHeld = useRef(held);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (wasHeld.current && held === false) void finishRef.current();
    wasHeld.current = held;
  }, [held]);

  useEffect(() => {
    // start: a light tap; stop: a firmer one
    if (state === "recording") haptics.light();
    else if (state === "stopped") haptics.medium();
  }, [state]);

  const active = state === "recording" || state === "limit" || state === "stopped";

  return (
    <View
      testID="voice-recorder"
      accessibilityLabel={t`Voice message`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
        paddingVertical: 2,
        paddingHorizontal: 4,
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: palette.field,
      }}
    >
      <Pressable
        testID="voice-discard"
        accessibilityRole="button"
        accessibilityLabel={t`Discard recording`}
        onPress={discard}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? withAlpha(palette.danger, 0.12) : "transparent",
        })}
      >
        {({ pressed }) => <Icon name="trash" size={18} color={pressed ? palette.danger : palette.muted} />}
      </Pressable>

      {active ? (
        <>
          <Dot paused={state !== "recording"} />
          <RText size={12} line={16} color={palette.fg} style={{ minWidth: 34, fontVariant: ["tabular-nums"] }} accessibilityLiveRegion="none">
            {mediaTime(seconds)}
          </RText>
          <View importantForAccessibility="no-hide-descendants" style={{ flex: 1, minWidth: 0, height: 26, flexDirection: "row", alignItems: "center", gap: 2 }}>
            {levels.map((level, i) => (
              <View key={i} style={{ flex: 1, minWidth: 2, maxWidth: 4, height: `${Math.round(level * 100)}%`, borderRadius: 2, backgroundColor: withAlpha(palette.accent, 0.7) }} />
            ))}
          </View>
          {state === "limit" || state === "stopped" ? (
            <RText size={13} line={18} color={palette.muted}>
              {state === "limit" ? t`Limit reached` : t`Recording stopped`}
            </RText>
          ) : null}
        </>
      ) : (
        <View style={{ flex: 1, gap: 4, paddingVertical: 8 }} accessibilityRole="text" accessibilityLiveRegion="polite">
          <RText size={13} line={18} color={palette.muted}>
            {state === "starting"
              ? t`Starting the microphone…`
              : state === "blocked"
                ? t`Microphone access is blocked. Allow it in your phone's settings to record.`
                : state === "in-call"
                  ? t`Voice messages can't be recorded during a call.`
                  : t`The microphone could not be started.`}
          </RText>
          {state === "blocked" ? (
            <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
              <RText size={13} line={18} weight="semibold" color={palette.link}>
                {t`Open settings`}
              </RText>
            </Pressable>
          ) : null}
        </View>
      )}

      <Pressable
        testID="voice-send"
        accessibilityRole="button"
        accessibilityLabel={t`Send voice message`}
        accessibilityState={{ disabled: !active }}
        disabled={!active}
        onPress={() => void finish()}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: active ? 1 : 0.4 }}
      >
        {({ pressed }) => (
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.accentPressed : palette.accent }}>
            <Icon name="paper-plane-tilt" size={18} color={palette.onAccent} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

/**
 * The microphone button for the composer: a tap opens the recording bar
 * (as the web), a long press records while held and sends on release.
 * Keep it mounted while recording so the release reaches it.
 */
export function VoiceRecordButton({
  onStart,
  onRelease,
  disabled,
}: {
  /** "tap": the bar stays until Send or Discard; "hold": `held` is true until release */
  onStart: (mode: "tap" | "hold") => void;
  /** the finger left the button after a hold */
  onRelease: () => void;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const holding = useRef(false);
  return (
    <Pressable
      testID="composer-record-voice"
      accessibilityRole="button"
      accessibilityLabel={t`Record a voice message`}
      disabled={disabled}
      onPress={() => onStart("tap")}
      onLongPress={() => {
        holding.current = true;
        onStart("hold");
      }}
      delayLongPress={250}
      onPressOut={() => {
        if (!holding.current) return;
        holding.current = false;
        onRelease();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? palette.navSelected : "transparent",
      })}
    >
      <Icon name="microphone" size={22} color={palette.iconMuted} />
    </Pressable>
  );
}
