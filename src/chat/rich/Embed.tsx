import { useLingui } from "@lingui/react/macro";
import type { ImageEmbed, MessageEmbed, TextEmbed, VideoEmbed, WebsiteEmbed } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { Pressable, View } from "react-native";

import { MessageContent } from "@/chat/MessageContent";
import { messageTime } from "@/chat/time";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/ui/Icon";
import { autoDirStyle } from "@/ui/kit/bidi";

import { FOLD_AT, cardDirection, fieldRows, isGif, isOpenableUrl, isPlayerEmbed } from "./embeds";
import { FreeImage, LazyVideo, SizedImage, Thumb } from "./media";
import { BOX_RADIUS, RText } from "./parts";
import { SpecialEmbed } from "./SpecialEmbed";

export type EmbedActions = {
  /** Opens a web address (the chat's link-warning flow) */
  onOpenLink: (url: string) => void;
  /** Opens a picture full screen; without it the picture's address opens */
  onOpenImage?: (image: { url: string; width?: number; height?: number }) => void;
  /** The message's long press (menus), passed to every pressable inside */
  onLongPress?: () => void;
};

function SmallIcon({ uri, size }: { uri: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size === 20 ? 10 : 0 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onError={() => setFailed(true)}
    />
  );
}

/** A bot's description: long ones start folded so one card never fills the channel */
function LongDescription({ text }: { text: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const long = text.length > FOLD_AT;
  return (
    <View>
      <View style={long && !open ? { maxHeight: 240, overflow: "hidden" } : undefined}>
        <MessageContent content={text} />
      </View>
      {long ? (
        <Pressable
          testID="embed-more"
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          hitSlop={{ top: 12, bottom: 12 }}
          style={{ marginTop: 4, minHeight: 24, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <RText size={12} line={16} weight="semibold" color={palette.link}>
            {open ? t`Show less` : t`Show more`}
          </RText>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Website previews and bots' Text embeds (web TextEmbed): one filled box,
 * an optional colour rule at its start, author, site, title, description,
 * fields (three inline per row), picture, footer and a thumbnail at the end.
 * The card takes its direction from its own words.
 */
export const TextEmbedCard = memo(function TextEmbedCard({
  embed,
  room,
  onOpenLink,
  onOpenImage,
  onLongPress,
}: { embed: WebsiteEmbed | TextEmbed; room: number } & EmbedActions) {
  const { palette } = useTheme();
  const { i18n } = useLingui();
  const rich = embed.type === "Text" ? (embed as TextEmbed) : undefined;
  const site = embed.type === "Website" ? (embed as WebsiteEmbed) : undefined;
  const rows = fieldRows(rich?.fields ?? []);
  const dir = cardDirection([embed.title, ...(rich?.fields ?? []).map((f) => f.name), rich?.footer?.text, embed.description]);
  const maxWidth = Math.min(room, rows.length ? 520 : 420);
  const contentWidth = maxWidth - 24;
  const open = (url?: string) => isOpenableUrl(url) && onOpenLink(url);
  const openImage = (image: { url: string; width?: number; height?: number }) => (onOpenImage ? onOpenImage(image) : open(image.url));

  const thumbFile = rich?.thumbnail;
  const thumbUrl = thumbFile?.createFileURL() ?? rich?.proxiedThumbnailURL ?? (site?.image?.size === "Preview" && !site.video ? site.image.proxiedURL : undefined);
  const special = site && isPlayerEmbed(site.specialContent?.type);
  const footer = rich?.footer?.text;
  const at = rich?.timestamp;

  return (
    <View
      testID="embed-card"
      style={{
        direction: dir,
        maxWidth,
        alignSelf: "flex-start",
        flexDirection: "row",
        gap: 12,
        padding: 12,
        borderRadius: BOX_RADIUS,
        backgroundColor: palette.field,
        borderStartWidth: embed.colour ? 2 : 0,
        borderStartColor: embed.colour ?? "transparent",
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 0, gap: 8 }}>
        {rich?.author ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {rich.proxiedAuthorIconURL ? <SmallIcon uri={rich.proxiedAuthorIconURL} size={20} /> : null}
            <RText
              size={13}
              line={18}
              weight="semibold"
              color={palette.fg}
              dir={dir}
              numberOfLines={1}
              onPress={isOpenableUrl(rich.author.url) ? () => open(rich.author?.url) : undefined}
              style={{ flexShrink: 1 }}
            >
              {rich.author.name}
            </RText>
          </View>
        ) : null}

        {site?.siteName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {site.proxiedIconURL ? <SmallIcon uri={site.proxiedIconURL} size={14} /> : null}
            <RText size={12} line={16} weight="medium" color={palette.fg2} dir={dir} numberOfLines={1} style={{ flexShrink: 1 }}>
              {site.siteName}
            </RText>
          </View>
        ) : null}

        {embed.title ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {rich?.proxiedIconURL ? <SmallIcon uri={rich.proxiedIconURL} size={14} /> : null}
            <RText
              testID="embed-title"
              size={15}
              line={20}
              weight="semibold"
              color={embed.url ? palette.link : palette.fg}
              dir={dir}
              numberOfLines={1}
              accessibilityRole={embed.url ? "link" : undefined}
              onPress={isOpenableUrl(embed.url) ? () => open(embed.url) : undefined}
              onLongPress={onLongPress}
              style={{ flexShrink: 1 }}
            >
              {embed.title}
            </RText>
          </View>
        ) : null}

        {embed.description ? (
          rich ? (
            <LongDescription text={embed.description} />
          ) : (
            <RText size={14} line={20} color={palette.fg2} dir={dir}>
              {embed.description}
            </RText>
          )
        ) : null}

        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: "row", gap: 16 }}>
            {row.map((field, f) => (
              <View key={f} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <RText size={13} line={18} weight="semibold" color={palette.fg} dir={dir}>
                  {field.name}
                </RText>
                <MessageContent content={field.value} />
              </View>
            ))}
          </View>
        ))}

        {rich?.media ? <FileMedia file={rich.media} room={contentWidth} onOpenLink={onOpenLink} onOpenImage={openImage} onLongPress={onLongPress} /> : null}

        {rich?.proxiedImageURL ? (
          <Pressable accessibilityRole="imagebutton" onPress={() => openImage({ url: rich.imageUrl ?? rich.proxiedImageURL! })} onLongPress={onLongPress} delayLongPress={300}>
            <FreeImage uri={rich.proxiedImageURL} maxWidth={contentWidth} />
          </Pressable>
        ) : null}

        {site && special ? (
          <SpecialEmbed embed={site} room={contentWidth} onOpenLink={onOpenLink} />
        ) : site?.video?.proxiedURL ? (
          <LazyVideo uri={site.video.proxiedURL} width={site.video.width} height={site.video.height} room={contentWidth} onLongPress={onLongPress} />
        ) : site?.image?.size === "Large" && site.image.proxiedURL ? (
          <SizedImage
            uri={site.image.proxiedURL}
            width={site.image.width}
            height={site.image.height}
            room={contentWidth}
            radius={10}
            onPress={() => openImage({ url: site.image!.url, width: site.image!.width, height: site.image!.height })}
            onLongPress={onLongPress}
          />
        ) : null}

        {footer || at ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {rich?.proxiedFooterIconURL ? <SmallIcon uri={rich.proxiedFooterIconURL} size={20} /> : null}
            <RText size={12} line={16} color={palette.muted} dir={dir} style={{ flexShrink: 1 }}>
              {[footer, at ? messageTime(i18n, at) : undefined].filter(Boolean).join(" · ")}
            </RText>
          </View>
        ) : null}
      </View>

      {thumbUrl ? <Thumb uri={thumbUrl} size={rich ? 88 : 48} onPress={rich ? () => openImage({ url: thumbUrl }) : undefined} /> : null}
    </View>
  );
});

/** A file a bot put in its card (`media`) */
function FileMedia({
  file,
  room,
  onOpenLink,
  onOpenImage,
  onLongPress,
}: {
  file: NonNullable<TextEmbed["media"]>;
  room: number;
  onOpenLink: (url: string) => void;
  onOpenImage: (image: { url: string; width?: number; height?: number }) => void;
  onLongPress?: () => void;
}) {
  const { palette } = useTheme();
  const meta = file.metadata as { type?: string; width?: number; height?: number };
  const url = file.createFileURL() ?? file.originalUrl;
  if (meta.type === "Image" && url) {
    return (
      <SizedImage
        uri={url}
        width={meta.width ?? 320}
        height={meta.height ?? 180}
        room={room}
        radius={10}
        onPress={() => onOpenImage({ url: file.originalUrl, width: meta.width, height: meta.height })}
        onLongPress={onLongPress}
      />
    );
  }
  if (meta.type === "Video" && url) {
    return <LazyVideo uri={file.originalUrl} width={meta.width ?? 1280} height={meta.height ?? 720} room={room} onLongPress={onLongPress} />;
  }
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onOpenLink(file.originalUrl)}
      onLongPress={onLongPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BOX_RADIUS, borderWidth: 1, borderColor: palette.borderSubtle, backgroundColor: palette.frame }}
    >
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <Icon name="file" size={24} color={palette.iconNeutral} />
      </View>
      <RText size={14} line={18} weight="medium" color={palette.fg} numberOfLines={1} style={[{ flexShrink: 1 }, autoDirStyle(file.filename ?? file.id)]}>
        {file.filename ?? file.id}
      </RText>
    </Pressable>
  );
}

/**
 * One embed (web Embed): a direct picture or video, a GIF, a site's own
 * player on its own, or the card. GIFs show as the proxied animated picture
 * when there is one (no video player per row in a long chat).
 */
export const EmbedView = memo(function EmbedView({ embed, room, onOpenLink, onOpenImage, onLongPress }: { embed: MessageEmbed; room: number } & EmbedActions) {
  const gif = isGif(embed as unknown as Parameters<typeof isGif>[0]);
  const site = embed.type === "Website" ? (embed as WebsiteEmbed) : undefined;
  const image = embed.type === "Image" ? (embed as ImageEmbed) : gif ? site?.image : undefined;
  const video = embed.type === "Video" ? (embed as VideoEmbed) : gif ? site?.video : undefined;
  const openImage = (target: { url: string; width?: number; height?: number }) =>
    onOpenImage ? onOpenImage(target) : isOpenableUrl(target.url) && onOpenLink(target.url);

  if (image?.proxiedURL) {
    return (
      <SizedImage
        testID="embed-image"
        uri={image.proxiedURL}
        width={image.width}
        height={image.height}
        room={room}
        onPress={() => openImage({ url: image.url, width: image.width, height: image.height })}
        onLongPress={onLongPress}
      />
    );
  }
  if (video?.proxiedURL) {
    return <LazyVideo testID="embed-video" uri={video.proxiedURL} width={video.width} height={video.height} room={room} gif={gif} onLongPress={onLongPress} />;
  }
  if (site && isPlayerEmbed(site.specialContent?.type) && site.embedURL) {
    return <SpecialEmbed embed={site} standalone room={room} onOpenLink={onOpenLink} />;
  }
  if (embed.type === "Website" || embed.type === "Text") {
    return <TextEmbedCard embed={embed as WebsiteEmbed | TextEmbed} room={room} onOpenLink={onOpenLink} onOpenImage={onOpenImage} onLongPress={onLongPress} />;
  }
  return null;
});
