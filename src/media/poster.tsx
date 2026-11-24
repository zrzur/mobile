import { createVideoPlayer, type VideoThumbnail } from "expo-video";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";

import { secureStorage } from "@/lib/secureStorage";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { AText } from "@/ui/kit/Text";
import { readPrefs, SAVE_DATA_DEFAULTS, SAVE_DATA_KEY } from "@/ui/settings/user/userPrefs";

import { useRowVisible } from "./hooks";
import { createPosterQueue, type Poster, posterClock } from "./posterQueue";

/**
 * The poster of a video before it plays (web: <video preload="metadata">
 * shows the first frame and the length): the first frame made on the phone,
 * the play badge, and the length in a corner. Nothing is made while Save
 * data is on, or while the message is off screen.
 */

const READY_MS = 8000;

function whenReady(player: ReturnType<typeof createVideoPlayer>): Promise<boolean> {
  if (player.status === "readyToPlay") return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, READY_MS);
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay" || status === "error") {
        clearTimeout(timer);
        sub.remove();
        resolve(status === "readyToPlay");
      }
    });
  });
}

async function generate(uri: string): Promise<Poster<VideoThumbnail> | null> {
  if (Platform.OS === "web") return null;
  const player = createVideoPlayer(null);
  try {
    player.muted = true;
    player.loop = false;
    await player.replaceAsync({ uri });
    if (!(await whenReady(player))) return null;
    const [thumb] = await player.generateThumbnailsAsync(0, { maxWidth: 720 });
    if (!thumb) return null;
    return { image: thumb, width: thumb.width, height: thumb.height, seconds: player.duration };
  } finally {
    player.release();
  }
}

const queue = createPosterQueue<VideoThumbnail>({ generate });

// Save data, read again at most every 10 s (the setting writes to the same store)
let saveData = { value: false, at: 0 };
async function savingData(): Promise<boolean> {
  if (Date.now() - saveData.at < 10_000) return saveData.value;
  const raw = await secureStorage.get(SAVE_DATA_KEY).catch(() => null);
  saveData = { value: !!readPrefs(raw, SAVE_DATA_DEFAULTS).enabled, at: Date.now() };
  return saveData.value;
}

/** The poster of `uri` once made (undefined while waiting or when none is made) */
export function useVideoPoster(uri: string): Poster<VideoThumbnail> | undefined {
  const visible = useRowVisible();
  const [poster, setPoster] = useState<{ uri: string; poster: Poster<VideoThumbnail> } | undefined>(() => {
    const known = queue.peek(uri);
    return known ? { uri, poster: known } : undefined;
  });
  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    let live = true;
    let cancel = () => {};
    void savingData().then((saving) => {
      if (!live || saving) return;
      cancel = queue.request(uri, (made) => {
        if (live && made) setPoster({ uri, poster: made });
      });
    });
    return () => {
      live = false;
      cancel();
    };
  }, [uri, visible]);
  return poster?.uri === uri ? poster.poster : undefined;
}

/**
 * A video before it plays: the poster (or the plain frame), a round play
 * badge in the middle and the length at the bottom end corner.
 */
export function VideoPoster({ uri, width, height, radius = 14 }: { uri: string; width: number; height: number; radius?: number }) {
  const { palette } = useTheme();
  const poster = useVideoPoster(uri);
  const length = posterClock(poster?.seconds);
  return (
    <View testID="video-poster" style={{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: palette.field, alignItems: "center", justifyContent: "center" }}>
      {poster ? <Image source={poster.image} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" transition={120} /> : null}
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: palette.scrim, alignItems: "center", justifyContent: "center" }}>
        <Icon name="play" size={24} color={palette.knob} />
      </View>
      {length ? (
        <View style={{ position: "absolute", bottom: 8, end: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: palette.scrim }}>
          <AText size={12} line={16} weight="semibold" color={palette.knob} style={{ fontVariant: ["tabular-nums"] }}>
            {length}
          </AText>
        </View>
      ) : null}
    </View>
  );
}
