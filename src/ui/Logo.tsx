import { SvgXml } from "react-native-svg";

// Logo version B ("02-laugh-B"), copied unchanged from the project's
// master artwork 02-laugh-B-white.svg
// (see assets/logo/). Only the fill is swapped for the ink variant.
import { LOGO_B_PATH } from "./logoPath";

/** Zrzur's controller face (version B), white on dark surfaces */
export function Logo({
  size = 64,
  color = "#FFFFFF",
  label,
}: {
  size?: number;
  color?: string;
  /** Screen-reader name; leave out when the name is written next to it */
  label?: string;
}) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="${color}" fill-rule="evenodd" d="${LOGO_B_PATH}"/></svg>`;
  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      {...(label ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label } : {})}
    />
  );
}
