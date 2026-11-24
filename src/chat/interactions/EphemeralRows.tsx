import { Trans, useLingui } from "@lingui/react/macro";
import { memo, type ReactNode, useMemo } from "react";
import { Pressable, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/ui/Avatar";
import { AText, Icon } from "@/ui/kit";

import { MessageContent } from "../MessageContent";
import { messageTime } from "../time";
import { useInteractionErrorText } from "./errorText";
import { ulidMs } from "./logic";
import { ComponentBlocks } from "./MessageComponents";
import { dismissEphemeral, type PendingInteraction, useInteractionState } from "./store";
import type { EphemeralMessage } from "./types";

export type InteractionEntry = { kind: "pending"; at: number; key: string; pending: PendingInteraction } | { kind: "ephemeral"; at: number; key: string; message: EphemeralMessage };

/**
 * Private answers and the progress of this person's commands in a channel,
 * oldest first (web: EphemeralMessages). Commands show their progress;
 * buttons and menus only "thinking" (their own wait and failures show at the
 * component).
 */
export function useInteractionEntries(channelId: string): InteractionEntry[] {
  const pending = useInteractionState((s) => s.pending);
  const ephemeral = useInteractionState((s) => s.ephemeral[channelId]);
  return useMemo(() => {
    const list: InteractionEntry[] = Object.values(pending)
      .filter((p) => p.channelId === channelId && (p.label || (p.state === "failed" && !p.componentKey) || p.state === "deferred"))
      .map((p) => ({ kind: "pending" as const, at: p.createdAt, key: `pending-${p.id}`, pending: p }));
    for (const m of ephemeral ?? []) list.push({ kind: "ephemeral", at: ulidMs(m._id) ?? 0, key: `ephemeral-${m._id}`, message: m });
    return list.sort((a, b) => a.at - b.at);
  }, [pending, ephemeral, channelId]);
}

function botName(client: ReturnType<typeof useClient>, id: string, fallback: string) {
  const user = client.users.get(id);
  return user?.displayName ?? user?.username ?? fallback;
}

/** "<you> used /command" above the answer (web: InteractionHeader) */
function UsedLine({ label }: { label: string }) {
  const { palette } = useTheme();
  const client = useClient();
  const me = client.user;
  const name = me?.displayName ?? me?.username ?? "";
  // the command without its slash, drawn left to right (web: InteractionHeader)
  const used = { command: label.startsWith("/") ? label : `/${label}` };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 20, marginStart: 29 }}>
      <Avatar url={me?.avatarURL} name={name} size={14} />
      <AText autoDir size={13} line={20} weight="semibold" color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </AText>
      <AText size={13} line={20} color={palette.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
        <Trans>
          used{" "}
          <AText size={13} line={20} weight="semibold" color={palette.accentText} style={{ writingDirection: "ltr" }}>
            {used.command}
          </AText>
        </Trans>
      </AText>
    </View>
  );
}

function BotRow({ botId, at, label, children }: { botId: string; at: number; label?: string; children: ReactNode }) {
  const { t, i18n } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const bot = client.users.get(botId);
  const name = botName(client, botId, t`The bot`);
  return (
    <View style={{ marginTop: 16, paddingVertical: 2 }}>
      {label ? <UsedLine label={label} /> : null}
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 48 }}>
          <Avatar url={bot?.avatarURL} name={name} size={36} />
        </View>
        <View style={{ flex: 1, paddingEnd: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20 }}>
            <AText autoDir size={14} line={20} weight="medium" color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </AText>
            <View style={{ paddingHorizontal: 4, borderRadius: 4, backgroundColor: palette.accent }}>
              <AText size={10} line={14} weight="bold" color={palette.onAccent}>
                {t`Bot`}
              </AText>
            </View>
            <AText size={12} line={16} color={palette.muted}>
              {messageTime(i18n, new Date(at))}
            </AText>
          </View>
          {children}
        </View>
      </View>
    </View>
  );
}

/** One entry: a command on its way, a bot thinking, a failure, or a private answer */
export const InteractionRow = memo(function InteractionRow({ entry, serverId }: { entry: InteractionEntry; serverId?: string }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const errorText = useInteractionErrorText();
  const labels = useInteractionState((s) => s.labels);
  const thinking = (name: string) => t`${name} is thinking…`;

  if (entry.kind === "pending") {
    const p = entry.pending;
    return (
      <View accessibilityLiveRegion="polite" testID={`interaction-pending-${p.id}`}>
        <BotRow botId={p.applicationId} at={entry.at} label={p.label}>
          {p.state === "failed" ? (
            <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="warning-circle" size={16} color={palette.danger} />
              <AText size={14} line={20} color={palette.danger} style={{ flex: 1 }}>
                {errorText(p.error)}
              </AText>
            </View>
          ) : (
            <AText size={14} line={20} color={palette.muted} style={{ fontStyle: "italic" }}>
              {p.state === "deferred" ? thinking(botName(client, p.applicationId, t`The bot`)) : t`Sending command…`}
            </AText>
          )}
        </BotRow>
      </View>
    );
  }
  const m = entry.message;
  return (
    <View testID={`ephemeral-${m._id}`}>
      <BotRow botId={m.author} at={entry.at} label={labels[m.interaction_id]}>
        {m.content ? <MessageContent content={m.content} edited={m.edited} serverId={serverId} /> : null}
        <ComponentBlocks blocks={m.components} channelId={m.channel_id} messageId={m._id} serverId={serverId} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Icon name="eye" size={14} color={palette.muted} />
          <AText size={12} line={16} color={palette.muted}>
            {t`Only you can see this`}
          </AText>
          <AText size={12} line={16} color={palette.muted} aria-hidden>
            ·
          </AText>
          <Pressable
            testID={`ephemeral-dismiss-${m._id}`}
            accessibilityRole="button"
            onPress={() => dismissEphemeral(m.channel_id, m._id)}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ minHeight: 20, justifyContent: "center" }}
          >
            <AText size={12} line={16} weight="semibold" color={palette.link}>
              {t`Dismiss message`}
            </AText>
          </Pressable>
        </View>
      </BotRow>
    </View>
  );
});
