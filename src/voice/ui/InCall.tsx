import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { type PanGesture, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useFields, useSelfId } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Button } from "@/ui/kit/Button";
import { haptics } from "@/ui/kit/haptics";
import { SHEET_SPRING, useReduceMotion } from "@/ui/kit/motion";
import { PressScale } from "@/ui/kit/Press";
import { Icon } from "@/ui/Icon";

import { call, callStore } from "../call";
import { CALL_EDGE } from "../layout";
import { controlsRoom, type RoomInfo } from "../logic";
import { useStore, useStoreFields } from "../store";
import { callView, closeCallView, minimiseCallView, setCallChat } from "../view";
import { CALL_PULL_START, phaseInCall, pullMinimises, pullOffset } from "../viewLogic";
import { CallAlone } from "./CallAlone";
import { CallChatSheet } from "./CallChatSheet";
import { CallControls } from "./CallControls";
import { CallHero } from "./CallHero";
import { CallMoreSheet } from "./CallMoreSheet";
import { OutputSheet, ROUTE_ICON } from "./OutputSheet";
import { ParticipantGrid } from "./ParticipantGrid";
import { ParticipantSheet } from "./ParticipantSheet";
import { PillButton, TopButton } from "./parts";
import { RoomControlsSheet } from "./RoomControlsSheet";
import { SoundboardSheet } from "./SoundboardSheet";
import { StagePanel } from "./StagePanel";
import { useVoiceText } from "./text";
import { useCallName, useCallPhase, useCallTimer } from "./useCall";

type SheetName = "more" | "output" | "soundboard" | "room" | { participant: string } | undefined;

/** Back to where the call was opened from (the call goes on) */
export function leaveScreen() {
  if (router.canGoBack()) router.back();
  else router.replace("/home");
}

/**
 * The call, full screen (web: VoiceChannel CallTop and
 * VoiceCallCardActiveRoom with phoneCall.css), over the app or as the
 * voice channel's own page:
 *
 * [v]  Name ›                        [output] [add]
 *      00:42
 *  (stage panel) (weak connection sign)
 *  [ tiles, or the person you are calling ]
 *        Connected · Reconnected · Rejoin
 *                  ───
 * ( camera  mic  chat  more  [ hang up ] )
 *
 * Drag down anywhere above the bar (or the v) minimises it to the pill;
 * the chat button opens the conversation as a sheet over the call.
 *
 * @param mode "overlay": over the app (minimise = the pill); "page": the
 *   voice channel's page (minimise = back)
 */
export function InCall({ channel, room, onRoomChanged, mode = "page" }: { channel: Channel; room?: RoomInfo; onRoomChanged?: () => void; mode?: "page" | "overlay" }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const reduce = useReduceMotion();
  const selfId = useSelfId();
  const [sheet, setSheet] = useState<SheetName>();
  const chat = useStore(callView, (v) => v.chat);
  const phase = useCallPhase(channel.id);
  const name = useCallName(channel);
  const timer = useCallTimer(phaseInCall(phase));
  const output = useStore(callStore, (s) => s.output);
  const s = useStoreFields(callStore, ["error"] as const);
  const fields = useFields(channel, (c) => ({
    dm: c.type === "DirectMessage" || c.type === "Group",
    group: c.type === "Group",
    server: !!c.serverId,
    serverId: c.serverId,
    stage: c.isStage,
    invite: !!c.serverId && c.havePermission("InviteOthers"),
    chat: c.serverId ? (c.server?.channels.find((other) => !other.isVoice)?.id ?? null) : c.id,
    soundboard: c.havePermission("UseSoundboard") && c.havePermission("Speak"),
    managesPermissions: c.havePermission("ManagePermissions"),
  }));

  // the chat sheet belongs to this screen: gone with it
  useEffect(() => () => setCallChat(false), []);

  // drag down to minimise (web: callPull.ts): the screen follows the finger
  const drag = useSharedValue(0);
  const minimise = () => {
    haptics.soft();
    if (mode === "overlay") minimiseCallView();
    else leaveScreen();
  };
  const pull: PanGesture = usePanGesture({
    activeOffsetY: CALL_PULL_START,
    failOffsetY: -CALL_PULL_START,
    failOffsetX: [-12, 12],
    onUpdate: (e) => {
      "worklet";
      drag.set(pullOffset(e.translationY));
    },
    onDeactivate: (e) => {
      "worklet";
      if (pullMinimises(e.translationY, e.velocityY)) scheduleOnRN(minimise);
      drag.set(withSpring(0, SHEET_SPRING));
    },
  });
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: reduce ? 0 : drag.get() }] }));

  if (!fields) return null;
  const mine = controlsRoom(room, selfId, fields.managesPermissions);
  const close = () => setSheet(undefined);
  const live = phase !== "unavailable" && phase !== "failed" && phase !== "ended";
  const hero = fields.dm && (phase === "ringing" || phase === "unavailable" || phase === "ended" || phase === "failed");

  const hangUp = () => {
    setCallChat(false);
    if (mode === "overlay") {
      closeCallView();
      call.leave();
    } else {
      call.leave();
      leaveScreen();
    }
  };

  // leave the call screen for another page (the call goes on, the pill shows)
  const away = (go: () => void) => {
    if (mode === "overlay") minimiseCallView();
    go();
  };
  const openDetails = () => away(() => router.push({ pathname: "/channel-details/[id]", params: { id: channel.id } }));
  const addPeople = fields.group
    ? () => away(() => router.push({ pathname: "/new-group", params: { group: channel.id } }))
    : fields.invite && fields.serverId
      ? () => away(() => router.push({ pathname: "/invite/[serverId]", params: { serverId: fields.serverId! } }))
      : undefined;

  const subtitle =
    phaseInCall(phase) ? timer : phase === "ringing" ? t`Calling…` : phase === "connecting" || phase === "reconnecting" ? text.status(phase) : undefined;

  return (
    <View testID="voice-in-call" style={{ flex: 1, backgroundColor: palette.frame }}>
      <GestureDetector gesture={pull}>
        <Animated.View style={[{ flex: 1 }, follow]}>
          {/* top bar: minimise, the call's name (opens its details), sound output, add people */}
          <View testID="call-top" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: CALL_EDGE, paddingTop: 8, paddingBottom: 8 }}>
            <TopButton icon="caret-down" label={t`Minimise`} testID="voice-back" onPress={minimise} />
            <PressScale
              testID="call-title"
              accessibilityRole="button"
              accessibilityLabel={name}
              accessibilityHint={t`Channel details`}
              onPress={openDetails}
              scale={0.98}
              style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {fields.server ? <Icon name={fields.stage ? "waveform" : "speaker-high"} size={16} color={palette.muted} /> : null}
                <AText autoDir size={17} line={22} weight="semibold" color={palette.header} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </AText>
                <Icon name="caret-right" size={14} color={palette.muted} />
              </View>
              {subtitle ? (
                <AText testID="call-subtitle" size={13} line={18} weight="medium" color={phaseInCall(phase) ? palette.onlineText : palette.muted} numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
                  {subtitle}
                </AText>
              ) : null}
            </PressScale>
            <TopButton icon={ROUTE_ICON[output]} label={`${t`Sound output`}: ${text.route(output)}`} testID="call-output" onPress={() => setSheet("output")} />
            {addPeople ? <TopButton icon="user-plus" label={fields.group ? t`Add friends to group` : t`Create invite`} testID="call-add-people" onPress={addPeople} /> : null}
          </View>

          {hero ? (
            <CallHero channel={channel} phase={phase} error={s.error} />
          ) : (
            <>
              {fields.stage ? <StagePanel channel={channel} /> : null}
              <WeakNetworkSign />
              <View style={{ flex: 1 }}>
                <ParticipantGrid selfId={selfId} onOpen={(id) => setSheet({ participant: id })} />
              </View>
              {phase === "alone" ? <CallAlone channel={channel} selfId={selfId} /> : null}
              {mine && room ? (
                <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 8 }}>
                  <PillButton icon={room.locked ? "lock-simple" : "lock-simple-open"} label={t`Room controls`} testID="voice-room-controls" onPress={() => setSheet("room")} />
                </View>
              ) : null}
              <CallStatus />
            </>
          )}
        </Animated.View>
      </GestureDetector>

      {phase === "ended" ? (
        <View style={{ height: 110 }} />
      ) : (
        <CallControls
          live={live}
          hangUpLabel={phase === "ringing" ? t`Cancel` : phase === "unavailable" ? t`Close` : undefined}
          onChat={fields.chat ? () => setCallChat(true) : undefined}
          onMore={() => setSheet("more")}
          onLeave={hangUp}
        />
      )}

      <CallMoreSheet
        visible={sheet === "more"}
        live={live}
        onClose={close}
        onOutput={() => setSheet("output")}
        onSoundboard={fields.server && fields.soundboard ? () => setSheet("soundboard") : undefined}
        onRoomControls={mine && room ? () => setSheet("room") : undefined}
      />
      <OutputSheet visible={sheet === "output"} onClose={close} />
      {fields.server ? <SoundboardSheet channel={channel} visible={sheet === "soundboard"} onClose={close} /> : null}
      {mine && room ? <RoomControlsSheet channel={channel} info={room} visible={sheet === "room"} onClose={close} onChanged={() => onRoomChanged?.()} /> : null}
      <ParticipantSheet channel={channel} userId={typeof sheet === "object" ? sheet.participant : undefined} onClose={close} />
      <CallChatSheet channelId={fields.chat ?? undefined} visible={chat && !!fields.chat} onClose={() => setCallChat(false)} />
    </View>
  );
}

/**
 * The "weak connection" sign (web: WeakNetworkSign): what the app did to
 * keep the call going. Nothing shows on a good connection.
 */
function WeakNetworkSign() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const { network } = useStoreFields(callStore, ["network"] as const);
  if (network === "good") return null;
  return (
    <View
      testID="voice-weak-network"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: CALL_EDGE,
        marginBottom: 8,
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.borderSubtle,
        backgroundColor: palette.floating,
      }}
    >
      <Icon name="wifi-slash" size={18} color={palette.warningText} />
      <AText size={13} line={20} weight="medium" color={palette.fg} style={{ flexShrink: 1 }}>
        {network === "bad" ? t`Very weak connection. Video is paused, sound stays on.` : t`Weak connection. Video is lowered to keep the call.`}
      </AText>
    </View>
  );
}

/**
 * Above the bar (web: VoiceCallCardStatus on a phone): an error in the
 * warning colour, the connection state ("Connected" fades after 5 s), a
 * notice such as "Reconnected", and Rejoin after reconnecting failed.
 */
function CallStatus() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const s = useStoreFields(callStore, ["status", "error", "canRejoin", "notice", "justConnected"] as const);
  const showState = s.status !== "connected" || s.justConnected;
  const notice = s.notice?.kind === "reconnected" ? t`Reconnected` : undefined;
  const rejoin = s.status === "disconnected" && s.canRejoin;
  if (!showState && !notice && !s.error && !rejoin) return null;
  return (
    <View
      testID="voice-status"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 12, rowGap: 4, paddingHorizontal: 16, paddingBottom: 4 }}
    >
      {s.error ? (
        <AText size={13} line={18} color={palette.warningText} accessibilityRole="alert" style={{ textAlign: "center", flexShrink: 1 }}>
          {text.error(s.error)}
        </AText>
      ) : null}
      {showState ? (
        <AText testID="voice-state" size={14} line={20} weight="semibold" color={s.status === "connected" ? palette.onlineText : palette.muted}>
          {text.status(s.status)}
        </AText>
      ) : null}
      {notice ? (
        <AText size={13} line={18} weight="medium" color={palette.fg2}>
          {notice}
        </AText>
      ) : null}
      {rejoin ? <Button size="sm" label={t`Rejoin`} testID="voice-rejoin" onPress={() => call.rejoin()} /> : null}
    </View>
  );
}
