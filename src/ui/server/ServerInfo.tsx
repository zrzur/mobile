import { useLingui } from "@lingui/react/macro";
import { Image } from "expo-image";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MessageContent } from "@/chat/MessageContent";
import { useFields, useSelfId, useServer } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { RowGroup, ScreenHeader } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { Avatar } from "@/ui/Avatar";
import { Icon, type IconName } from "@/ui/Icon";
import { ReportSheet } from "@/ui/profile/ReportFlow";
import { isLobbyColour } from "@/ui/settings/lobby";
import { canOpenServerSettings } from "@/ui/settings/serverSections";

import { IdentitySheet } from "./IdentitySheet";
import { copyToClipboard } from "@/ui/kit/share";

function Row({ icon, title, first, children }: { icon: IconName; title: string; first?: boolean; children?: ReactNode }) {
  const { palette } = useTheme();
  return (
    // the kit GroupRow's metrics: 52 px, 12/16, a 20 px icon in a 24 px slot
    <View style={{ minHeight: 52, paddingVertical: 4, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: palette.divider }}>
      <View style={{ width: 24, alignItems: "center" }}>
        <Icon name={icon} size={20} color={palette.iconNeutral} />
      </View>
      <AText size={16} line={22} weight="medium" color={palette.fg} style={{ flex: 1, paddingVertical: 8 }}>
        {title}
      </AText>
      {children}
    </View>
  );
}

function Value({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <AText autoDir size={15} line={20} weight="semibold" color={palette.fg2} numberOfLines={1} style={{ maxWidth: "50%" }}>
      {children}
    </AText>
  );
}

/**
 * Server information (web: ServerInfo modal; a page on the phone): who
 * runs it, what it is about, how big, its roles, and the way to settings,
 * your identity and a report.
 */
export function ServerInfoScreen({ serverId }: { serverId: string }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const server = useServer(serverId);
  const selfId = useSelfId();
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<null | "identity" | "report">(null);
  const f = useFields(
    server,
    (s) => ({
      name: s.name,
      banner: s.bannerURL,
      icon: s.animatedIconURL ?? s.iconURL,
      created: s.createdAt.getTime(),
      description: s.description?.trim() ?? "",
      members: s.approximateMemberCount,
      channels: s.channels.filter((c) => c.havePermission("ViewChannel")).length,
      roleCount: s.roles.size,
      owner: s.owner?.displayName ?? s.owner?.username ?? s.ownerId,
      mature: s.mature,
      roles: s.orderedRoles.map((r) => ({ id: r.id, name: r.name, colour: r.colour ?? undefined })),
      settings: canOpenServerSettings(s, selfId),
      member: !!s.member,
    }),
    [selfId],
  );
  if (!server || !f) return null;
  const id = server.id;

  const action = (label: string, onPress: () => void, tone: "normal" | "warning" = "normal", testID?: string) => (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: palette.tonalBorder, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.tonalHover : palette.tonal })}>
      <AText size={15} line={20} weight="semibold" color={tone === "warning" ? palette.danger : palette.fg}>
        {label}
      </AText>
    </Pressable>
  );

  return (
    <SafeAreaView testID="server-info" style={{ flex: 1, backgroundColor: palette.frame }} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader back>
        <AText size={16} line={20} weight="semibold" color={palette.header} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {t`Server information`}
        </AText>
      </ScreenHeader>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}>
        <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: palette.field }}>
          {f.banner ? <Image source={{ uri: f.banner }} style={{ width: "100%", aspectRatio: 3 }} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
            <Avatar url={f.icon} name={f.name} size={48} square />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AText size={18} line={24} weight="bold" color={palette.header}>
                {f.name}
              </AText>
              <AText size={13} line={18} color={palette.muted}>
                {`${t`Created`} · ${new Date(f.created).toLocaleDateString(i18n.locale, { year: "numeric", month: "long", day: "numeric" })}`}
              </AText>
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
            {t`About`}
          </AText>
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: palette.field }}>
            {f.description ? (
              <MessageContent content={f.description} />
            ) : (
              <AText size={14} line={20} color={palette.muted}>
                {t`No description provided.`}
              </AText>
            )}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
            {t`Server details`}
          </AText>
          <RowGroup>
            <Row first icon="users" title={t`Members (approximate)`}>
              <Value>{f.members ? String(f.members) : "—"}</Value>
            </Row>
            <Row icon="list-bullets" title={t`Channels visible to you`}>
              <Value>{String(f.channels)}</Value>
            </Row>
            <Row icon="shield-check" title={t`Roles`}>
              <Value>{String(f.roleCount)}</Value>
            </Row>
            <Row icon="users" title={t`Server owner`}>
              <Value>{f.owner}</Value>
            </Row>
            <Row icon="identification-card" title={t`Server ID`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t`Copy`}: ${id}`}
                onPress={() => {
                  void copyToClipboard(id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <AText size={13} line={18} color={palette.fg2} style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}>
                  {copied ? t`Copied` : `${id.slice(0, 6)}…${id.slice(-6)}`}
                </AText>
                <Icon name={copied ? "check" : "copy"} size={16} color={palette.fg2} />
              </Pressable>
            </Row>
            {f.mature ? <Row icon="info" title={t`Age-restricted server`} /> : null}
          </RowGroup>
        </View>

        {f.roles.length ? (
          <View style={{ gap: 12 }}>
            <AText size={18} line={24} weight="semibold" color={palette.header} accessibilityRole="header">
              {t`Roles`}
            </AText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {f.roles.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: palette.field }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isLobbyColour(r.colour) ? r.colour : palette.muted }} />
                  <AText size={13} line={18} weight="medium" color={palette.fg}>
                    {r.name}
                  </AText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {f.settings ? action(t`Settings`, () => router.push({ pathname: "/server-settings/[id]", params: { id } }), "normal", "server-info-settings") : null}
          {f.member ? action(t`Edit identity`, () => setPanel("identity"), "normal", "server-info-identity") : null}
          {action(t`Report`, () => setPanel("report"), "warning", "server-info-report")}
        </View>
      </ScrollView>
      {panel === "identity" ? <IdentitySheet serverId={id} onClose={() => setPanel(null)} /> : null}
      {panel === "report" ? <ReportSheet spec={{ kind: "Server", id, label: f.name, image: f.icon }} onClose={() => setPanel(null)} /> : null}
    </SafeAreaView>
  );
}
