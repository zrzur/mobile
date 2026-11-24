/**
 * Live counters at the top of a server's channel list, chosen by the
 * server's managers in Settings (web: navigation/channels/ServerStats).
 * Read-only rows with a lock: nobody opens them, they only show a number
 * that stays current. Same size as a channel row.
 */
import { useLingui } from "@lingui/react/macro";
import type { Server } from "@zrzur/sdk/solid";
import { View } from "react-native";

import { useFields, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "@/ui/Icon";
import { AText } from "@/ui/kit/Text";

type Stat = Server["stats"][number];

const ICONS: Record<string, IconName> = { Members: "users", Channels: "hash", Roles: "shield", Wings: "lightning" };

/** The number behind one counter (web: ServerStats value) */
export function statValue(stat: string, s: { members: number; channels: number; roles: number; wings: number }): number {
  switch (stat) {
    case "Members":
      return s.members;
    case "Channels":
      return s.channels;
    case "Roles":
      return s.roles;
    case "Wings":
      return s.wings;
    default:
      return 0;
  }
}

/** Compact numbers as the web writes them (3.08K), Latin digits */
export const compactNumber = (value: number, locale: string) => new Intl.NumberFormat(locale || "en", { notation: "compact", maximumFractionDigits: 2, numberingSystem: "latn" } as Intl.NumberFormatOptions).format(value);

export function ServerStats({ serverId }: { serverId: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const data = useFields(server, (s) => ({
    stats: [...(s.stats ?? [])] as Stat[],
    members: s.approximateMemberCount ?? 0,
    channels: s.channelIds.size,
    roles: s.roles.size,
    wings: s.supercharge?.count ?? 0,
  }));
  if (!data?.stats.length) return null;
  const label = (stat: Stat) => {
    switch (stat) {
      case "Members":
        return t`Members: ${compactNumber(statValue(stat, data), i18n.locale)}`;
      case "Channels":
        return t`Channels: ${compactNumber(statValue(stat, data), i18n.locale)}`;
      case "Roles":
        return t`Roles: ${compactNumber(statValue(stat, data), i18n.locale)}`;
      default:
        return t`Wings: ${compactNumber(statValue(stat, data), i18n.locale)}`;
    }
  };
  return (
    <View testID="server-stats" accessibilityLabel={t`Server stats`} style={{ gap: 1, paddingBottom: 6 }}>
      <AText size={12} line={16} weight="semibold" color={palette.muted} style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
        {t`Server stats`}
      </AText>
      {data.stats.map((stat) => (
        <View
          key={stat}
          accessible
          accessibilityLabel={label(stat)}
          accessibilityHint={t`Updates by itself. Nobody can open it.`}
          style={{ minHeight: 44, marginHorizontal: 8, paddingStart: 12, paddingEnd: 8, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View>
            <Icon name={ICONS[stat] ?? "hash"} size={20} color={palette.iconMuted} />
            <View style={{ position: "absolute", bottom: -3, end: -4, width: 13, height: 13, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: palette.frame }}>
              <Icon name="lock-simple" size={10} color={palette.muted} />
            </View>
          </View>
          <AText size={15} line={20} weight="medium" color={palette.fg2} numberOfLines={1} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
            {label(stat)}
          </AText>
        </View>
      ))}
    </View>
  );
}
