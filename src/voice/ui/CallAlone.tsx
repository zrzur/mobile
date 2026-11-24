import { useLingui } from "@lingui/react/macro";
import type { Channel } from "@zrzur/sdk/solid";
import { type ReactNode, useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useClient } from "@/client/ClientProvider";
import { useFields } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { UserAvatar } from "@/ui/Avatar";
import { useReduceMotion } from "@/ui/kit/motion";

import { CALL_EDGE } from "../layout";
import { rings } from "../ringing";
import { useStore } from "../store";
import { aloneFaces, waitingFor } from "../viewLogic";

const FACE = 40;

/**
 * Under your own tile while you are alone in a DM or group call: the
 * others' pictures, dimmed until they join (a soft ring around the ones
 * whose phones ring; still with reduce motion), and one line that says the
 * call stays open for them. VoiceOver reads it as one sentence.
 */
export function CallAlone({ channel, selfId }: { channel: Channel; selfId: string | undefined }) {
  const { t } = useLingui();
  const { palette } = useTheme();
  const client = useClient();
  const facts = useFields(channel, (c) => ({ members: [...c.recipientIds], inCall: [...c.voiceParticipants.keys()] }));
  const ringing = useStore(rings, (r) => (r.outgoing?.channelId === channel.id ? r.outgoing.ringing.join(",") : ""));
  const waiting = waitingFor(facts?.members ?? [], facts?.inCall ?? [], selfId);
  const { shown, more } = aloneFaces(waiting.length);
  const ringingIds = ringing ? ringing.split(",") : [];
  const line = t`Only you are here. The others can join while you stay in the call.`;
  const calling = ringingIds.length > 0;

  return (
    <View
      testID="call-alone"
      accessible
      accessibilityRole="text"
      accessibilityLabel={calling ? `${line} ${t`Calling…`}` : line}
      accessibilityLiveRegion="polite"
      style={{ alignItems: "center", gap: 12, paddingHorizontal: CALL_EDGE + 8, paddingTop: 16, paddingBottom: 8 }}
    >
      {shown ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {waiting.slice(0, shown).map((id) => (
            <Face key={id} ringing={ringingIds.includes(id)}>
              <UserAvatar user={client.users.get(id)} size={FACE} />
            </Face>
          ))}
          {more ? (
            <View style={{ width: FACE, height: FACE, borderRadius: FACE / 2, alignItems: "center", justifyContent: "center", backgroundColor: palette.tonal, opacity: 0.6 }}>
              <AText size={13} line={18} weight="semibold" color={palette.fg2}>{`+${more}`}</AText>
            </View>
          ) : null}
        </View>
      ) : null}
      <AText testID="call-alone-line" size={15} line={22} weight="medium" color={palette.fg2} style={{ textAlign: "center", maxWidth: 360 }}>
        {line}
      </AText>
      {calling ? (
        <AText size={13} line={18} weight="medium" color={palette.muted} style={{ textAlign: "center" }}>
          {t`Calling…`}
        </AText>
      ) : null}
    </View>
  );
}

/** One waiting person: dimmed, with a soft pulse while their phone rings */
function Face({ ringing, children }: { ringing: boolean; children: ReactNode }) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!ringing || reduce) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(pulse);
  }, [ringing, reduce, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.get()), transform: [{ scale: 1 + pulse.get() * 0.3 }] }));
  return (
    <View style={{ width: FACE + 12, height: FACE + 12, alignItems: "center", justifyContent: "center" }}>
      {ringing ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", width: FACE + 8, height: FACE + 8, borderRadius: (FACE + 8) / 2, borderWidth: 2, borderColor: palette.online }, reduce ? { opacity: 0.5 } : ring]}
        />
      ) : null}
      <View style={{ opacity: 0.5 }}>{children}</View>
    </View>
  );
}
