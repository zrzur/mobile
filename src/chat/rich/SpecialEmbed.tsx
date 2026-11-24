import { useLingui } from "@lingui/react/macro";
import type { WebsiteEmbed } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";

import {
  type SpecialLike,
  fitMessageMedia,
  mediaBox,
  playerKey,
  playerProvider,
  playerSize,
  playerUrl,
  playersPolicyUrl,
  startOnClick,
} from "./embeds";
import { RText, withAlpha } from "./parts";
import { allowMediaPlayer, isPlayerAllowed, usePlayerConsent } from "./playerConsent";

/** The host of an address, for keeping a player on its own site */
function hostOf(address: string | undefined) {
  try {
    return address ? new URL(address).host : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Shown instead of a player from another site until the reader chooses to
 * load it (web SpecialEmbedPlaceholder). Nothing here contacts the
 * provider: the picture comes through our own proxy.
 */
function Placeholder({
  provider,
  company,
  title,
  thumbnail,
  heading,
  width,
  onLoad,
  onOpenLink,
}: {
  provider: string;
  company: string;
  title?: string;
  thumbnail?: string;
  heading: boolean;
  width: number;
  onLoad: () => void;
  onOpenLink: (url: string) => void;
}) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const client = useClient();
  const policy = playersPolicyUrl(
    (client.configuration?.features as { legal_links?: { privacy_policy?: string } } | undefined)?.legal_links?.privacy_policy,
  );
  const label = title ? t`Load ${provider} player: ${title}` : t`Load ${provider} player`;
  return (
    <View testID="player-placeholder" style={{ width, minHeight: 120, borderRadius: 10, overflow: "hidden", backgroundColor: palette.field }}>
      {thumbnail ? (
        <>
          <Image source={{ uri: thumbnail }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={thumbnail} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(palette.frame, 0.9) }} />
        </>
      ) : null}
      <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "flex-start", padding: 12, gap: 4 }}>
        {heading ? (
          <RText size={14} line={20} weight="semibold" color={palette.fg2}>
            {provider}
          </RText>
        ) : null}
        <RText size={14} line={20} color={palette.fg}>
          {t`Loading this connects to ${String(company)}. They get your IP address and may store cookies.`}
        </RText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, width: "100%" }}>
          <Pressable
            testID="player-load"
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onLoad}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? palette.accentPressed : palette.accent,
            })}
          >
            <RText size={15} line={20} weight="semibold" color={palette.onAccent}>
              {t`Load`}
            </RText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => onOpenLink(policy)} style={{ minHeight: 44, justifyContent: "center" }}>
            <RText size={14} line={20} color={palette.link} style={{ textDecorationLine: "underline" }}>
              {t`Privacy policy`}
            </RText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * A player from another site (YouTube, Twitch, Spotify, …), web
 * SpecialEmbed. The web view is created only after "Load", or at once when
 * the reader allowed this site before (or always loads players). A player
 * that loads by itself shows stopped; only one made by a press on Load
 * starts at once. Pages other than the player open outside the app.
 */
export function SpecialEmbed({
  embed,
  standalone,
  room,
  onOpenLink,
}: {
  embed: WebsiteEmbed;
  standalone?: boolean;
  room: number;
  onOpenLink: (url: string) => void;
}) {
  const consent = usePlayerConsent();
  const [clicked, setClicked] = useState(false);
  const special = embed.specialContent as SpecialLike | undefined;
  if (!special) return null;
  const key = playerKey(special);
  const size = playerSize(special, embed.video ? { width: embed.video.width, height: embed.video.height } : undefined);
  const provider = playerProvider(key ?? "") ?? { name: embed.siteName ?? "", company: embed.siteName ?? "" };
  const address = playerUrl(special, embed.embedURL);
  const loaded = clicked || isPlayerAllowed(consent, key);

  if (!loaded || !address) {
    const width = Math.min(room, fitMessageMedia(size.width, size.height).width);
    return (
      <Placeholder
        provider={provider.name || embed.siteName || ""}
        company={provider.company || embed.siteName || ""}
        title={embed.title ?? undefined}
        heading={!!standalone || !embed.siteName}
        thumbnail={embed.image?.proxiedURL}
        width={width}
        onOpenLink={onOpenLink}
        onLoad={() => {
          setClicked(true);
          allowMediaPlayer(key);
        }}
      />
    );
  }

  const box = mediaBox(size.width, size.height, room);
  const src = clicked ? startOnClick(address) : address;
  const home = hostOf(address);
  return (
    <View testID="player-frame" style={{ width: box.width, height: box.height, borderRadius: 10, overflow: "hidden", backgroundColor: "#000000" }}>
      <WebView
        source={{ uri: src ?? address, headers: { Referer: "https://app.zrzur.com/" } }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={!clicked}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        allowFileAccess={false}
        geolocationEnabled={false}
        mediaCapturePermissionGrantType="deny"
        scrollEnabled={false}
        originWhitelist={["https://*"]}
        onShouldStartLoadWithRequest={(request: WebViewNavigation & { isTopFrame?: boolean }) => {
          // frames inside the player may load; the player itself stays on its site
          if (request.isTopFrame === false) return true;
          if (hostOf(request.url) === home) return true;
          if (/^https?:/.test(request.url)) onOpenLink(request.url);
          return false;
        }}
      />
    </View>
  );
}
