import { Image } from "expo-image";
import { memo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";

import type { Palette } from "@/theme/palette";

import { defaultAvatarXml } from "./defaultAvatar";
import { initialsText } from "./initials";
import { AText } from "./kit/Text";

type Presence = "Online" | "Idle" | "Focus" | "Busy" | "Invisible" | undefined;

/** Presence dot colours from the theme (light themes use darker dots that keep 3:1) */
export function presenceColour(palette: Palette, presence: string | undefined): string {
  switch (presence) {
    case "Online":
      return palette.online;
    case "Idle":
      return palette.idle;
    case "Focus":
      return palette.focusPresence;
    case "Busy":
      return palette.busy;
    default:
      return palette.offline;
  }
}

/**
 * Round picture from the CDN, cached on disk by expo-image (no repeated
 * downloads, decoded at the shown size to keep memory low). Falls back to
 * the initials (two letters, as on the web) on a quiet surface.
 */
export const Avatar = memo(function Avatar({
  url,
  name,
  size,
  presence,
  square,
}: {
  url?: string;
  name?: string;
  size: number;
  presence?: Presence;
  /** servers use a rounded square, like the web */
  square?: boolean;
}) {
  const { palette } = useTheme();
  const radius = square ? Math.round(size * 0.3) : size / 2;
  const dot = Math.max(10, Math.round(size * 0.3));
  const letters = url ? "" : initialsText(name ?? "");
  // no picture of their own: the face from Zrzur's avatar pack (web withDefaultAvatar)
  const pack = defaultAvatarXml(url);
  return (
    <View style={{ width: size, height: size }}>
      {pack ? (
        <View testID="avatar-pack" style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }} accessibilityIgnoresInvertColors>
          <SvgXml xml={pack} width={size} height={size} />
        </View>
      ) : url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: palette.field }}
          cachePolicy="memory-disk"
          recyclingKey={url}
          transition={120}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: palette.tonal,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AText
            size={Math.max(10, Math.round(size * (letters.length > 1 ? 0.34 : 0.4)))}
            line={Math.round(size * 0.5)}
            weight="semibold"
            color={palette.fg}
            maxFontSizeMultiplier={1}
            numberOfLines={1}
          >
            {letters || "?"}
          </AText>
        </View>
      )}
      {presence ? (
        <View
          style={{
            position: "absolute",
            end: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            borderWidth: 2,
            borderColor: palette.frame,
            backgroundColor: presenceColour(palette, presence),
          }}
        />
      ) : null}
    </View>
  );
});

/** A user's avatar that follows their picture and presence live */
export function UserAvatar({
  user,
  size,
  showPresence,
}: {
  user: { avatarURL?: string; displayName?: string; username?: string; presence?: string } | undefined;
  size: number;
  showPresence?: boolean;
}) {
  const fields = useFields(user, (u) => ({
    url: u.avatarURL,
    name: u.displayName ?? u.username,
    presence: u.presence,
  }));
  return (
    <Avatar
      url={fields?.url}
      name={fields?.name}
      size={size}
      presence={showPresence ? (fields?.presence as Presence) : undefined}
    />
  );
}
