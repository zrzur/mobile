import { Stack, useGlobalSearchParams, useSegments } from "expo-router";
import { useCallback, useEffect } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { ChatOverlays } from "@/chat/ChatOverlays";
import { AppNotices } from "@/ui/notices/AppNotices";
import { ClientProvider, useClient } from "@/client/ClientProvider";
import { NotificationsController } from "@/notifications/NotificationsController";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { SideMenu } from "@/ui/app/SideMenu";
import { SCREEN_KINDS, screenMotion } from "@/ui/app/transitions";
import { useReduceMotion } from "@/ui/kit/motion";
import { useWide } from "@/ui/app/useWide";
import { openProfile, ProfileSheetHost } from "@/ui/profile/ProfileSheet";
import { setProfileOpener } from "@/ui/server/home";
import { CallOverlay } from "@/voice/ui/CallOverlay";

/** The server the open page belongs to (for the side menu on tablets) */
function useCurrentServer(): string | undefined {
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string; serverId?: string; server?: string }>();
  const client = useClient();
  const page = segments[1];
  const id = typeof params.id === "string" ? params.id : undefined;
  const serverParam = typeof params.serverId === "string" ? params.serverId : typeof params.server === "string" ? params.server : undefined;
  return useSolid(
    useCallback(() => {
      // pages whose id is the server
      if (page === "server" || page === "lobby" || page === "server-info" || page === "server-settings" || page === "server-section") return id;
      // pages that name the server in another parameter
      if (page === "members" || page === "events" || page === "invite" || page === "event") return serverParam;
      // pages whose id is a channel (threads and forum posts belong to the parent's server)
      if (
        (page === "channel" || page === "channel-details" || page === "channel-pins" || page === "channel-settings" || page === "thread" || page === "forum" || page === "search" || page === "voice") &&
        id
      )
        return client.channels.get(id)?.serverId || undefined;
      return undefined;
    }, [page, id, serverParam, client]),
  );
}

function Pages() {
  const { palette } = useTheme();
  const wide = useWide();
  const serverId = useCurrentServer();
  const reduce = useReduceMotion();
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.frame },
        ...screenMotion("push", { reduce, wide }),
      }}
      // a modal card is its own native window on iOS: give it its own safe
      // area, so its header sits under the card's top, not the status bar's
      screenLayout={({ children, options }) =>
        Platform.OS === "ios" && options.presentation === "modal" ? (
          <SafeAreaProvider style={{ backgroundColor: palette.frame }}>{children}</SafeAreaProvider>
        ) : (
          children
        )
      }
    >
      {Object.entries(SCREEN_KINDS).map(([name, kind]) => (
        <Stack.Screen key={name} name={name} options={screenMotion(kind, { reduce, wide })} />
      ))}
    </Stack>
  );
  if (!wide) return stack;
  return (
    <SafeAreaView style={{ flex: 1, flexDirection: "row", backgroundColor: palette.frame }} edges={["top", "bottom", "left", "right"]}>
      <SideMenu serverId={serverId} />
      <View style={{ flex: 1 }}>{stack}</View>
    </SafeAreaView>
  );
}

/** Signed in: one live SDK client for every screen below */
export default function AppLayout() {
  const { state } = useAuth();
  // the lobby and the events open profiles through the profile sheet
  useEffect(() => {
    setProfileOpener(openProfile);
    return () => setProfileOpener(undefined);
  }, []);
  // nothing connects before the account's step is known: a new account has
  // no username or age yet, and /users/@me and /sync/settings refuse it
  if (state.status !== "signedIn" || state.account === "checking") return null;
  if (typeof state.account === "object" && state.account.step !== "ready") return null;
  return (
    <ClientProvider session={state.session}>
      <Pages />
      <NotificationsController />
      <ProfileSheetHost />
      <CallOverlay />
      {/* the link warning and the attachment viewer, for every screen */}
      <ChatOverlays />
      {/* team notices, policy changes, due reminders, Save data offer, session watch */}
      <AppNotices />
    </ClientProvider>
  );
}
