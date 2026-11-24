import { useLingui } from "@lingui/react/macro";
import type { Client, Message } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { HeaderButton } from "@/ui/app/parts";
import { channelRoute } from "@/ui/forum/channelRoute";
import { AText } from "@/ui/kit/Text";

/** Close a list page (it opens as a task over the app) */
export const closePage = () => (router.canGoBack() ? router.back() : router.replace("/home"));

/** Open a message from a list: its channel, scrolled to it */
export function openMessage(message: Message) {
  router.push(channelRoute({ id: message.channelId, isThread: message.channel?.isThread }, message.id));
}

/**
 * The frame of the inbox lists on a phone (web: NotificationsPhone head,
 * the lists' TitleRow): the title and the close X, then the page.
 */
export function InboxPage({ title, testID, children }: { title: string; testID: string; children: ReactNode }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  return (
    <SafeAreaView testID={testID} style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 12, paddingEnd: 8, paddingStart: 16 }}>
        <AText size={22} line={28} weight="bold" color={palette.header} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AText>
        <HeaderButton icon="x" label={t`Close`} size={22} onPress={closePage} testID={`${testID}-close`} />
      </View>
      {children}
    </SafeAreaView>
  );
}

/** Whether the server offers Feather here (web: billingAvailable) */
export function useBillingAvailable(client: Client): boolean {
  const [billing, setBilling] = useState(false);
  useEffect(() => {
    let live = true;
    (client.api.get("/billing/plans" as never) as Promise<{ available?: boolean }>)
      .then((plans) => live && setBilling(!!plans?.available))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client]);
  return billing;
}
