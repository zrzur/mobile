import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Avatar, UserAvatar } from "@/ui/Avatar";
import { Icon } from "@/ui/Icon";
import { useReduceMotion } from "@/ui/kit/motion";

import { call } from "../call";
import type { VoiceErrorKind } from "../logic";
import { useStore } from "../store";
import { callView } from "../view";
import type { CallPhase } from "../viewLogic";
import { BigButton } from "./parts";
import { useVoiceText } from "./text";
import { useCallName } from "./useCall";

const AVATAR = 120;

/**
 * The person (or group) of a DM call before anyone else is in it: their
 * picture large, the name and one line of state. Calling… with a soft
 * pulse (still with reduce motion), the build without voice with its note
 * and the join it cannot do, a failed join with Try again, and how the call
 * ended.
 */
export function CallHero({ channel, phase, error }: { channel: Channel; phase: CallPhase; error?: VoiceErrorKind }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const client = useClient();
  const reduce = useReduceMotion();
  const name = useCallName(channel);
  const info = useFields(channel, (c) => ({ group: c.type === "Group", icon: c.iconURL, recipient: c.type === "DirectMessage" ? c.recipient?.id : undefined }));
  const ended = useStore(callView, (v) => v.ended);

  const pulse = useSharedValue(0);
  const ringing = phase === "ringing";
  useEffect(() => {
    if (!ringing || reduce) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(pulse);
  }, [ringing, reduce, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.get()), transform: [{ scale: 1 + pulse.get() * 0.35 }] }));

  const other = ended?.name;
  const line =
    phase === "ringing"
      ? t`Calling…`
      : phase === "unavailable"
        ? t`Voice isn't available in this build.`
        : phase === "failed"
          ? text.error(error)
          : phase === "ended"
            ? ended?.kind === "declined"
              ? other
                ? t`${other} declined the call.`
                : t`Everyone declined the call.`
              : ended?.kind === "missed"
                ? other
                  ? t`${other} didn't answer.`
                  : t`Nobody answered.`
                : t`Call ended`
            : text.status(phase === "idle" ? "connecting" : (phase as "connecting"));
  const alert = phase === "failed" || phase === "ended";

  return (
    <ScrollView testID="call-hero" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 24 }}>
      <View style={{ width: AVATAR + 40, height: AVATAR + 40, alignItems: "center", justifyContent: "center" }}>
        {ringing ? (
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", width: AVATAR + 16, height: AVATAR + 16, borderRadius: (AVATAR + 16) / 2, borderWidth: 2, borderColor: palette.online }, reduce ? { opacity: 0.5 } : ring]}
          />
        ) : null}
        <View style={{ opacity: phase === "ended" ? 0.6 : 1 }}>
          {info?.recipient ? <UserAvatar user={client.users.get(info.recipient)} size={AVATAR} /> : <Avatar url={info?.icon} name={name} size={AVATAR} />}
        </View>
      </View>
      <AText autoDir size={26} line={32} weight="bold" color={palette.header} accessibilityRole="header" style={{ textAlign: "center" }} numberOfLines={2}>
        {name}
      </AText>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: 360 }}>
        {phase === "unavailable" ? <Icon name="info" size={18} color={palette.muted} /> : null}
        <AText
          testID={`call-hero-${phase}`}
          size={16}
          line={22}
          weight="medium"
          color={phase === "failed" ? palette.warningText : palette.muted}
          accessibilityRole={alert ? "alert" : undefined}
          accessibilityLiveRegion={alert ? "assertive" : "polite"}
          style={{ textAlign: "center", flexShrink: 1 }}
        >
          {line ?? ""}
        </AText>
      </View>
      {phase === "unavailable" ? (
        // the join this build cannot do, so it is clear what is missing
        <View style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", marginTop: 8 }}>
          <BigButton testID="voice-join" icon="phone" label={t`Start a call`} disabled onPress={() => undefined} />
        </View>
      ) : phase === "failed" ? (
        <View style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "center", marginTop: 8 }}>
          <BigButton
            testID="voice-retry"
            label={t`Try again`}
            onPress={() => {
              call.clearError();
              void call.join(channel);
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
