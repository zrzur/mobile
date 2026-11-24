import { useLingui } from "@lingui/react/macro";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId, useServer } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { SearchField } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { ListCategory, ListHead, ListRow, ListScreen, ScreenLoading } from "@/ui/settings/server/controls";
import { type Section, serverSections } from "@/ui/settings/serverSections";

/** Server settings: the section list (web: ServerSettings sidebar on a phone) */
export default function ServerSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const server = useServer(id);
  const selfId = useSelfId();
  const head = useFields(server, (s) => ({ name: s.name, icon: s.iconURL }));
  const [query, setQuery] = useState("");
  // permissions can change while the page is open
  const permissionKey = useSolid(useCallback(() => (server ? `${server.permission}|${server.ownerId}` : ""), [server]));
  const sections = useMemo(
    () => (server ? serverSections(i18n, server, selfId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server, selfId, i18n.locale, permissionKey],
  );
  const shown = useMemo(() => {
    const q = foldSearch(query.trim());
    return q ? sections.filter((s) => foldSearch(s.title).includes(q)) : sections;
  }, [sections, query]);
  const groups = useMemo(() => {
    const map = new Map<string, Section[]>();
    for (const s of shown) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()];
  }, [shown]);

  const ready = useSolid(useCallback(() => client.ready(), [client]));
  useEffect(() => {
    // the server was deleted or left while settings were open
    if (ready && !server) router.back();
  }, [ready, server]);

  // still connecting: a spinner, never "Nothing found" for an empty list
  if (!server || !head) return <ScreenLoading />;

  return (
    <ListScreen testID="server-settings-list">
      <ListHead
        backTestID="settings-close"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        leading={<Avatar url={head.icon} name={head.name} size={36} square />}
        name={head.name}
        sub={t`Server settings`}
      />
      <View style={{ paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", minHeight: 44 }}>
          <SearchField value={query} onChange={setQuery} placeholder={t`Search settings`} testID="search-settings" />
        </View>
      </View>
      {groups.length === 0 ? (
        <AText size={13} line={20} color={palette.muted} accessibilityRole="text" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 12 }}>
          {t`Nothing found`}
        </AText>
      ) : null}
      {groups.map(([category, list]) => (
        <ListCategory key={category} title={category}>
          {list.map((s, i) => (
            <ListRow
              key={s.id}
              first={i === 0}
              icon={s.icon}
              title={s.title}
              testID={`server-section-${s.id}`}
              onPress={() => router.push({ pathname: "/server-section/[id]/[section]", params: { id, section: s.id } })}
            />
          ))}
        </ListCategory>
      ))}
    </ListScreen>
  );
}
