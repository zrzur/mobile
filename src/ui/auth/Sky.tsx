import { memo, useEffect, useMemo, useState } from "react";
import { I18nManager, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";

import { type Bird, SKY_H, SKY_W, skyFlock, skyLayers, skyPath, skyScattered } from "./flock";

const AnimatedG = Animated.createAnimatedComponent(G);

const FLOCK = skyFlock();
const SCATTERED = skyScattered();
const LAYERS = skyLayers(FLOCK);
const ease = Easing.bezierFn(0.2, 0, 0, 1);

/** The fly-in plays once per app session, like on the web */
let flownIn = false;

function FlyingBird({ bird, from, index, progress }: { bird: Bird; from: Bird; index: number; progress: SharedValue<number> }) {
  const d = useMemo(() => skyPath([{ x: 0, y: 0, r: bird.r, o: 1 }], -0.45), [bird.r]);
  const animatedProps = useAnimatedProps(() => {
    const ms = progress.value * 800 - (index % 24) * 8;
    const move = ease(Math.min(1, Math.max(0, ms / 560)));
    const fade = Math.min(1, Math.max(0, ms / 320));
    return {
      opacity: fade * bird.o,
      transform: [
        { translateX: from.x + (bird.x - from.x) * move },
        { translateY: from.y + (bird.y - from.y) * move },
      ],
    } as object;
  });
  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path d={d} />
    </AnimatedG>
  );
}

/**
 * Birds behind the top of the auth pages (fg-muted). Not interactive and
 * hidden from screen readers; mirrored in right-to-left.
 */
export const Sky = memo(function Sky({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const [flying, setFlying] = useState(() => !flownIn && !reduced);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!flying) return;
    flownIn = true;
    progress.value = withTiming(1, { duration: 800, easing: Easing.linear });
    const done = setTimeout(() => setFlying(false), 800);
    return () => clearTimeout(done);
  }, [flying, progress]);

  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[StyleSheet.absoluteFill, I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SKY_W} ${SKY_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <G fill={color}>
          {flying
            ? FLOCK.map((bird, i) => (
                <FlyingBird key={i} bird={bird} from={SCATTERED[i]} index={i} progress={progress} />
              ))
            : LAYERS.map((layer) => (
                <Path key={layer.opacity} d={layer.d} fillOpacity={layer.opacity} />
              ))}
        </G>
      </Svg>
    </View>
  );
});
