import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { useCallback, useEffect } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";

import { emojiUrl } from "../emojiUrl";
import { RText, RichSheet, SheetButton } from "./parts";

/**
 * A custom emoji, large (web: modals/EmojiPreview): a tap on one in a
 * message shows it at 128 px with its :name: and the server it belongs to.
 */
export function EmojiPreviewSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const emoji = useSolid(useCallback(() => client.emojis.get(id), [client, id]));
  const info = useFields(emoji, (e) => {
    const parent = e.parent as { type?: string; id?: string } | undefined;
    const server = parent?.type === "Server" && parent.id ? client.servers.get(parent.id) : undefined;
    return { name: e.name, server: server?.name };
  });
  // an emoji from a server this person is not in is fetched once
  useEffect(() => {
    if (!emoji) void client.emojis.fetch(id).catch(() => undefined);
  }, [client, emoji, id]);
  const url = emojiUrl(client.configuration?.features?.autumn?.url, id);
  return (
    <RichSheet visible onClose={onClose} testID="emoji-preview">
      <View style={{ paddingHorizontal: 16, gap: 12, alignItems: "center" }}>
        {url ? <Image source={{ uri: url }} style={{ width: 128, height: 128, borderRadius: 14 }} contentFit="contain" cachePolicy="memory-disk" accessibilityIgnoresInvertColors /> : null}
        <View style={{ alignItems: "center", gap: 4 }}>
          <RText size={18} line={26} weight="bold" color={palette.header} accessibilityRole="header">
            {`:${info?.name ?? "…"}:`}
          </RText>
          {info?.server ? (
            <RText size={14} line={20} color={palette.fg2} numberOfLines={1}>
              {info.server}
            </RText>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignSelf: "stretch" }}>
          <SheetButton label={t`Close`} onPress={onClose} />
        </View>
      </View>
    </RichSheet>
  );
}
