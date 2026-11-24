import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useUpdates } from "expo-updates";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Keyboard, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useConversationIds, useServerIds } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { applyUpdate, watchForUpdates } from "@/ui/home/updateCheck";
import { callStore } from "@/voice/call";

import { UserAvatar } from "../Avatar";
import { Icon, type IconName } from "../Icon";
import { ChromeScale } from "../kit/fontScale";
import { AText } from "../kit/Text";
import { PressScale } from "../kit/Press";
import { scrollTabToTop } from "../kit/scrollToTop";
import { lastServer } from "./lastServer";
import { useWide } from "./useWide";
import { CountBadge } from "./parts";

export type Tab = "servers" | "messages" | "discover" | "mentions";

const SHADOW = {
  shadowOpacity: 0.45,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 12 },
  elevation: 12,
} as const;

function TabButton({
  icon,
  label,
  active,
  badge,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  badge?: number;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <PressScale
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      haptic="selection"
      scale={0.94}
      onPress={onPress}
      style={{
        minWidth: 44,
        minHeight: 44,
        borderRadius: 22,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingStart: active ? 12 : 8,
        paddingEnd: active ? 16 : 8,
        backgroundColor: active ? palette.pill : "transparent",
        flexShrink: active ? 1 : 0,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={24} color={active ? palette.accent : palette.fg2} />
        {badge ? (
          <View style={{ position: "absolute", top: -8, start: "62%" }}>
            <CountBadge count={badge} ring />
          </View>
        ) : null}
      </View>
      {active ? (
        <AText size={13} line={18} weight="semibold" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </AText>
      ) : null}
    </PressScale>
  );
}

/**
 * Phones: a new release is ready (web: PhoneUpdateRow). One quiet row on
 * top of the tab bar; the app restarts only when "Update" is tapped. Left
 * out during a call.
 */
function UpdateRow() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { isUpdatePending } = useUpdates();
  const inCall = useSyncExternalStore(callStore.subscribe, () => callStore.get().status !== "idle");
  useEffect(() => watchForUpdates(), []);
  if (!isUpdatePending || inCall) return null;
  return (
    <View
      testID="phone-update-row"
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        start: 0,
        end: 0,
        // on top of the floating tab bar (56 px, 8 px above the edge)
        bottom: 72,
        minHeight: 48,
        paddingStart: 16,
        paddingEnd: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: palette.field,
        borderTopWidth: 1,
        borderTopColor: palette.borderSubtle,
      }}
    >
      <Icon name="arrow-clockwise" size={20} color={palette.iconNeutral} />
      <AText size={14} line={20} color={palette.fg} style={{ flex: 1 }}>
        {t`A new version of Zrzur is ready`}
      </AText>
      <PressScale
        testID="phone-update-apply"
        accessibilityRole="button"
        haptic="light"
        onPress={applyUpdate}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderRadius: 6, justifyContent: "center", backgroundColor: pressed ? palette.navSelected : "transparent" })}
      >
        <AText size={14} line={20} weight="semibold" color={palette.accentText}>
          {t`Update`}
        </AText>
      </PressScale>
    </View>
  );
}

/** Conversations with something new (Messages badge) */
function useMessagesBadge() {
  const client = useClient();
  const ids = useConversationIds();
  return useSolid(useCallback(() => ids.filter((id) => client.channels.get(id)?.unread).length, [client, ids]));
}

/** Mentions in every channel plus incoming friend requests (Mentions badge) */
function useMentionsBadge() {
  const client = useClient();
  return useSolid(
    useCallback(() => {
      let count = 0;
      for (const channel of client.channels.values()) count += channel.mentions?.size ?? 0;
      for (const user of client.users.values()) if (user.relationship === "Incoming") count++;
      return count;
    }, [client]),
  );
}

/**
 * The floating tab bar (web: PhoneTabs): the round "You" picture, then a
 * capsule with Servers, Messages, Discover and Mentions. The open tab is a
 * pill with its name. Steps aside while the keyboard is open.
 */
export function PhoneTabs({ current, onYou }: { current: Tab; onYou: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const serverIds = useServerIds();
  const messages = useMessagesBadge();
  const mentions = useMentionsBadge();
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const wide = useWide();
  if (keyboard || wide) return null;

  // tabs replace each other (no history, a cross-fade: see transitions.ts);
  // a tap on the open tab scrolls its list to the top
  const go = (tab: Tab, open: () => void) => () => {
    if (tab === current) scrollTabToTop(tab);
    else open();
  };
  const openServers = () => {
    const id = lastServer.get() ?? serverIds[0];
    if (id) router.replace({ pathname: "/server/[id]", params: { id } });
    else router.push("/add-server");
  };

  return (
    <ChromeScale>
      <UpdateRow />
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t`Main navigation`}
        style={{
          position: "absolute",
          start: 8,
          end: 12,
          bottom: 8,
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <PressScale
          testID="tab-you"
          accessibilityRole="button"
          accessibilityLabel={t`You`}
          onPress={onYou}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: palette.barFill,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: palette.shadow,
            ...SHADOW,
          }}
        >
          <UserAvatar user={self} size={44} />
        </PressScale>
        <View
          style={{
            flex: 1,
            minHeight: 56,
            paddingHorizontal: 4,
            borderRadius: 28,
            backgroundColor: palette.barFill,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: palette.shadow,
            ...SHADOW,
          }}
        >
          <TabButton testID="tab-servers" icon="squares-four" label={t`Servers`} active={current === "servers"} onPress={go("servers", openServers)} />
          <TabButton
            testID="tab-messages"
            icon="chat-circle"
            label={t`Messages`}
            active={current === "messages"}
            badge={messages}
            onPress={go("messages", () => router.replace("/home"))}
          />
          <TabButton testID="tab-discover" icon="compass" label={t`Discover`} active={current === "discover"} onPress={go("discover", () => router.replace("/discover"))} />
          <TabButton
            testID="tab-mentions"
            icon="at"
            label={t`Mentions`}
            active={current === "mentions"}
            badge={mentions}
            onPress={go("mentions", () => router.push("/notifications"))}
          />
        </View>
      </View>
    </ChromeScale>
  );
}
