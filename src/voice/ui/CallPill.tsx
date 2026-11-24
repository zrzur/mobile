import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { type PanGesture, GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useChannel } from "@/client/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import { AText } from "@/ui/auth/parts";
import { Icon } from "@/ui/Icon";
import { isRTL } from "@/ui/kit/direction";
import { haptics } from "@/ui/kit/haptics";
import { SHEET_SPRING, useReduceMotion } from "@/ui/kit/motion";
import { PressScale } from "@/ui/kit/Press";

import { callStore } from "../call";
import { useStore, useStoreFields } from "../store";
import { callView, expandCallView } from "../view";
import { phaseInCall, type PillBounds, pillSnap, pillVisible } from "../viewLogic";
import { useVoiceText } from "./text";
import { useCallName, useCallPhase, useCallTimer, useOnCallPage } from "./useCall";

const EDGE = 12;
const HEIGHT = 52;

/**
 * The floating call pill while the call is minimised (a chat app's call
 * bubble, in Zrzur's look): who the call is with, the time or the state,
 * and a muted microphone mark. Tap it to go back to the call; drag it to
 * the other side or up and down out of the way (it settles against an
 * edge, below the header and above the composer). It stays on every page
 * until the call ends.
 */
export function CallPill() {
  const { t } = useLingui();
  const { palette } = useTheme();
  const text = useVoiceText();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const view = useStoreFields(callView, ["channelId", "expanded"] as const);
  const callChannel = useStore(callStore, (s) => (s.status === "idle" ? undefined : s.channelId));
  const channelId = view.channelId ?? callChannel;
  const channel = useChannel(channelId);
  const name = useCallName(channel);
  const phase = useCallPhase(channelId);
  const onCallPage = useOnCallPage(channelId);
  const visible = pillVisible({ phase, expanded: view.expanded, onCallPage });
  const timer = useCallTimer(visible && phaseInCall(phase));
  const muted = useStore(callStore, (s) => !(s.micOn && !s.deafen && s.canSpeak));
  const [pillWidth, setPillWidth] = useState(180);

  const bounds: PillBounds = {
    width,
    height,
    pillWidth,
    pillHeight: HEIGHT,
    // under the page header, above the composer and the tab bar
    top: insets.top + 60,
    bottom: height - insets.bottom - 150 - HEIGHT,
    edge: EDGE,
  };
  // distance from the start edge, and from the top
  const x = useSharedValue(Math.max(EDGE, width - 180 - EDGE));
  const y = useSharedValue(insets.top + 64);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rtl = isRTL();

  const settle = (pos: { x: number; y: number; vx: number; vy: number }) => {
    const to = pillSnap(pos, bounds);
    haptics.selection();
    if (reduce) {
      x.set(to.x);
      y.set(to.y);
    } else {
      x.set(withSpring(to.x, SHEET_SPRING));
      y.set(withSpring(to.y, SHEET_SPRING));
    }
  };
  const pan: PanGesture = usePanGesture({
    minDistance: 6,
    onActivate: () => {
      "worklet";
      startX.set(x.get());
      startY.set(y.get());
    },
    onUpdate: (e) => {
      "worklet";
      x.set(startX.get() + (rtl ? -e.translationX : e.translationX));
      y.set(startY.get() + e.translationY);
    },
    onDeactivate: (e) => {
      "worklet";
      scheduleOnRN(settle, { x: x.get(), y: y.get(), vx: rtl ? -e.velocityX : e.velocityX, vy: e.velocityY });
    },
  });
  const place = useAnimatedStyle(() => ({ top: y.get(), left: rtl ? width - pillWidth - x.get() : x.get() }));

  if (!visible || !channelId) return null;
  const line =
    phaseInCall(phase)
      ? timer
      : phase === "ringing"
        ? t`Calling…`
        : phase === "unavailable"
          ? t`Voice isn't available in this build.`
          : text.status(phase === "connecting" || phase === "reconnecting" || phase === "disconnected" ? phase : "connecting");
  const live = phaseInCall(phase);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID="call-pill"
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w && Math.abs(w - pillWidth) > 1) {
            setPillWidth(w);
            // keep it against its edge once its size is known
            if (x.get() > EDGE) x.set(Math.max(EDGE, width - w - EDGE));
          }
        }}
        style={[
          {
            position: "absolute",
            height: HEIGHT,
            maxWidth: Math.min(240, width - EDGE * 2),
            borderRadius: HEIGHT / 2,
            backgroundColor: palette.floating,
            borderWidth: 1,
            borderColor: palette.popoverBorder,
            shadowColor: palette.shadow,
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          },
          place,
        ]}
      >
        <PressScale
          testID="call-pill-open"
          accessibilityRole="button"
          accessibilityLabel={`${t`Return to call`}: ${name}`}
          accessibilityValue={line ? { text: muted ? `${line}, ${t`Muted`}` : line } : undefined}
          onPress={() => expandCallView(channelId)}
          haptic="light"
          scale={0.96}
          style={{ height: HEIGHT, flexDirection: "row", alignItems: "center", gap: 10, paddingStart: 8, paddingEnd: 16 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: palette.tonal }}>
            <Icon name="phone" size={18} color={live ? palette.onlineText : palette.fg} />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <AText autoDir size={14} line={18} weight="semibold" color={palette.fg} numberOfLines={1}>
              {name}
            </AText>
            <AText testID="call-pill-line" size={12} line={16} weight="medium" color={live ? palette.onlineText : palette.muted} numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
              {line ?? ""}
            </AText>
          </View>
          {muted ? (
            <View testID="call-pill-muted">
              <Icon name="microphone-slash" size={18} color={palette.danger} />
            </View>
          ) : null}
        </PressScale>
      </Animated.View>
    </GestureDetector>
  );
}
