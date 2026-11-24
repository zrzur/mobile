import { useLingui } from "@lingui/react/macro";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, View } from "react-native";

import { audioDuration } from "@/media/audioDuration";
import { usePlaybackOwner } from "@/media/hooks";
import { prepareAudio } from "@/media/playback";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";

import { RText, useRoom, withAlpha } from "./parts";
import { barPlayed, mediaTime, placeholderBars, seekRatio } from "./voice";

type Props = {
  src: string;
  /** music or another audio file: its name above the waveform */
  title?: string;
  /** e.g. the file size */
  detail?: string;
  /** shows a download button that opens this address */
  download?: string;
  onOpenLink?: (url: string) => void;
  onLongPress?: () => void;
};

function Wave({
  bars,
  progress,
  height,
  label,
  valueText,
  onSeek,
}: {
  bars: number[];
  progress: number;
  height: number;
  label: string;
  valueText: string;
  onSeek?: (ratio: number) => void;
}) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  const width = useRef(0);
  const rtl = i18n.locale === "ar";
  const seek = (event: GestureResponderEvent) => onSeek?.(seekRatio(event.nativeEvent.locationX, width.current, rtl));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      onLayout={(event) => (width.current = event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !!onSeek}
      onMoveShouldSetResponder={() => !!onSeek}
      onResponderGrant={seek}
      onResponderMove={seek}
      style={{ flex: 1, minWidth: 0, height, flexDirection: "row", alignItems: "center", gap: 2 }}
    >
      {bars.map((bar, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            flex: 1,
            minWidth: 2,
            maxWidth: 4,
            height: `${Math.round(bar * 100)}%`,
            borderRadius: 2,
            backgroundColor: barPlayed(i, bars.length, progress) ? palette.accentText : withAlpha(palette.fg, 0.28),
          }}
        />
      ))}
    </View>
  );
}

/** The player itself, mounted only after the first press (no audio object per row before) */
function LivePlayer({ src, onTime, onStop }: { src: string; onTime: (current: number, duration: number, playing: boolean) => void; onStop: (stop: () => void, seek: (s: number) => void, toggle: () => void) => void }) {
  const player = useAudioPlayer(src, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  });

  // one sound at a time across notes, audio files and videos
  usePlaybackOwner(status.playing && !status.didJustFinish, () => player.pause());

  useEffect(() => {
    let alive = true;
    const stop = () => player.pause();
    void prepareAudio("play").then(() => alive && player.play());
    onStop(
      stop,
      (seconds) => void player.seekTo(seconds),
      () => {
        if (player.playing) player.pause();
        else void prepareAudio("play").then(() => alive && player.play());
      },
    );
    return () => {
      alive = false;
    };
    // one player per source; the callbacks are read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      void player.seekTo(0);
      player.pause();
    }
    onTimeRef.current(status.didJustFinish ? 0 : status.currentTime, status.duration, status.playing && !status.didJustFinish);
  }, [player, status.currentTime, status.duration, status.playing, status.didJustFinish]);

  return null;
}

/**
 * A voice note (web VoiceMessage): a rounded pill with the accent play
 * button, a waveform that fills as it plays (press or drag across it to
 * seek) and the time. Audio files share the look with their name and a
 * download button.
 */
export const VoiceMessage = memo(function VoiceMessage({ src, title, detail, download, onOpenLink, onLongPress }: Props) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const room = useRoom(title ? 420 : 320);
  const [live, setLive] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: audioDuration.peek(src) ?? 0, playing: false });
  const controls = useRef<{ stop: () => void; seek: (s: number) => void; toggle: () => void } | null>(null);
  const bars = useMemo(() => placeholderBars(src), [src]);
  const track = !!title;

  const progress = time.duration ? Math.min(1, time.current / time.duration) : 0;
  const shown = mediaTime(time.playing || time.current ? time.current : time.duration);

  // the length before the first press (web: the file's metadata), so the
  // row shows 0:42 and not 0:00
  useEffect(() => {
    if (audioDuration.peek(src)) return;
    return audioDuration.request(src, (seconds) => setTime((now) => (now.duration ? now : { ...now, duration: seconds })));
  }, [src]);

  const onTime = (current: number, duration: number, playing: boolean) => {
    if (duration > 0 && Number.isFinite(duration)) audioDuration.remember(src, duration);
    setTime({ current, duration: duration > 0 && Number.isFinite(duration) ? duration : (audioDuration.peek(src) ?? 0), playing });
  };

  const press = () => {
    if (!live) setLive(true);
    else controls.current?.toggle();
  };

  const wave = (
    <Wave
      bars={bars}
      progress={progress}
      height={track ? 20 : 26}
      label={t`Playback position`}
      valueText={`${mediaTime(time.current)} / ${mediaTime(time.duration)}`}
      onSeek={live && time.duration ? (ratio) => controls.current?.seek(ratio * time.duration) : undefined}
    />
  );

  return (
    <Pressable
      testID="voice-message"
      accessibilityRole="none"
      accessibilityLabel={title ?? t`Voice message`}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: track ? 12 : 10,
        width: room,
        height: track ? 64 : 48,
        paddingStart: track ? 10 : 8,
        paddingEnd: track ? 8 : 14,
        marginTop: 4,
        borderRadius: track ? 18 : 999,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: palette.field,
      }}
    >
      {live ? (
        <LivePlayer
          src={src}
          onTime={onTime}
          onStop={(stop, seek, toggle) => {
            controls.current = { stop, seek, toggle };
          }}
        />
      ) : null}
      <Pressable
        testID="voice-play"
        accessibilityRole="button"
        accessibilityLabel={time.playing ? t`Pause` : t`Play`}
        onPress={press}
        hitSlop={6}
        style={({ pressed }) => ({
          width: track ? 40 : 32,
          height: track ? 40 : 32,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? palette.accentPressed : palette.accent,
        })}
      >
        <Icon name={time.playing ? "pause" : "play"} size={16} color={palette.onAccent} />
      </Pressable>
      {track ? (
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <RText size={13.5} line={18} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </RText>
            {detail ? (
              <RText size={11.5} line={16} color={palette.muted}>
                {detail}
              </RText>
            ) : null}
          </View>
          {wave}
        </View>
      ) : (
        wave
      )}
      <RText size={12} line={16} color={palette.muted} style={{ minWidth: 34, textAlign: "right", fontVariant: ["tabular-nums"] }}>
        {shown}
      </RText>
      {download && onOpenLink ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t`Download`}
          onPress={() => onOpenLink(download)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="download-simple" size={18} color={palette.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});
