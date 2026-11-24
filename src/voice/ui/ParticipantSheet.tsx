import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { useSolid } from "@/sdk/bridge";
import { useTheme } from "@/theme/ThemeProvider";
import { GroupRow, RowGroup, Sheet } from "@/ui/app/parts";
import { AText } from "@/ui/auth/parts";
import { UserAvatar } from "@/ui/Avatar";
import { Slider } from "@/ui/settings/user/userParts";

import { call, callStore } from "../call";
import { useStore } from "../store";
import { volumePercent } from "../volumes";

import { moderationRights, occupancy, voiceErrorKind } from "../logic";
import { Note } from "./parts";
import { useVoiceText } from "./text";

type Action = { kind: "mute" | "deafen"; value: boolean } | { kind: "move"; to: string } | { kind: "disconnect" };

/**
 * Someone in the call (web: VoiceParticipantContextMenu): their volume for
 * you, mute for me, their stream's sound while they share a screen; then,
 * in a server and with the rights, server mute, server deafen, move to
 * another voice channel, disconnect. Each moderation change waits for the
 * server's voice state before it says "updated".
 */
export function ParticipantSheet({ channel, userId, onClose }: { channel: Channel; userId: string | undefined; onClose: () => void }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const client = useClient();
  const self = useSelfId();
  const serverId = channel.serverId;
  const [status, setStatus] = useState<{ text: string; failed: boolean }>();
  const [pending, setPending] = useState<Action>();
  const [moving, setMoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!userId || !serverId) return;
    for (const id of new Set([userId, client.user?.id ?? ""]))
      if (id) void client.serverMembers.fetch(serverId, id).catch(() => undefined);
  }, [client, serverId, userId]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const member = useSolid(useCallback(() => (serverId && userId ? client.serverMembers.getByKey({ server: serverId, user: userId }) : undefined), [client, serverId, userId]));
  const user = userId ? client.users.get(userId) : undefined;
  const facts = useFields(
    channel,
    (c) => {
      const server = c.server;
      const actor = server?.member;
      return {
        ownerId: server?.ownerId ?? "",
        actorRank: actor?.ranking ?? Infinity,
        targetRank: member?.ranking ?? Infinity,
        present: !!userId && c.voiceParticipants.has(userId),
        mute: !!server?.havePermission("MuteMembers"),
        deafen: !!server?.havePermission("DeafenMembers"),
        move: c.havePermission("MoveMembers"),
        canPublish: member?.canPublish,
        canReceive: member?.canReceive,
        destinations: (server?.channels ?? [])
          .filter((d) => d.id !== c.id && d.isVoice && d.havePermission("ViewChannel", "Connect", "MoveMembers") && !!member?.hasPermission(d, "ViewChannel", "Connect"))
          .map((d) => ({ id: d.id, name: d.name ?? "", label: `${d.name} · ${occupancy(d.voiceParticipants.size, d.voice?.maxUsers).count}${d.voice?.maxUsers ? ` / ${d.voice.maxUsers}` : ""}` })),
      };
    },
    [member, userId],
  );

  const rights =
    facts && self && userId
      ? moderationRights({
          actorId: self,
          targetId: userId,
          ownerId: facts.ownerId,
          actorRank: facts.actorRank,
          targetRank: facts.targetRank,
          targetPresent: facts.present,
          muteMembers: facts.mute,
          deafenMembers: facts.deafen,
          moveMembers: facts.move,
        })
      : undefined;

  // the server's voice state confirms the change
  const confirmed =
    !!pending &&
    !!facts &&
    (pending.kind === "mute"
      ? facts.canPublish === pending.value
      : pending.kind === "deafen"
        ? facts.canReceive === pending.value
        : pending.kind === "move"
          ? !!client.channels.get(pending.to)?.voiceParticipants.has(userId ?? "")
          : !facts.present);
  const busy = !!pending && !confirmed;
  const done = useRef(false);
  useEffect(() => {
    done.current = confirmed;
    if (confirmed) clearTimeout(timer.current);
  }, [confirmed]);

  async function perform(action: Action) {
    if (busy || !member) return;
    setStatus({ text: t`Applying…`, failed: false });
    setPending(action);
    done.current = false;
    timer.current = setTimeout(() => {
      if (done.current) return;
      setPending(undefined);
      setStatus({ text: t`The server has not confirmed the voice change. Check the participant state before retrying.`, failed: true });
    }, 10000);
    try {
      await member.edit(
        action.kind === "mute"
          ? { can_publish: action.value }
          : action.kind === "deafen"
            ? { can_receive: action.value }
            : action.kind === "move"
              ? { voice_channel: action.to }
              : { remove: ["VoiceChannel"] },
      );
      setStatus((s) => (s?.failed ? s : { text: t`Waiting for voice state…`, failed: false }));
    } catch (error) {
      clearTimeout(timer.current);
      setPending(undefined);
      setStatus({ text: text.error(voiceErrorKind(error)) ?? "", failed: true });
    }
  }

  const shown = confirmed ? { text: t`Voice state updated.`, failed: false } : status;
  const name = member?.displayName ?? user?.displayName ?? user?.username ?? "";

  return (
    <Sheet visible={!!userId} onClose={onClose} testID="participant-sheet">
      <View accessibilityLabel={t`Voice participant actions`} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 }}>
        <UserAvatar user={user} size={40} />
        <AText autoDir size={17} line={24} weight="bold" color={palette.header} style={{ flex: 1 }} numberOfLines={1}>
          {name}
        </AText>
      </View>
      {userId && userId !== self ? <PersonVolume userId={userId} /> : null}
      {rights?.any ? (
        <View style={{ gap: 8 }}>
          <AText size={13} line={18} weight="semibold" color={palette.muted}>
            {t`Voice moderation`}
          </AText>
          <RowGroup>
            {rights.mute ? (
              <GroupRow
                first
                icon="microphone-slash"
                testID="voice-action-mute"
                label={facts?.canPublish === false ? t`Remove server mute` : t`Server mute`}
                onPress={() => !busy && void perform({ kind: "mute", value: facts?.canPublish === false })}
              />
            ) : null}
            {rights.deafen ? (
              <GroupRow
                first={!rights.mute}
                icon="headphones-slash"
                testID="voice-action-deafen"
                label={facts?.canReceive === false ? t`Remove server deafen` : t`Server deafen`}
                onPress={() => !busy && void perform({ kind: "deafen", value: facts?.canReceive === false })}
              />
            ) : null}
            {rights.move ? (
              <>
                <GroupRow first={!rights.mute && !rights.deafen} icon="arrow-right" testID="voice-action-move" label={t`Move to voice channel`} chevron onPress={() => !busy && setMoving((m) => !m)} />
                {moving
                  ? facts?.destinations.length
                    ? facts.destinations.map((d) => <GroupRow key={d.id} icon="speaker-high" testID={`voice-destination-${d.id}`} label={d.label} onPress={() => !busy && void perform({ kind: "move", to: d.id })} />)
                    : (
                        <View style={{ padding: 14 }}>
                          <Note>{t`No accessible voice channels`}</Note>
                        </View>
                      )
                  : null}
                <GroupRow danger icon="phone-disconnect" testID="voice-action-disconnect" label={t`Disconnect from voice`} onPress={() => !busy && void perform({ kind: "disconnect" })} />
              </>
            ) : null}
          </RowGroup>
        </View>
      ) : null}
      {shown ? <Note alert={shown.failed}>{shown.text}</Note> : null}
      <View style={{ height: 8 }} />
    </Sheet>
  );
}

/** Their voice (and stream) for you only, kept on this phone */
function PersonVolume({ userId }: { userId: string }) {
  const { t } = useLingui();
  const volume = useStore(callStore, (s) => s.volumes.users[userId] ?? 1);
  const muted = useStore(callStore, (s) => !!s.volumes.muted[userId]);
  const streamVolume = useStore(callStore, (s) => s.volumes.streams[userId] ?? 1);
  const sharing = useStore(callStore, (s) => !!s.tiles.find((tile) => tile.id === userId)?.screen);
  return (
    <View style={{ gap: 8 }}>
      <VolumeRow label={t`Local volume`} value={volume} onChange={(v) => call.setPersonVolume(userId, v)} testID="voice-person-volume" />
      {sharing ? <VolumeRow label={t`Stream volume`} value={streamVolume} onChange={(v) => call.setStreamVolume(userId, v)} testID="voice-stream-volume" /> : null}
      <RowGroup>
        <GroupRow
          first
          icon={muted ? "speaker-high" : "speaker-slash"}
          testID="voice-person-mute"
          label={muted ? t`Unmute for me` : t`Mute for me`}
          onPress={() => call.setPersonMuted(userId, !muted)}
        />
      </RowGroup>
    </View>
  );
}

function VolumeRow({ label, value, onChange, testID }: { label: string; value: number; onChange: (v: number) => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <View>
      <AText size={13} line={18} weight="semibold" color={palette.muted}>
        {label}
      </AText>
      <Slider label={label} value={value} min={0} max={3} step={0.05} valueText={volumePercent(value)} onChange={onChange} testID={testID} />
    </View>
  );
}
