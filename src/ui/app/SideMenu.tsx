import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";

import { UserAvatar } from "../Avatar";
import { AText } from "../kit/Text";
import { Icon } from "../Icon";
import { ConversationList } from "./ConversationList";
import { Rail } from "./Rail";
import { ServerSheet } from "../server/ServerSheet";
import { ServerPanel } from "./ServerPanel";
import { YouSheet } from "./YouSheet";

/** Tablets and wide windows get the web's desktop arrangement (menu beside the content) */
export { useWide } from "./useWide";

/** The account row at the bottom of the list (web: user panel) */
function AccountRow({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const client = useClient();
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const me = useFields(self, (u) => ({ name: u.displayName ?? u.username, username: u.username }));
  return (
    <Pressable
      testID="tab-you"
      accessibilityRole="button"
      accessibilityLabel={t`You`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 12,
        margin: 8,
        borderRadius: 14,
        backgroundColor: pressed ? palette.navSelected : palette.field,
      })}
    >
      <UserAvatar user={self} size={36} showPresence />
      <View style={{ flex: 1 }}>
        <AText autoDir size={14} line={20} weight="semibold" color={palette.fg} numberOfLines={1}>
          {me?.name ?? ""}
        </AText>
        <AText autoDir size={12} line={16} color={palette.muted} numberOfLines={1}>
          {me?.username ?? ""}
        </AText>
      </View>
      <Icon name="gear-six" size={20} color={palette.iconMuted} />
    </Pressable>
  );
}

/**
 * The left side on a tablet: the rail (with Discover and Notifications
 * under Home), the list panel and the account row. The page opens beside it.
 */
export function SideMenu({ serverId }: { serverId?: string }) {
  const { palette } = useTheme();
  const { t } = useLingui();
  const [you, setYou] = useState(false);
  const [menu, setMenu] = useState(false);
  const extra = (icon: "compass" | "at", label: string, path: "/discover" | "/notifications", testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(path)}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "center",
        backgroundColor: pressed ? palette.navSelected : palette.field,
      })}
    >
      <Icon name={icon} size={24} color={palette.iconNeutral} />
    </Pressable>
  );
  return (
    <View style={{ width: 72 + 300, flexDirection: "row", borderEndWidth: 1, borderEndColor: palette.borderSubtle }}>
      <View style={{ width: 72 }}>
        <View style={{ gap: 8, paddingTop: 12 }}>
          {extra("compass", t`Discover`, "/discover", "tab-discover")}
          {extra("at", t`Mentions`, "/notifications", "tab-mentions")}
        </View>
        <View style={{ flex: 1 }}>
          <Rail selected={serverId} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {serverId ? (
            <ServerPanel
              serverId={serverId}
              onServerMenu={() => setMenu(true)}
              onInvite={() => router.push({ pathname: "/invite/[serverId]", params: { serverId } })}
            />
          ) : (
            <ConversationList onAddFriend={() => router.push("/friends?add=1")} onCreateGroup={() => router.push("/new-group")} />
          )}
        </View>
        <AccountRow onPress={() => setYou(true)} />
      </View>
      {serverId ? <ServerSheet serverId={serverId} visible={menu} onClose={() => setMenu(false)} /> : null}
      <YouSheet visible={you} onClose={() => setYou(false)} />
    </View>
  );
}
