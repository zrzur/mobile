import { Image } from "expo-image";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { isRTL } from "@/ui/kit/direction";

import { MEMBER_ROW, PLATE_RATIO, plateCoverStops, plateFrame } from "./plate";

/**
 * A nameplate behind a member row (web MemberSidebar `nameplateLayer` +
 * `.z-plate`): a rounded layer 3 px inside the row's height, at the row's end,
 * at the art's own shape, never wider than the row less 8 px each side. The
 * art fills it (`100% 100%`) and comes in from the start: a faint trace under
 * the avatar and the name, whole from the middle to the emblem.
 *
 * `ground` is the colour under the row (the page, or the filled box): the
 * web's mask is drawn here as a cover in that colour over the art.
 * Drawn under the row's pressable, so a pressed row's box covers it, as on
 * the web.
 */
export function MemberPlate({ uri, ground, row = MEMBER_ROW }: { uri: string; ground: string; row?: number }) {
  const frame = plateFrame(row);
  const rtl = isRTL();
  const id = `plate${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <View
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      // the row's width less 8 px each side: the plate keeps to its end and shrinks to fit
      style={{ position: "absolute", top: frame.top, height: frame.height, start: frame.end, end: frame.end, flexDirection: "row", justifyContent: "flex-end" }}
    >
      <View testID="member-plate" style={{ height: frame.height, aspectRatio: PLATE_RATIO, maxWidth: "100%", borderRadius: frame.radius, overflow: "hidden" }}>
        <Image source={{ uri }} recyclingKey={uri} cachePolicy="memory-disk" contentFit="fill" accessibilityIgnoresInvertColors style={StyleSheet.absoluteFill} />
        {/* a pixel past each edge, so no column of the art peeks out beside the cover */}
        <Svg width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", top: -1, bottom: -1, start: -1, end: -1 }}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {plateCoverStops(rtl).map((stop) => (
                <Stop key={stop.offset} offset={stop.offset} stopColor={ground} stopOpacity={stop.opacity} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
    </View>
  );
}
