import { useLingui } from "@lingui/react/macro";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthProvider";
import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { ListCategory, ListRow } from "@/ui/settings/server/controls";
import { type UserSectionId, userSectionGroups, userSections } from "@/ui/settings/userSections";
import { openExternal } from "@/ui/kit/openLink";
import { PressableRow } from "@/ui/kit/Press";

const WHATS_NEW_URL = "https://zrzur.com/blog";
const SOURCE_CODE_URL = "https://github.com/zrzur";

/** User settings: the page list (web: UserSettings on a phone, list first) */
export default function Settings() {
  const { t, i18n } = useLingui();
  const { palette, toggle } = useTheme();
  const { signOut } = useAuth();
  const client = useClient();
  const version = Constants.expoConfig?.version ?? "";
  const commit = String((Constants.expoConfig?.extra as { commit?: string } | undefined)?.commit ?? "").slice(0, 7);

  const self = useSolid(useCallback(() => (client.ready() ? client.user : undefined), [client]));
  const me = useFields(self, (u) => ({ name: u.displayName ?? u.username, url: u.avatarURL, presence: u.presence }));

  // Feather shows only where the server offers billing (web: billingAvailable)
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

  const config = client.configuration;
  const video = !!config?.features?.limits?.default?.video;
  const groups = useMemo(() => userSectionGroups(userSections(i18n, { billing, video })), [i18n, billing, video]);
  const legal = config?.features?.legal_links;
  const serverCommit = /^[0-9a-f]{7,64}$/i.test(config?.commit ?? "") ? (config?.commit as string) : "";

  const open = (section: UserSectionId) => router.push({ pathname: "/user-settings/[section]", params: { section } });
  const link = (url: string) => void openExternal(url);


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView testID="user-settings-list" contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 48, gap: 16 }}>
        {/* web BackCard + AccountCard: flat rows 4 apart, no box around the account */}
        <View style={{ gap: 4 }}>
          {/* the kit row (pressed tint, haptics, RTL arrow) in the web BackCard's place */}
          <PressableRow
            testID="header-back"
            accessibilityRole="button"
            highlight={palette.navHover}
            delay={0}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
            style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Icon name="arrow-left" size={20} color={palette.fg2} />
            <AText size={15} line={20} weight="medium" color={palette.fg2}>
              {t`Back`}
            </AText>
          </PressableRow>

          <PressableRow
            testID="user-section-account"
            accessibilityRole="button"
            highlight={palette.navHover}
            delay={0}
            onPress={() => open("account")}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, padding: 8, borderRadius: 10 }}
          >
            <View style={{ padding: 2 }}>
              <Avatar url={me?.url} name={me?.name} size={36} presence={me?.presence as never} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AText autoDir size={14} line={18} weight="semibold" color={palette.fg} numberOfLines={1}>
                {me?.name ?? ""}
              </AText>
              <AText size={12} line={16} weight="medium" color={palette.muted} numberOfLines={1}>
                {t`My account`}
              </AText>
            </View>
          </PressableRow>
        </View>

        {groups.map(([title, list]) => (
          <ListCategory key={title} title={title}>
            {list.map((s, i) => (
              <ListRow key={s.id} first={i === 0} icon={s.icon} title={s.title} testID={`user-section-${s.id}`} onPress={() => open(s.id)} />
            ))}
            {list.some((s) => s.id === "appearance") ? (
              <ListRow icon={palette.dark ? "moon" : "sun"} title={t`Theme`} value={palette.dark ? t`Dark` : t`Light`} onPress={toggle} testID="settings-theme" />
            ) : null}
          </ListCategory>
        ))}

        {/* web: the links and Log out are one card */}
        <ListCategory>
          <ListRow first icon="megaphone" title={t`What's New`} external onPress={() => link(WHATS_NEW_URL)} testID="user-link-whats-new" />
          <ListRow icon="cpu" title={t`Source code`} external onPress={() => link(SOURCE_CODE_URL)} testID="user-link-source" />
          {/* Third-party notices: no hosted notices file for the phone app yet, so the row is left out */}
          <ListRow icon="sign-out" title={t`Log out`} danger onPress={() => void signOut()} testID="settings-logout" />
        </ListCategory>

        <View style={{ paddingHorizontal: 8 }}>
          <View style={{ minHeight: 44, justifyContent: "center" }}>
            <AText size={13} line={18} color={palette.fg2} selectable>
              <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                {`${t`Zrzur`} ${t`Version:`}`}
              </AText>{" "}
              <AText size={13} line={18} color={palette.fg2} style={{ writingDirection: "ltr" }} testID="app-version">
                {commit ? `${version} (${commit})` : version}
              </AText>
            </AText>
          </View>
          {config?.zrzur ? (
            <Pressable
              accessibilityRole="link"
              testID="server-source-link"
              onPress={() => link(serverCommit ? `https://github.com/zrzur/backend/tree/${serverCommit}` : "https://github.com/zrzur/backend")}
              style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
            >
              <AText size={13} line={18} color={palette.fg2}>
                <AText size={13} line={18} weight="semibold" color={palette.fg2}>
                  {`${t`Server`} ${t`Version:`}`}
                </AText>{" "}
                <AText size={13} line={18} color={palette.fg2} style={{ writingDirection: "ltr" }}>
                  {serverCommit ? `${config.zrzur} (${serverCommit.slice(0, 7)})` : config.zrzur}
                </AText>
              </AText>
            </Pressable>
          ) : null}
          {legal ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {legal.terms_of_service ? (
                <Pressable accessibilityRole="link" onPress={() => link(legal.terms_of_service)} style={{ minHeight: 44, justifyContent: "center" }}>
                  <AText size={13} line={18} color={palette.muted}>
                    {t`Terms`}
                  </AText>
                </Pressable>
              ) : null}
              {legal.privacy_policy ? (
                <Pressable accessibilityRole="link" onPress={() => link(legal.privacy_policy)} style={{ minHeight: 44, justifyContent: "center" }}>
                  <AText size={13} line={18} color={palette.muted}>
                    {t`Privacy`}
                  </AText>
                </Pressable>
              ) : null}
              {legal.guidelines ? (
                <Pressable accessibilityRole="link" onPress={() => link(legal.guidelines)} style={{ minHeight: 44, justifyContent: "center" }}>
                  <AText size={13} line={18} color={palette.muted}>
                    {t`Guidelines`}
                  </AText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
