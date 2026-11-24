import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useAppActive, usePlaybackOwner, useRowVisible, useStillMotion, useVideoPlaying } from "@/media/hooks";
import { callActive } from "@/media/playback";
import { VideoPoster } from "@/media/poster";
import { useTheme } from "@/theme/ThemeProvider";

import { mediaBox } from "./embeds";

/**
 * Media inside messages: always sized before it loads (no jump in the chat
 * list), decoded at the shown size, cached on disk.
 */

export type MediaPress = {
  onPress?: () => void;
  onLongPress?: () => void;
};

/** A picture of known size, fitted like the web's SizedContent */
export function SizedImage({
  uri,
  width,
  height,
  room,
  radius = 14,
  label,
  onPress,
  onLongPress,
  testID,
}: {
  uri: string;
  width: number;
  height: number;
  room: number;
  radius?: number;
  label?: string;
  testID?: string;
} & MediaPress) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const box = mediaBox(width, height, room);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="imagebutton"
      accessibilityLabel={label ?? t`Image`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={!onPress && !onLongPress}
    >
      <Image
        source={{ uri }}
        style={{ width: box.width, height: box.height, borderRadius: radius, backgroundColor: palette.field }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={0}
      />
    </Pressable>
  );
}

/** Pictures whose size the server does not send keep the ratio they showed once */
const knownRatio = new Map<string, number>();

/**
 * A bot's large picture (no size given): a 16:9 frame until the picture is
 * known, then its own ratio, remembered so a recycled row does not jump again
 */
export function FreeImage({ uri, maxWidth, maxHeight = 320, radius = 10 }: { uri: string; maxWidth: number; maxHeight?: number; radius?: number }) {
  const { palette } = useTheme();
  const [ratio, setRatio] = useState(() => knownRatio.get(uri) ?? 16 / 9);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return (
    <Image
      source={{ uri }}
      accessibilityIgnoresInvertColors
      style={{ width: Math.round(width), height: Math.round(height), borderRadius: radius, backgroundColor: palette.field }}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onLoad={(event) => {
        const { width: w, height: h } = event.source;
        if (!w || !h) return;
        const next = w / h;
        knownRatio.set(uri, next);
        if (Math.abs(next - ratio) > 0.01) setRatio(next);
      }}
    />
  );
}

/** A small square preview (thumbnails, 88 px at most) */
export function Thumb({ uri, size = 88, onPress }: { uri: string; size?: number; onPress?: () => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={t`Image`} disabled={!onPress} onPress={onPress}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 6, backgroundColor: palette.field }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
      />
    </Pressable>
  );
}

function LiveVideo({ uri, gif, width, height }: { uri: string; gif: boolean; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = gif;
    p.muted = gif;
    // a silent GIF must not stop other apps' music or touch a call's audio
    if (gif || callActive()) p.audioMixingMode = "mixWithOthers";
  });
  const playing = useVideoPlaying(player);
  const visible = useRowVisible();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const still = useStillMotion();
  // a video with sound takes part in "one sound at a time"; muted GIFs do not
  usePlaybackOwner(!gif && playing, () => player.pause());

  // plays only while its row is on screen, its screen in front and the app open:
  // a GIF loops then (unless motion is reduced); a video starts once, after its press
  const allowed = visible && focused && appActive;
  const started = useRef(false);
  useEffect(() => {
    if (!allowed) {
      player.pause();
      return;
    }
    if (gif) {
      if (still) player.pause();
      else player.play();
    } else if (!started.current) {
      started.current = true;
      player.play();
    }
  }, [allowed, gif, still, player]);

  return (
    <VideoView
      player={player}
      nativeControls={!gif}
      contentFit="contain"
      style={{ width, height, borderRadius: 14, overflow: "hidden", backgroundColor: "#000000" }}
    />
  );
}

/**
 * A video: a sized frame with a play button, and the native player only
 * after a press, so a long chat never holds many players. A GIF loops,
 * muted, as soon as it shows.
 */
export function LazyVideo({
  uri,
  width,
  height,
  room,
  gif = false,
  onLongPress,
  testID,
}: {
  uri: string;
  width: number;
  height: number;
  room: number;
  gif?: boolean;
  onLongPress?: () => void;
  testID?: string;
}) {
  const { t } = useLingui();
  const [started, setStarted] = useState(gif);
  // a recycled list cell may hand this component another message's video:
  // it must not arrive already started (and play with sound)
  const [shownUri, setShownUri] = useState(uri);
  if (shownUri !== uri) {
    setShownUri(uri);
    setStarted(gif);
  }
  const box = mediaBox(width, height, room);
  if (started) {
    return (
      <View testID={testID}>
        <LiveVideo key={uri} uri={uri} gif={gif} width={box.width} height={box.height} />
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t`Play`}
      onPress={() => setStarted(true)}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={{ width: box.width, height: box.height }}
    >
      {/* the first frame and the length before it plays (web: preload="metadata") */}
      <VideoPoster uri={uri} width={box.width} height={box.height} />
    </Pressable>
  );
}
