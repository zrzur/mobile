import { useLingui } from "@lingui/react/macro";
import type { Server, ServerBan } from "@zrzur/sdk/solid";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { foldSearch } from "@/ui/app/ConversationList";
import { RowGroup, SearchField } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/kit";

import { ConfirmDialog, SettingsPage, SettingsSection } from "../parts";
import { EmptyCard, LoadError, Loading } from "./controls";

/** Bans (web: settings › Bans) */
export function BansPage({ server }: { server: Server }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [query, setQuery] = useState("");
  const [pardon, setPardon] = useState<ServerBan | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    server
      .fetchBans()
      .then((list) => {
        if (!live) return;
        setBans(list);
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [server, reload]);

  const shown = useMemo(() => {
    const q = foldSearch(query.trim());
    if (!q) return bans;
    return bans.filter((b) => foldSearch(`${b.user?.username ?? ""} ${b.reason ?? ""} ${b.id.user}`).includes(q));
  }, [bans, query]);

  const username = pardon?.user?.username ?? pardon?.id.user ?? "";

  return (
    <SettingsPage title={t`Bans`} description={t`People who can't come back.`} testID="server-bans">
      <SettingsSection title={t`Banned members`} description={t`Banned people can't rejoin until they're unbanned, even with an invite.`}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", height: 44 }}>
            <SearchField value={query} onChange={setQuery} placeholder={t`Search by name or reason`} testID="ban-search" />
          </View>
          {state === "loading" ? (
            <Loading text={t`Loading bans…`} />
          ) : state === "error" ? (
            <LoadError
              text={t`Bans couldn't be loaded`}
              onRetry={() => {
                setState("loading");
                setReload((n) => n + 1);
              }}
            />
          ) : bans.length === 0 ? (
            <EmptyCard icon="gavel" title={t`No one is banned`} text={t`People you ban from the member list show up here.`} />
          ) : shown.length === 0 ? (
            <EmptyCard icon="magnifying-glass" title={t`No ban matches that search`} />
          ) : (
            <RowGroup>
              {shown.map((b, i) => (
                <View key={b.id.user} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingStart: 16, paddingEnd: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.divider }}>
                  <Avatar url={b.user?.avatar?.createFileURL?.()} name={b.user?.username} size={32} />
                  <View style={{ flex: 1 }}>
                    <AText autoDir size={16} line={22} weight="medium" color={palette.fg} numberOfLines={1}>
                      {b.user?.username ?? b.id.user}
                    </AText>
                    <AText autoDir size={13} line={18} color={palette.muted} numberOfLines={2}>
                      {b.reason || t`No reason given`}
                    </AText>
                  </View>
                  <Button testID="unban" label={t`Unban`} variant="tonal" size="sm" onPress={() => setPardon(b)} />
                </View>
              ))}
            </RowGroup>
          )}
        </View>
      </SettingsSection>
      <ConfirmDialog
        visible={!!pardon}
        danger={false}
        title={t`Lift this ban?`}
        text={t`${username} can join the server again.`}
        confirm={t`Unban`}
        onClose={() => setPardon(null)}
        onConfirm={async () => {
          if (!pardon) return;
          await pardon.pardon();
          setBans((list) => list.filter((b) => b !== pardon));
        }}
      />
    </SettingsPage>
  );
}
