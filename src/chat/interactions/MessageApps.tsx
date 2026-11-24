import { useLingui } from "@lingui/react/macro";
import type { Message } from "@zrzur/sdk/solid";
import { useMemo } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useChannel } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText, GroupRow, RowGroup } from "@/ui/kit";

import { messageCommands } from "./logic";
import { runCommand, useChannelCommands } from "./store";
import { commandName } from "./types";

/**
 * The "Apps" part of a message's sheet (web: menus/shared/AppsSubMenu): the
 * message commands of the bots in this server, one row each. A tap runs the
 * command on this message; the answer shows in the chat. Nothing shows
 * when no bot here has one.
 *
 * For the message sheet (WP1): <MessageApps message={m} onDone={close} />
 */
export function MessageApps({ message, onDone }: { message: Message; onDone: () => void }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const channel = useChannel(message.channelId);
  const shape = channel ? { id: channel.id, type: channel.type, serverId: channel.serverId || undefined, parentId: channel.parentId, recipient: channel.recipient ? { id: channel.recipient.id, bot: channel.recipient.bot } : undefined } : undefined;
  const load = useChannelCommands(client, shape);
  const list = useMemo(() => (load.list ? messageCommands(load.list.commands) : []), [load.list]);
  if (!list.length) return null;
  const botName = (id: string) => {
    const app = load.list?.applications.find((a) => a._id === id);
    return app?.display_name ?? app?.username ?? "";
  };
  return (
    <View style={{ gap: 8 }} testID="message-apps">
      <AText size={13} line={18} weight="semibold" color={palette.muted} style={{ paddingHorizontal: 4 }}>
        {t`Apps`}
      </AText>
      <RowGroup>
        {list.map((c, i) => (
          <GroupRow
            key={c._id}
            first={i === 0}
            icon="lightning"
            label={commandName(c, i18n.locale)}
            value={botName(c.application_id)}
            testID={`message-app-${c.name}`}
            onPress={() => {
              onDone();
              runCommand(client, message.channelId, c, [], message.id).catch(() => {
                // the failure shows in the chat where the answer would be
              });
            }}
          />
        ))}
      </RowGroup>
    </View>
  );
}
