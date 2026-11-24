import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";

import { ConfirmDialog, SettingsPage } from "../parts";
import { ListCategory, ListHead, ListRow, ListScreen, ScreenLoading } from "../server/controls";
import { WebhooksPanel } from "../server/Webhooks";
import { ChannelOverview } from "./ChannelOverview";
import { ChannelPermissions } from "./ChannelPermissions";
import { ForumTags } from "./ForumTags";
import { GroupPermissions } from "./GroupPermissions";
import { useChannelData } from "./data";

type Page = "overview" | "tags" | "permissions" | "webhooks";

/**
 * Channel settings (web: ChannelSettings.tsx): a card, then Overview,
 * Permissions, Webhooks and Delete channel. Sub-pages live in local state,
 * like the role editor.
 */
export function ChannelSettings({ channel }: { channel: Channel }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const data = useChannelData(channel);
  const [page, setPage] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!data) return <ScreenLoading />;

  const back = () => setPage(null);
  if (page === "overview") return <ChannelOverview channel={channel} data={data} onBack={back} />;
  if (page === "tags") return <ForumTags channel={channel} onBack={back} backLabel={data.name} />;
  if (page === "permissions")
    return data.type === "Group" ? <GroupPermissions channel={channel} data={data} onBack={back} /> : <ChannelPermissions channel={channel} data={data} onBack={back} />;
  if (page === "webhooks" && channel.server)
    return (
      <SettingsPage title={t`Webhooks`} backLabel={data.name} onBack={back} testID="channel-webhooks">
        <WebhooksPanel server={channel.server} channel={channel} />
      </SettingsPage>
    );

  const isGroup = data.type === "Group";
  const showPermissions = data.type !== "SavedMessages" && data.managePermissions;
  // webhooks belong to server channels: a group never offers them
  const showWebhooks = !isGroup && !data.voice && data.manageWebhooks;
  const showDelete = !isGroup && data.manageChannel;
  const channelName = data.name;
  const icon = isGroup ? "users-three" : data.voice ? "speaker-high" : "hash";

  return (
    <ListScreen testID="channel-settings">
      {/* web ChannelSettings on a phone: Back, the channel card, then the page list */}
      <ListHead
        backTestID="settings-back"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        leading={
          <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 10 }}>
            {data.icon ? <Image source={{ uri: data.icon }} style={{ width: 36, height: 36 }} /> : <Icon name={icon} size={20} color={palette.fg2} />}
          </View>
        }
        name={data.name}
        sub={isGroup ? t`Group` : data.voice ? t`Voice channel settings` : t`Channel settings`}
      />

      <ListCategory title={t`General`}>
        <ListRow first testID="channel-settings-overview" icon="info" title={t`Overview`} onPress={() => setPage("overview")} />
        {data.forum && data.manageChannel ? <ListRow testID="channel-settings-tags" icon="bookmark-simple" title={t`Tags`} onPress={() => setPage("tags")} /> : null}
      </ListCategory>

      {showPermissions ? (
        <ListCategory title={t`User management`}>
          <ListRow first testID="channel-settings-permissions" icon="shield-check" title={t`Permissions`} onPress={() => setPage("permissions")} />
        </ListCategory>
      ) : null}

      {showWebhooks ? (
        <ListCategory title={t`Integrations`}>
          <ListRow first testID="channel-settings-webhooks" icon="webhooks-logo" title={t`Webhooks`} onPress={() => setPage("webhooks")} />
        </ListCategory>
      ) : null}

      {showDelete ? (
        <ListCategory>
          <ListRow first danger testID="channel-settings-delete" icon="trash" title={t`Delete channel`} onPress={() => setDeleting(true)} />
        </ListCategory>
      ) : null}

      <ConfirmDialog
        visible={deleting}
        title={t`Delete ${channelName}?`}
        text={t`Once it's deleted, there's no going back.`}
        confirm={t`Delete`}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          const serverId = channel.serverId;
          await channel.delete();
          if (serverId) router.replace({ pathname: "/server/[id]", params: { id: serverId } });
          else router.replace("/home");
        }}
      >
        <View testID="channel-delete-subject" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.field }}>
          <Icon name={icon} size={20} color={palette.iconNeutral} />
          <View style={{ flex: 1 }}>
            <AText autoDir size={15} line={20} weight="bold" color={palette.fg} numberOfLines={1}>
              {data.name}
            </AText>
            <AText size={13} line={18} color={palette.muted}>
              {t`The channel and all of its messages`}
            </AText>
          </View>
        </View>
      </ConfirmDialog>
    </ListScreen>
  );
}
