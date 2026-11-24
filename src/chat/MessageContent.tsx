import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useMemo, useState } from "react";
import { Platform, Pressable, Text, type TextStyle, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { fontFamily } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { isolate, paragraphSideStyle, startsAtLayoutStart, type TextDir, textDirection } from "@/ui/kit/bidi";
import { isRTL } from "@/ui/kit/direction";
import { useOpenProfile } from "@/ui/profile/store";

import { middleDrop } from "./inlineRun";
import { EmojiPreviewSheet } from "./rich/EmojiPreviewSheet";
import { type Block, type Inline, isEmojiOnly, parseMessage } from "./markdown";
import { openLink } from "./overlays";
import { directionText, paragraphRuns } from "./paragraphs";
import { emojiUrl } from "./emojiUrl";

/** The CDN address of a custom emoji (its own file, so sheets can use it without a require cycle) */
export { emojiUrl };

function Spoiler({ children, style }: { children: React.ReactNode; style: TextStyle }) {
  const { palette } = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <Text
      onPress={() => setShown(true)}
      style={[style, shown ? { backgroundColor: palette.navSelected } : { backgroundColor: palette.borderStrong, color: "transparent" }]}
    >
      {children}
    </Text>
  );
}

/**
 * A message's text, as the web shows it: 16 px, line-height 1.5 (1.625 in
 * Arabic), mentions as tinted pills, custom emoji as images.
 */
export const MessageContent = memo(function MessageContent({ content, edited, serverId }: { content: string; edited?: string; serverId?: string }) {
  const { i18n } = useLingui();
  const openProfile = useOpenProfile();
  const { palette } = useTheme();
  const client = useClient();
  const blocks = useMemo(() => parseMessage(content), [content]);
  const [preview, setPreview] = useState<string | null>(null);
  const big = useMemo(() => isEmojiOnly(blocks), [blocks]);
  const cdn = client.configuration?.features?.autumn?.url;
  const rtl = i18n.locale === "ar";
  const layout: TextDir = isRTL() ? "rtl" : "ltr";
  const size = big ? 44 : 16;
  const base: TextStyle = {
    fontFamily: fontFamily(i18n.locale),
    fontSize: size,
    lineHeight: big ? 52 : rtl ? 26 : 24,
    color: palette.fg,
  };
  const emojiSize = big ? 44 : 22;
  // an inline picture sits with its bottom on the baseline; the web centres it on the text (vertical-align: middle)
  const emojiDrop = big || Platform.OS === "web" ? 0 : middleDrop(i18n.locale, size, emojiSize);

  const inline = (pieces: Inline[], key: string): React.ReactNode[] =>
    pieces.map((p, i) => {
      const k = `${key}-${i}`;
      switch (p.t) {
        case "text":
          return p.v;
        case "bold":
          return (
            <Text key={k} style={{ fontFamily: fontFamily(i18n.locale, "bold") }}>
              {inline(p.c, k)}
            </Text>
          );
        case "italic":
          return (
            <Text key={k} style={{ fontStyle: "italic" }}>
              {inline(p.c, k)}
            </Text>
          );
        case "underline":
          return (
            <Text key={k} style={{ textDecorationLine: "underline" }}>
              {inline(p.c, k)}
            </Text>
          );
        case "strike":
          return (
            <Text key={k} style={{ textDecorationLine: "line-through" }}>
              {inline(p.c, k)}
            </Text>
          );
        case "spoiler":
          return (
            <Spoiler key={k} style={base}>
              {inline(p.c, k)}
            </Spoiler>
          );
        case "code":
          return (
            <Text key={k} style={{ fontFamily: "monospace", fontSize: 14, backgroundColor: palette.field, color: palette.fg }}>
              {` ${p.v} `}
            </Text>
          );
        case "user": {
          const user = client.users.get(p.id);
          return (
            <Text key={k} accessibilityRole="button" onPress={() => openProfile(p.id, serverId)} style={{ color: palette.accentText, backgroundColor: palette.mentionBg }}>
              {isolate(`@${(serverId ? client.serverMembers.getByKey({ server: serverId, user: p.id })?.nickname : undefined) ?? user?.displayName ?? user?.username ?? "…"}`)}
            </Text>
          );
        }
        case "role": {
          const role = serverId ? client.servers.get(serverId)?.roles.get(p.id) : undefined;
          const colour = role?.colour && !role.colour.includes("gradient") ? role.colour : undefined;
          return (
            <Text key={k} style={{ color: colour ?? palette.accentText, backgroundColor: palette.mentionBg }}>
              {isolate(`@${role?.name ?? "…"}`)}
            </Text>
          );
        }
        case "channel": {
          const channel = client.channels.get(p.id);
          return (
            <Text
              key={k}
              onPress={() => channel && router.push(anyChannelRoute(channel))}
              style={{ color: palette.accentText, backgroundColor: palette.mentionBg }}
            >
              {isolate(`#${channel?.name ?? "…"}`)}
            </Text>
          );
        }
        case "emoji": {
          const url = emojiUrl(cdn, p.id);
          const id = p.id;
          return url ? (
            // a tap shows it large with its name (web: EmojiPreview)
            <Pressable
              key={k}
              testID={`emoji-${id}`}
              accessibilityRole="imagebutton"
              accessibilityLabel={`:${client.emojis.get(id)?.name ?? id}:`}
              onPress={() => setPreview(id)}
              style={{ width: emojiSize, height: emojiSize, transform: emojiDrop ? [{ translateY: emojiDrop }] : undefined }}
            >
              <Image source={{ uri: url }} style={{ width: emojiSize, height: emojiSize }} cachePolicy="memory-disk" contentFit="contain" />
            </Pressable>
          ) : (
            `:${p.id}:`
          );
        }
        case "link":
          return (
            <Text key={k} style={{ color: palette.link }} onPress={() => openLink(p.url, p.label ?? p.url)} accessibilityRole="link">
              {isolate(p.label ?? p.url)}
            </Text>
          );
      }
    });

  /** lines of one run, joined with line breaks */
  const lineNodes = (lines: Inline[][], key: string): React.ReactNode[] =>
    lines.flatMap((line, l) => (l === 0 ? inline(line, `${key}-${l}`) : ["\n", ...inline(line, `${key}-${l}`)]));

  const block = (b: Block, i: number) => {
    if (b.t === "codeblock") {
      return (
        <View key={i} style={{ backgroundColor: palette.field, borderRadius: 8, padding: 8, marginVertical: 4 }}>
          <Text selectable style={[{ fontFamily: "monospace", fontSize: 13, lineHeight: 19, color: palette.fg }, paragraphSideStyle("ltr")]}>
            {b.v}
          </Text>
        </View>
      );
    }
    const last = edited && i === blocks.length - 1 ? <Text style={{ fontSize: 12, color: palette.muted }}>{` ${edited}`}</Text> : null;
    if (b.t === "quote") {
      // web: the blockquote has dir="auto", so its bar sits on the side the quote starts from
      const dir = textDirection(directionText(b.c), layout);
      const atStart = startsAtLayoutStart(dir);
      return (
        <View
          key={i}
          style={[
            { marginVertical: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: palette.field },
            atStart ? { borderStartWidth: 4, borderStartColor: palette.borderStrong } : { borderEndWidth: 4, borderEndColor: palette.borderStrong },
          ]}
        >
          <Text style={[base, { color: palette.fg2 }, paragraphSideStyle(dir)]}>{inline(b.c, `q${i}`)}</Text>
        </View>
      );
    }
    // each line reads in its own direction (an Arabic line on the right in the English app); lines in one direction share a Text
    const runs = paragraphRuns(b.c, layout);
    if (runs.length === 1) {
      return (
        <Text key={i} style={[base, paragraphSideStyle(runs[0].dir)]} selectable={false}>
          {lineNodes(runs[0].lines, `p${i}`)}
          {last}
        </Text>
      );
    }
    return (
      <View key={i}>
        {runs.map((run, r) => (
          <Text key={r} style={[base, paragraphSideStyle(run.dir)]} selectable={false}>
            {lineNodes(run.lines, `p${i}-${r}`)}
            {r === runs.length - 1 ? last : null}
          </Text>
        ))}
      </View>
    );
  };

  return (
    <View style={{ gap: 4 }}>
      {blocks.map(block)}
      {preview ? <EmojiPreviewSheet id={preview} onClose={() => setPreview(null)} /> : null}
    </View>
  );
});
