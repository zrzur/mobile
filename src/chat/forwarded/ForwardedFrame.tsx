import { Trans, useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { anyChannelRoute } from "@/ui/forum/channelRoute";
import { Icon } from "@/ui/Icon";
import { AText } from "@/ui/kit/Text";

import { MessageContent } from "../MessageContent";
import { clock, longDate } from "../time";
import { isolated, type KnownChannel, type Origin, originLink } from "./origin";

/**
 * A forwarded copy (web: channels/text/ForwardedFrame.tsx): the forwarder's
 * note on top, then the copied text, files and embeds in a frame marked
 * "Forwarded" (4 px start border, 12 px inside), and a last line that goes
 * back to the original when this reader can open its channel. Messages that
 * were not forwarded pass through unchanged.
 */
export function ForwardedFrame({ origin, serverId, children }: { origin?: Origin; serverId?: string; children: ReactNode }) {
  if (!origin) return <>{children}</>;
  return (
    <Frame origin={origin} serverId={serverId}>
      {children}
    </Frame>
  );
}

function Frame({ origin, serverId, children }: { origin: Origin; serverId?: string; children: ReactNode }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const link = originLink(origin, (id) => client.channels.get(id) as unknown as KnownChannel | undefined);
  const date = origin.sent_at ? new Date(origin.sent_at) : undefined;
  // dayjs "LLL": the long date and the time
  const when = date && !Number.isNaN(date.getTime()) ? `${longDate(date, i18n.locale)} ${clock(date, i18n.locale)}` : "";
  return (
    <View>
      {origin.note ? (
        <View style={{ marginBottom: 4 }} testID="forwarded-note">
          <MessageContent content={origin.note} serverId={serverId} />
        </View>
      ) : null}
      <View
        testID="forwarded-message"
        style={{ gap: 4, minWidth: 0, paddingVertical: 4, paddingStart: 12, borderStartWidth: 4, borderStartColor: palette.borderStrong }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="arrow-bend-up-right" size={16} color={palette.iconMuted} />
          <AText size={12} line={16} weight="semibold" color={palette.muted}>
            <Trans>Forwarded</Trans>
          </AText>
        </View>
        {children}
        {link ? (
          <Pressable
            testID="forwarded-origin"
            accessibilityRole="link"
            onPress={() => router.push(anyChannelRoute(link.channel, link.message))}
            hitSlop={{ top: 12, bottom: 12 }}
            style={({ pressed }) => ({ alignSelf: "flex-start", maxWidth: "100%", minHeight: 20, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <AText size={12} line={16} color={palette.link} numberOfLines={1}>
              {when ? t`From ${isolated(link.place)} · ${isolated(when)}` : isolated(link.place)}
            </AText>
          </Pressable>
        ) : when ? (
          <AText size={12} line={16} color={palette.muted} numberOfLines={1}>
            {t`Sent ${isolated(when)}`}
          </AText>
        ) : null}
      </View>
    </View>
  );
}
