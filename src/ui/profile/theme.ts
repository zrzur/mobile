/**
 * A profile's own colours (web profileTheme.ts `readableTheme`): the two
 * colours the person picked, deepened toward the app's darkest surface until
 * light text reads on every point of the gradient, with solid tints for the
 * secondary text, lines and chips. Pure functions, no React.
 */

const AA = 4.5;
const SECONDARY = 0.92;
const MUTED = 0.84;
const CHIP = 0.24;
const INK = "#FFFFFF";
const SHADE = "#000000";
/** Every theme is deepened this far, toward the app's darkest surface */
const DEEPEN_TO = "#11121C";
const DEEPEN = 0.22;

export const HEX = /^#[0-9a-f]{6}$/i;

const channels = (colour: string) => [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));

const hexOf = (value: number[]) => `#${value.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** `amount` of `to` over `from`, as a translucent layer would paint it */
export function mixColours(from: string, to: string, amount: number) {
  const end = channels(to);
  return hexOf(channels(from).map((n, i) => n + (end[i] - n) * amount));
}

function luminance(colour: string) {
  const [r, g, b] = channels(colour).map((n) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours */
export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Points along a gradient: its darkest point may lie between the ends */
export const along = (top: string, bottom: string) => [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((t) => mixColours(top, bottom, t));

const weakest = (ink: string, amount: number, surfaces: string[]) => Math.min(...surfaces.map((surface) => contrast(mixColours(surface, ink, amount), surface)));

export type ProfileColours = {
  top: string;
  bottom: string;
  /** all text on the card */
  ink: string;
  /** secondary text (web --z-fg-secondary inside the card) */
  ink2: string;
  /** labels, the tag, the dot (web --profile-ink-2) */
  muted: string;
  /** lines between sections, chip borders */
  line: string;
  /** chips and fields: the darker tint of the chosen colours */
  chip: string;
  chipPressed: string;
  /** the status bubble across the banner's edge */
  bubble: string;
  /** a banner without a picture: a breath of the ink over the gradient */
  banner: string;
};

/**
 * The chosen colours made readable (web `readableTheme` + `createProfileTheme`).
 * The see-through tints of the web are painted here as solid colours over the
 * middle of the gradient, the weakest point the text is checked against.
 */
export function profileColours(chosen: string[] | undefined): ProfileColours | null {
  if (!chosen?.length || !chosen.every((c) => HEX.test(c))) return null;
  const first = chosen[0];
  const last = chosen[chosen.length - 1];
  let top = first;
  let bottom = last;
  for (let deepen = DEEPEN; deepen <= 1; deepen += 0.02) {
    top = mixColours(first, DEEPEN_TO, deepen);
    bottom = mixColours(last, DEEPEN_TO, deepen);
    // the web's check, and the solid muted text held to AA on every point
    const muted = mixColours(mixColours(top, bottom, 0.5), INK, MUTED);
    if (weakest(INK, MUTED, along(top, bottom)) >= AA && Math.min(...along(top, bottom).map((s) => contrast(muted, s))) >= AA) break;
  }
  const middle = mixColours(top, bottom, 0.5);
  return {
    top: top.toUpperCase(),
    bottom: bottom.toUpperCase(),
    ink: INK,
    ink2: mixColours(middle, INK, SECONDARY),
    muted: mixColours(middle, INK, MUTED),
    line: mixColours(middle, INK, 0.12),
    chip: mixColours(middle, SHADE, CHIP),
    chipPressed: mixColours(middle, SHADE, CHIP * 1.5),
    bubble: mixColours(top, SHADE, CHIP),
    banner: mixColours(top, INK, 0.04),
  };
}

/** The lowest contrast of a text colour anywhere on a profile's gradient */
export function weakestOn(text: string, colours: ProfileColours) {
  return Math.min(...along(colours.top, colours.bottom).map((s) => contrast(text, s)));
}
