import { Image } from "expo-image";
import { memo, useState } from "react";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture, useExclusiveGestures } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const MAX_SCALE = 5;

/**
 * One image at full size: pinch to zoom (1×–5×), drag while zoomed, double
 * tap to zoom in or back out. Runs on the UI thread, so it stays smooth on
 * weak phones. `onZoom` says when the image leaves or returns to 1× (the
 * pager stops paging while zoomed).
 */
export const ZoomableImage = memo(function ZoomableImage({
  uri,
  width,
  height,
  label,
  onZoom,
  onTap,
}: {
  uri: string;
  width: number;
  height: number;
  label?: string;
  onZoom: (zoomed: boolean) => void;
  onTap: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const zoom = (z: boolean) => {
    setZoomed(z);
    onZoom(z);
  };
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const clamp = (value: number, s: number, size: number) => {
    "worklet";
    const limit = Math.max(0, (size * s - size) / 2);
    return Math.min(limit, Math.max(-limit, value));
  };

  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    saved.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    scheduleOnRN(zoom, false);
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      "worklet";
      saved.value = scale.value;
    },
    onUpdate: (e) => {
      "worklet";
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, saved.value * e.scale));
    },
    onDeactivate: () => {
      "worklet";
      if (scale.value <= 1.02) reset();
      else {
        saved.value = scale.value;
        x.value = clamp(x.value, scale.value, width);
        y.value = clamp(y.value, scale.value, height);
        scheduleOnRN(zoom, true);
      }
    },
  });

  // only while zoomed: at 1× a sideways swipe belongs to the pager
  const pan = usePanGesture({
    enabled: zoomed,
    minPointers: 1,
    maxPointers: 2,
    onActivate: () => {
      "worklet";
      startX.value = x.value;
      startY.value = y.value;
    },
    onUpdate: (e) => {
      "worklet";
      if (scale.value <= 1) return;
      x.value = clamp(startX.value + e.translationX, scale.value, width);
      y.value = clamp(startY.value + e.translationY, scale.value, height);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      "worklet";
      if (e.canceled) return;
      if (scale.value > 1) reset();
      else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
        scheduleOnRN(zoom, true);
      }
    },
  });

  const singleTap = useTapGesture({
    numberOfTaps: 1,
    onDeactivate: (e) => {
      "worklet";
      if (!e.canceled) scheduleOnRN(onTap);
    },
  });

  const gesture = useExclusiveGestures(doubleTap, singleTap, useSimultaneousGestures(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height, alignItems: "center", justifyContent: "center" }, style]}>
        <Image
          source={{ uri }}
          style={{ width, height }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </GestureDetector>
  );
});
