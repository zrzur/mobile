import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Vibration, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useClient } from "@/client/ClientProvider";
import { useChannel, useFields } from "@/client/hooks";
import { playback } from "@/media/playback";
import { loopSound } from "@/sounds";
import { useTheme } from "@/theme/ThemeProvider";
import { GestureRoot } from "@/ui/kit/GestureRoot";
import { haptics } from "@/ui/kit/haptics";
import { FADE_MS, SHEET_SPRING, useReduceMotion } from "@/ui/kit/motion";
import { AText } from "@/ui/auth/parts";
import { Avatar, UserAvatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { ConfirmDialog } from "@/ui/settings/parts";

import { call, callStore } from "../call";
import { dismissIncomingRing, isRingEvent, outgoingOutcome, receiveRingEvent, resetRings, rings } from "../ringing";
import { useStore, useStoreFields } from "../store";
import { askToCall, callAsk, callView, closeCallAsk, closeCallView, followCall, minimiseCallView, openCallView } from "../view";
import { callStart, screenVisible } from "../viewLogic";
import { CallPill } from "./CallPill";
import { InCall } from "./InCall";
import { useCallName, useCallPhase, useOnCallPage, useOpenChannel } from "./useCall";

/** The page of a call: DM and group calls, or a server voice channel */
export function callPath(channel: Pick<Channel, "id" | "type">) {
  return channel.type === "DirectMessage" || channel.type === "Group"
    ? ({ pathname: "/call/[id]", params: { id: channel.id } } as const)
    : ({ pathname: "/voice/[id]", params: { id: channel.id } } as const);
}

/** The conversation on screen now (kept by the overlay), so a call opens over it */
let openChannel: string | undefined;
function setOpenChannel(id: string | undefined) {
  openChannel = id;
}

/** Who is signed in (kept by the overlay, which has the client) */
let selfId: () => string | undefined = () => undefined;

/**
 * The call buttons of a DM or group header: a new call that would ring the
 * others asks first ("Start a call?"); a call somebody is in already, or
 * one ringing this account, is joined at once; the call this phone is in
 * just opens.
 */
export function startCall(channel: Channel, video = false) {
  const self = selfId();
  const s = callStore.get();
  const choice = callStart({
    channelId: channel.id,
    callChannel: s.status === "idle" ? undefined : s.channelId,
    othersInCall: [...channel.voiceParticipants.keys()].some((id) => id !== self),
    ringingMe: rings.get().incoming.some((ring) => ring.channelId === channel.id),
  });
  if (choice === "open") openCallView(channel.id);
  else if (choice === "join") beginCall(channel, video);
  else askToCall(channel.id, video);
}

/**
 * Start or join a DM or group call (the confirmed start and the incoming
 * call's Accept): the call screen opens over the conversation, which stays
 * underneath. Accepting from another page opens the conversation under the
 * call first, so minimising lands in it.
 */
function beginCall(channel: Channel, video = false) {
  closeCallAsk();
  const dm = channel.type === "DirectMessage" || channel.type === "Group";
  if (dm && openChannel !== channel.id) router.push({ pathname: "/channel/[id]", params: { id: channel.id } });
  openCallView(channel.id);
  void call.join(channel, { video });
}

/**
 * Everything of a call that is not a voice channel's page, mounted once for
 * the signed-in app: the gateway wiring, the full call screen over the app,
 * the floating pill while it is minimised, the incoming call screen and the
 * caller's "nobody answered".
 */
export function CallOverlay() {
  const client = useClient();
  const onScreen = useOpenChannel();
  useEffect(() => setOpenChannel(onScreen), [onScreen]);

  // the call screen follows the call: a move, how it ended, then it closes
  useEffect(() => followCall(), []);

  useEffect(() => {
    const detach = call.attach(client);
    selfId = () => client.user?.id;
    call.onRoomMade = (room) => router.replace(callPath(room));
    // ringing events are not handed on by the SDK on the phone yet: read
    // them from the gateway
    const events = client.events as unknown as { on(e: "event", fn: (ev: unknown) => void): void; off(e: "event", fn: (ev: unknown) => void): void };
    const onEvent = (event: unknown) => {
      if (isRingEvent(event)) receiveRingEvent(event, client.user?.id);
    };
    events.on("event", onEvent);
    client.on("logout", resetRings);
    client.on("logout", closeCallView);
    client.on("logout", closeCallAsk);
    return () => {
      detach();
      call.onRoomMade = undefined;
      events.off("event", onEvent);
      client.off("logout", resetRings);
      client.off("logout", closeCallView);
      client.off("logout", closeCallAsk);
      selfId = () => undefined;
    };
  }, [client]);

  // the caller's side: nobody answered, or everyone declined
  useEffect(
    () =>
      rings.subscribe(() => {
        const out = rings.get().outgoing;
        const s = callStore.get();
        if (!out || out.channelId !== s.channelId) return;
        const outcome = outgoingOutcome(out);
        if (!outcome) return;
        const channel = client.channels.get(out.channelId);
        const other = channel?.type === "DirectMessage" ? (channel.recipient?.displayName ?? channel.recipient?.username) : undefined;
        call.endWithNotice({ kind: outcome, name: other });
      }),
    [client],
  );

  return (
    <>
      <CallScreenHost />
      <CallPill />
      <CallNoticeBanner />
      <StartCallDialog />
      <IncomingCall />
      <OutgoingRingtone />
    </>
  );
}

/**
 * The full call screen over the app (DM and group calls, and any call
 * reopened from the pill). It slides up over the conversation and back
 * down when minimised (a fade with reduce motion); Android Back minimises.
 * Not drawn on the call's own page, which shows the call itself.
 */
function CallScreenHost() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const view = useStoreFields(callView, ["channelId", "expanded"] as const);
  const channel = useChannel(view.channelId);
  const phase = useCallPhase(view.channelId);
  const onCallPage = useOnCallPage(view.channelId);
  const open = screenVisible({ phase, expanded: view.expanded, onCallPage }) && !!channel;
  const [shown, setShown] = useState<string | undefined>(open ? view.channelId : undefined);
  if (open && shown !== view.channelId) setShown(view.channelId);
  const shownChannel = useChannel(shown);
  const y = useSharedValue(open ? 0 : 1);
  const fade = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (open) {
      if (reduce) {
        y.set(0);
        fade.set(withTiming(1, { duration: FADE_MS }));
      } else {
        fade.set(1);
        y.set(withSpring(0, SHEET_SPRING));
      }
      return;
    }
    if (reduce) fade.set(withTiming(0, { duration: FADE_MS }));
    else y.set(withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => setShown(undefined), (reduce ? FADE_MS : 260) + 40);
    return () => clearTimeout(timer);
  }, [open, reduce, y, fade]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      minimiseCallView();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const slide = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateY: y.get() * 900 }] }));
  if (!shown || !shownChannel) return null;
  return (
    <Animated.View
      testID="call-screen"
      pointerEvents={open ? "auto" : "none"}
      accessibilityViewIsModal={open}
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.frame, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }, slide]}
    >
      <InCall channel={shownChannel} mode="overlay" />
    </Animated.View>
  );
}

/**
 * "Start a call?" (web dialog look: the kit's ConfirmDialog): the call's
 * name, one line on what happens, Start a call (or Start a video call) and
 * Cancel. Starting taps the phone once; Cancel leaves no call behind.
 */
function StartCallDialog() {
  const { t } = useLingui();
  const ask = useStore(callAsk, (a) => a);
  const channel = useChannel(ask?.channelId);
  const name = useCallName(channel);
  // signed out or the conversation is gone: nothing to ask about
  useEffect(() => {
    if (ask && !channel) closeCallAsk();
  }, [ask, channel]);
  if (!ask || !channel) return null;
  return (
    <ConfirmDialog
      visible
      danger={false}
      title={name}
      text={t`No one is here yet. Start the call and others can join.`}
      confirm={ask.video ? t`Start a video call` : t`Start a call`}
      onClose={closeCallAsk}
      onConfirm={() => {
        haptics.medium();
        beginCall(channel, ask.video);
      }}
    />
  );
}

/** "Nobody answered." and the like, after the call ended */
function CallNoticeBanner() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const notice = useStore(callStore, (s) => (s.status === "idle" ? s.notice : undefined));
  const onScreen = useStore(callView, (v) => !!v.ended && v.expanded);
  if (!notice || notice.kind === "reconnected" || onScreen) return null;
  const other = notice.name;
  const message =
    notice.kind === "declined" ? (other ? t`${other} declined the call.` : t`Everyone declined the call.`) : other ? t`${other} didn't answer.` : t`Nobody answered.`;
  return (
    <View pointerEvents="none" style={{ position: "absolute", start: 16, end: 16, bottom: insets.bottom + 88, alignItems: "center" }}>
      <View testID="voice-call-notice" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: palette.floating, borderWidth: 1, borderColor: palette.popoverBorder }}>
        <AText size={14} line={20} weight="medium" color={palette.fg}>
          {message}
        </AText>
      </View>
    </View>
  );
}

/**
 * Someone is calling (web: CallRinging IncomingCallCard): a full screen
 * card over the app with Decline, Accept with video and Accept, and the
 * phone vibrating while it rings. Its own Modal, so it is the top window
 * even over an open sheet (every sheet is a Modal, a separate native
 * window); Android Back does nothing while it rings (answer or decline).
 */
function IncomingCall() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const insets = useSafeAreaInsets();
  const inCall = useStore(callStore, (s) => (s.status === "idle" ? undefined : s.channelId));
  const ring = useStore(rings, (r) => {
    // ringing for the call this phone is already in is not shown
    const open = r.incoming.filter((one) => one.channelId !== inCall && !!client.channels.get(one.channelId));
    return open.at(-1);
  });
  const channel = useChannel(ring?.channelId);
  const caller = ring ? client.users.get(ring.initiatorId) : undefined;
  const callerName = useFields(caller, (u) => u.displayName ?? u.username) ?? "";
  const info = useFields(channel, (c) => ({ group: c.type === "Group", name: c.name ?? "", icon: c.iconURL }));
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    if (!ring) return;
    // a voice note or video playing stops for the ring
    playback.pauseCurrent();
    Vibration.vibrate([0, 800, 1200], true);
    // the ringtone stays quiet on the silent switch unless a call is running
    const stop = loopSound("ringtoneIncoming", callStore.get().status !== "idle");
    return () => {
      stop();
      Vibration.cancel();
    };
  }, [ring]);

  if (!ring || !channel || !info) return null;
  const group = info.group;
  const name = group ? info.name : callerName;

  const accept = (video = false) => {
    if (busy === ring.channelId) return;
    setBusy(ring.channelId);
    dismissIncomingRing(ring.channelId);
    beginCall(channel, video);
  };
  const decline = () => {
    const self = client.user?.id;
    if (!self || busy === ring.channelId) return;
    setBusy(ring.channelId);
    dismissIncomingRing(ring.channelId);
    // the server tells the caller and this account's other devices
    void client.api.put(`/channels/${ring.channelId as ""}/end_ring/${self as ""}`).catch((error: unknown) => console.warn("[calls] decline did not reach the server", error));
  };

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={["portrait", "portrait-upside-down", "landscape", "landscape-left", "landscape-right"]}
      // Back must not slip past the ring to the screen underneath
      onRequestClose={() => undefined}
    >
    <GestureRoot>
    <View
      testID="incoming-call"
      accessibilityViewIsModal
      accessibilityRole="alert"
      accessibilityLabel={name}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        backgroundColor: palette.frame,
        paddingTop: insets.top + 64,
        paddingBottom: insets.bottom + 48,
        paddingHorizontal: 24,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ alignItems: "center", gap: 14 }}>
        {group ? <Avatar url={info.icon} name={name} size={112} /> : <UserAvatar user={caller} size={112} />}
        <AText autoDir size={24} line={32} weight="bold" color={palette.header} style={{ textAlign: "center" }} numberOfLines={2}>
          {name}
        </AText>
        <AText size={16} line={22} color={palette.muted} style={{ textAlign: "center" }}>
          {group ? t`${String(callerName)} is calling the group` : t`is calling you`}
        </AText>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", alignSelf: "stretch" }}>
        <RingButton testID="ring-decline" label={t`Decline`} icon="phone-disconnect" fill={palette.dangerFill} color={palette.onAccent} onPress={decline} />
        <RingButton testID="ring-video" label={t`Accept with video`} icon="video-camera" fill={palette.tonal} color={palette.fg} onPress={() => accept(true)} />
        <RingButton testID="ring-accept" label={t`Accept`} icon="phone" fill={palette.online} color="#0D0E16" onPress={() => accept()} />
      </View>
    </View>
    </GestureRoot>
    </Modal>
  );
}

/** The caller hears the ring while the others' phones ring (web: CallRinging) */
function OutgoingRingtone() {
  const ringing = useStore(rings, (r) => (r.outgoing?.ringing.length ? r.outgoing.channelId : undefined));
  const inThatCall = useStore(callStore, (s) => s.status === "connected" && s.channelId === ringing);
  useEffect(() => {
    if (!ringing || !inThatCall) return;
    return loopSound("ringtoneOutgoing", true);
  }, [ringing, inThatCall]);
  return null;
}

function RingButton({ label, icon, fill, color, onPress, testID }: { label: string; icon: "phone" | "phone-disconnect" | "video-camera"; fill: string; color: string; onPress: () => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 8, width: 96 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: fill, transform: [{ scale: pressed ? 0.94 : 1 }] })}
      >
        <Icon name={icon} size={28} color={color} />
      </Pressable>
      <AText size={13} line={18} weight="medium" color={palette.fg2} style={{ textAlign: "center" }} numberOfLines={2}>
        {label}
      </AText>
    </View>
  );
}
