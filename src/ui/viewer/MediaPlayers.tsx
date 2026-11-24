import { useLingui } from "@lingui/react/macro";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { memo, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { usePlaybackOwner, useVideoPlaying } from "@/media/hooks";
import { prepareAudio } from "@/media/playback";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

/** m:ss */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A video with the phone's own controls (expo-video), started on open */
export function VideoPlayer({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  // one sound at a time: a voice note or another video pauses this one
  usePlaybackOwner(useVideoPlaying(player), () => player.pause());
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls allowsPictureInPicture={false} />;
}

function AudioControls({ uri, name, size }: { uri: string; name?: string; size?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  usePlaybackOwner(status.playing, () => player.pause());
  // the first tap made this player: it starts at once
  useEffect(() => {
    let alive = true;
    void prepareAudio("play").then(() => alive && player.play());
    return () => {
      alive = false;
    };
  }, [player]);
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
      void prepareAudio("play").then(() => player.play());
    }
  };
  return (
    <Row
      playing={status.playing}
      onPress={toggle}
      label={status.playing ? t`Pause` : t`Play`}
      name={name}
      detail={`${clock(status.currentTime)} / ${status.duration ? clock(status.duration) : (size ?? "…")}`}
      progress={progress}
      palette={palette}
    />
  );
}

function Row({
  playing,
  onPress,
  label,
  name,
  detail,
  progress,
  palette,
}: {
  playing: boolean;
  onPress: () => void;
  label: string;
  name?: string;
  detail?: string;
  progress: number;
  palette: ReturnType<typeof useTheme>["palette"];
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, paddingEnd: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.field }}>
      <Pressable
        testID="audio-play"
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={playing ? "pause" : "play"} size={20} color={palette.onAccent} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <AText autoDir size={14} line={18} weight="medium" color={palette.fg} numberOfLines={1}>
          {name ?? ""}
        </AText>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, overflow: "hidden" }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: palette.accent }} />
        </View>
        {detail ? (
          <AText size={12} line={16} color={palette.muted}>
            {detail}
          </AText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * An audio file inside a message. The player is only made on the first
 * tap, so a long chat full of voice notes costs nothing until one plays.
 */
export const AudioAttachment = memo(function AudioAttachment({ uri, name, size }: { uri: string; name?: string; size?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [active, setActive] = useState(false);
  if (active) return <AudioControls uri={uri} name={name} size={size} />;
  return <Row playing={false} onPress={() => setActive(true)} label={t`Play`} name={name} detail={size} progress={0} palette={palette} />;
});
