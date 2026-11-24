/**
 * A ticket's actions in a bar under the channel header (web: TicketAction
 * and TicketMenuItems): Take ticket / Give back for the staff, Save the
 * conversation, Close ticket (asks first, as the web's CloseTicket), and on
 * a closed ticket Reopen ticket and, for those who manage channels, Delete
 * ticket. Nothing shows in a channel that is not a ticket.
 *
 * Mounted by the chat screen (WP2): <TicketBar channelId={id} />.
 */
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { describeError } from "@/auth/errorText";
import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon, type IconName } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { ConfirmDialog } from "@/ui/settings/parts";

import { type TicketAction, type TicketInfo, ticketActions } from "./ticketLogic";
import { channelTicket, claimTicket, closeTicket, reopenTicket, saveTranscript, unclaimTicket } from "./ticketStore";

export function TicketBar({ channelId }: { channelId: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const me = useSelfId();
  const channel = useChannel(channelId);
  const fields = useFields(channel, (c) => ({ server: c.serverId ?? "", name: c.name ?? "", manage: c.havePermission("ManageChannel") }));
  const [ticket, setTicket] = useState<TicketInfo>();
  const [pending, setPending] = useState(false);
  const [ask, setAsk] = useState<"close" | "delete">();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => channelTicket(client, channelId).then(setTicket, () => undefined), [client, channelId]);
  useEffect(() => {
    let live = true;
    channelTicket(client, channelId).then(
      (info) => live && setTicket(info),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, channelId]);

  if (!ticket || !fields?.server) return null;
  const mine = ticket.opener === me;

  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await action();
      haptics.success();
      await refresh();
    } catch (err) {
      haptics.error();
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };

  const meta: Record<TicketAction, { label: string; icon: IconName; testID: string; onPress: () => void; danger?: boolean }> = {
    claim: { label: t`Take ticket`, icon: "clipboard-check", testID: "ticket-claim", onPress: () => void run(() => claimTicket(client, fields.server, channelId)) },
    unclaim: { label: t`Give back`, icon: "arrow-u-up-left", testID: "ticket-unclaim", onPress: () => void run(() => unclaimTicket(client, fields.server, channelId)) },
    save: { label: t`Save the conversation`, icon: "file-text", testID: "ticket-save", onPress: () => void run(() => saveTranscript(client, channelId, ticket.kind)) },
    close: { label: t`Close ticket`, icon: "x-circle", testID: "ticket-close", onPress: () => setAsk("close") },
    reopen: { label: t`Reopen ticket`, icon: "lock-simple-open", testID: "ticket-reopen", onPress: () => void run(() => reopenTicket(client, fields.server, channelId)) },
    delete: { label: t`Delete ticket`, icon: "trash", testID: "ticket-delete", onPress: () => setAsk("delete"), danger: true },
  };
  const actions = ticketActions(ticket, me, fields.manage);

  return (
    <View testID="ticket-bar" style={{ borderBottomWidth: 1, borderBottomColor: palette.borderSubtle, backgroundColor: palette.frame }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingEnd: 4 }}>
          <Icon name="ticket" size={18} color={palette.fg2} />
          <AText size={13} line={18} weight="semibold" color={palette.fg2} numberOfLines={1}>
            {ticket.closed ? t`Closed` : ticket.kind ?? t`Ticket`}
          </AText>
        </View>
        {actions.map((a) => (
          <Button key={a} size="sm" variant={meta[a].danger ? "danger" : "tonal"} icon={meta[a].icon} label={meta[a].label} disabled={pending} onPress={meta[a].onPress} testID={meta[a].testID} />
        ))}
      </ScrollView>
      {error ? (
        <AText size={13} line={18} color={palette.danger} accessibilityRole="alert" style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {error}
        </AText>
      ) : null}
      <ConfirmDialog
        visible={ask === "close"}
        danger={false}
        title={t`Close this ticket?`}
        text={mine ? t`You will no longer see this ticket. The staff keep it and can open it again for you.` : t`The member who opened it will no longer see it. You can reopen it or delete it later.`}
        confirm={t`Close ticket`}
        onClose={() => setAsk(undefined)}
        onConfirm={async () => {
          await closeTicket(client, fields.server, channelId);
          haptics.success();
          setAsk(undefined);
          // the opener no longer sees it
          if (mine) router.back();
          else await refresh();
        }}
      />
      <ConfirmDialog
        visible={ask === "delete"}
        title={t`Delete ticket`}
        text={fields.name}
        confirm={t`Delete`}
        onClose={() => setAsk(undefined)}
        onConfirm={async () => {
          await client.channels.get(channelId)?.delete();
          setAsk(undefined);
          router.back();
        }}
      />
    </View>
  );
}
