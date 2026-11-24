import { memo } from "react";
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

import { ICONS, type IconName, type IconShape } from "./icons.generated";
import { isRTL } from "./kit/direction";

export type { IconName } from "./icons.generated";

/**
 * Icons that point somewhere turn around in right-to-left (web: the chevron
 * and arrow icons mirror under `:dir(rtl)`). Clocks, refresh arrows, pencils,
 * lists, media play/pause and logos keep their direction.
 */
export const MIRRORED = new Set<string>([
  "arrow-left",
  "arrow-right",
  "arrow-up-left",
  "arrow-bend-up-left",
  "arrow-bend-up-right",
  "arrow-u-up-left",
  "arrow-u-up-right",
  "caret-left",
  "caret-right",
  "caret-double-left",
  "caret-double-right",
  "paper-plane-tilt",
  "sign-in",
  "sign-out",
]);

const n = (v: string | number | undefined) => (v === undefined ? undefined : Number(v));

function Shape({ s, color }: { s: IconShape; color: string }) {
  const common = {
    stroke: s.stroke ?? color,
    strokeWidth: 1.5,
    strokeLinecap: s.cap,
    strokeLinejoin: s.join,
    fill: s.fill === "current" ? color : "none",
    fillRule: s.rule,
    clipRule: s.rule,
  } as const;
  switch (s.t) {
    case "path":
      return <Path d={String(s.d)} {...common} />;
    case "circle":
      return <Circle cx={n(s.cx)} cy={n(s.cy)} r={n(s.r)} {...common} />;
    case "ellipse":
      return <Ellipse cx={n(s.cx)} cy={n(s.cy)} rx={n(s.rx)} ry={n(s.ry)} {...common} />;
    case "rect":
      return <Rect x={n(s.x)} y={n(s.y)} width={n(s.width)} height={n(s.height)} rx={n(s.rx)} ry={n(s.ry)} {...common} />;
    case "line":
      return <Line x1={n(s.x1)} y1={n(s.y1)} x2={n(s.x2)} y2={n(s.y2)} {...common} />;
    case "polyline":
      return <Polyline points={String(s.points)} {...common} />;
    case "polygon":
      return <Polygon points={String(s.points)} {...common} />;
  }
}

/** The web app's icons (Hugeicons stroke rounded, 1.5 px) */
export const Icon = memo(function Icon({ name, size = 20, color, mirror }: { name: IconName; size?: number; color: string; /** override the list (true = always flip in RTL) */ mirror?: boolean }) {
  const flip = (mirror ?? MIRRORED.has(name)) && isRTL();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
      aria-hidden
    >
      {(ICONS[name] as readonly IconShape[]).map((s, i) => (
        <Shape key={i} s={s} color={color} />
      ))}
    </Svg>
  );
});
