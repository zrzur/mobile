import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { PressableRow } from "@/ui/kit/Press";
import { AText } from "@/ui/kit/Text";

import { greetingKind } from "./greeting";

/** The words at the top, by the time of day (web: useGreeting; the variable name is part of the msgid) */
export function useGreeting(name: string) {
  const { t } = useLingui();
  switch (greetingKind(new Date().getHours())) {
    case "late":
      return t`Up late, ${name}?`;
    case "morning":
      return t`Good morning, ${name}`;
    case "afternoon":
      return t`Good afternoon, ${name}`;
    default:
      return t`Good evening, ${name}`;
  }
}

function Way({ icon, title, line, onPress, testID }: { icon: IconName; title: string; line: string; onPress: () => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <PressableRow
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      highlight={palette.navSelected}
      onPress={onPress}
      style={{ minHeight: 60, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: palette.navSelected }}>
        <Icon name={icon} size={20} color={palette.iconNeutral} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText size={15} line={20} weight="semibold" color={palette.fg}>
          {title}
        </AText>
        <AText size={13} line={18} color={palette.muted}>
          {line}
        </AText>
      </View>
      <Icon name="caret-right" size={16} color={palette.muted} />
    </PressableRow>
  );
}

/** A new account: in no server yet (web Home `firstRun`) */
export function useFirstRun(): boolean {
  const client = useClient();
  return useSolid(useCallback(() => client.ready() && client.servers.size() === 0, [client]));
}

/**
 * The start for someone who is in no server yet (web: Home first run):
 * the greeting with their picture, "Your people are one step away.", the
 * "Create your server" button and three ways in: join with an invite, find
 * a community, add a friend. Sits on top of the Messages list until the
 * first server is joined.
 */
export function FirstScreen({ onAddFriend }: { onAddFriend: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const me = useFields(self, (u) => ({ name: u.displayName ?? u.username, url: u.avatarURL, presence: u.presence }));
  const greeting = useGreeting(me?.name ?? "");

  return (
    <View testID="home-first-run" style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
        <Avatar url={me?.url} name={me?.name} size={64} presence={me?.presence as never} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText autoDir size={22} line={28} weight="bold" color={palette.header} accessibilityRole="header">
            {greeting}
          </AText>
          <AText size={14} line={20} color={palette.muted} style={{ marginTop: 4 }}>
            {t`Your people are one step away.`}
          </AText>
        </View>
      </View>
      <Button testID="home-create-server" icon="plus" label={t`Create your server`} onPress={() => router.push("/add-server")} fill />
      <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>
        <Way testID="home-join-invite" icon="link" title={t`Join with an invite`} line={t`A friend sent you a link? Paste it here.`} onPress={() => router.push("/add-server")} />
        <View style={{ height: 1, backgroundColor: palette.divider }} />
        <Way testID="home-find-community" icon="compass" title={t`Find a community`} line={t`Browse servers by what you enjoy.`} onPress={() => router.replace("/discover")} />
        <View style={{ height: 1, backgroundColor: palette.divider }} />
        <Way testID="home-add-friend" icon="user-plus" title={t`Add a friend`} line={t`Send a request by username.`} onPress={onAddFriend} />
      </View>
    </View>
  );
}
