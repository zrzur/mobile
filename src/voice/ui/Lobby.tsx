import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { ScrollView, View } from "react-native";

import { useClient } from "@/client/ClientProvider";
import { useFields, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar, UserAvatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { Button } from "@/ui/kit/Button";
import { PressScale } from "@/ui/kit/Press";

import { call, callStore } from "../call";
import { occupancy, type RoomInfo } from "../logic";
import { hasNativeVoice } from "../native";
import { useStoreFields } from "../store";
import { BigButton } from "./parts";
import { useVoiceText } from "./text";

/**
 * Before joining (web: VoiceChannel Unavailable), the phone layout:
 *
 *        (speaker)
 *        room name
 *    3 people are here
 *  [avatar name] [avatar name] ...
 * [mic] [ ...... Join call ...... ]
 *
 * A DM or group shows the people and Start a call / Start a video call. A
 * build without the native voice module (Expo Go) keeps this page and says
 * so where the action would be.
 */
export function Lobby({ channel, room, roomLoading }: { channel: Channel; room?: RoomInfo; roomLoading?: boolean }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const client = useClient();
  const selfId = useSelfId();
  const s = useStoreFields(callStore, ["status", "channelId", "error", "micOn", "deafen"] as const);
  const fields = useFields(channel, (c) => ({
    dm: c.type === "DirectMessage" || c.type === "Group",
    name: c.type === "DirectMessage" ? (c.recipient?.displayName ?? c.recipient?.username ?? "") : (c.name ?? ""),
    icon: c.type === "Group" ? c.iconURL : undefined,
    stage: c.isStage,
    ids: [...c.voiceParticipants.keys()],
    connect: c.havePermission("Connect"),
    max: c.voice?.maxUsers,
    recipients: c.type === "DirectMessage" ? [c.recipient?.id ?? ""] : [],
  }));
  if (!fields) return null;
  const available = hasNativeVoice();
  const count = fields.ids.length;
  const full = occupancy(count, fields.max).full;
  const micOn = s.micOn && !s.deafen;
  const joining = s.channelId === channel.id && (s.status === "connecting" || s.status === "reconnecting");
  const failed = available && s.status !== "connected" && !joining && s.error && (s.channelId === channel.id || s.channelId === undefined) ? s.error : undefined;
  const join = (video = false) => {
    call.clearError();
    void call.join(channel, { roomMaker: room?.maker, video });
  };

  const hint = fields.dm
    ? undefined
    : count === 0
      ? t`No one is here yet. Start the call and others can join.`
      : count === 1
        ? t`1 person is here`
        : t`${String(count)} people are here`;

  const people = fields.dm && !count ? fields.recipients.filter(Boolean) : fields.ids.filter((id) => !fields.dm || id !== selfId);

  return (
    <View testID="voice-lobby" style={{ flex: 1, backgroundColor: palette.frame }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16 }}>
        {fields.dm && fields.recipients[0] ? (
          <View style={{ marginBottom: 6 }}>
            <UserAvatar user={client.users.get(fields.recipients[0])} size={88} />
          </View>
        ) : fields.dm ? (
          <View style={{ marginBottom: 6 }}>
            <Avatar url={fields.icon} name={fields.name} size={88} />
          </View>
        ) : (
          <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <Icon name={fields.stage ? "waveform" : "speaker-high"} size={34} color={palette.accent} />
          </View>
        )}
        <AText autoDir size={22} line={28} weight="bold" color={palette.header} accessibilityRole="header" style={{ textAlign: "center" }}>
          {fields.name}
        </AText>
        {hint ? (
          <AText testID="voice-lobby-hint" size={14} line={20} color={palette.muted} style={{ textAlign: "center", maxWidth: 320 }}>
            {hint}
          </AText>
        ) : null}
        {people.length && !(fields.dm && !count) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 18, maxWidth: 420 }}>
            {people.map((id) => (
              <Person key={id} id={id} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* bottom edge: the one action of this screen */}
      <View testID="voice-lobby-dock" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, alignItems: "center", gap: 12 }}>
        {!fields.dm && !fields.connect ? (
          <DockText>{t`You don't have permission to join.`}</DockText>
        ) : !fields.dm && full ? (
          <DockText>{t`This voice channel is full.`}</DockText>
        ) : failed ? (
          <>
            <DockText alert>{text.error(failed)}</DockText>
            <Button testID="voice-retry" label={t`Try again`} onPress={() => join()} />
          </>
        ) : (
          <>
            {available ? null : (
              <View testID="voice-unavailable" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: 360 }}>
                <Icon name="info" size={18} color={palette.muted} />
                <DockText>{t`Voice isn't available in this build.`}</DockText>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "stretch" }}>
              {/* mute before joining: the choice is kept for the call */}
              <PressScale
                testID="voice-join-mic"
                accessibilityRole="button"
                accessibilityState={{ selected: !micOn }}
                accessibilityLabel={micOn ? t`Join muted` : t`Join with microphone on`}
                onPress={() => void call.toggleMute()}
                scale={0.94}
              >
                {({ pressed }) => (
                  <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? palette.navSelected : palette.field }}>
                    <Icon name={micOn ? "microphone" : "microphone-slash"} size={20} color={micOn ? palette.fg : palette.danger} />
                  </View>
                )}
              </PressScale>
              {fields.dm ? (
                <PressScale testID="voice-join-video" accessibilityRole="button" accessibilityLabel={t`Start a video call`} disabled={joining || !available} onPress={() => join(true)} scale={0.94}>
                  {({ pressed }) => (
                    <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", opacity: available ? 1 : 0.5, backgroundColor: pressed ? palette.navSelected : palette.field }}>
                      <Icon name="video-camera" size={20} color={palette.fg} />
                    </View>
                  )}
                </PressScale>
              ) : null}
              <BigButton
                testID="voice-join"
                icon="phone"
                label={fields.dm && !count ? t`Start a call` : t`Join call`}
                busy={joining || (available && !fields.dm && roomLoading)}
                disabled={!available}
                onPress={() => join()}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** The dock's line (web: VoiceChannel Notice, 15 px muted, centred) */
function DockText({ children, alert }: { children: string | undefined; alert?: boolean }) {
  const { palette } = useTheme();
  return (
    <AText
      size={15}
      line={22}
      color={palette.muted}
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "assertive" : "polite"}
      style={{ textAlign: "center", flexShrink: 1 }}
    >
      {children}
    </AText>
  );
}

function Person({ id }: { id: string }) {
  const { palette } = useTheme();
  const client = useClient();
  const user = client.users.get(id);
  const name = useFields(user, (u) => u.displayName ?? u.username) ?? "";
  return (
    <View style={{ width: 72, alignItems: "center", gap: 6 }}>
      <UserAvatar user={user} size={48} />
      <AText autoDir size={12} line={16} weight="semibold" color={palette.fg2} numberOfLines={1}>
        {name}
      </AText>
    </View>
  );
}
