/**
 * The call screen's phone layout, as the web draws it on a phone (web:
 * channels/voice/phoneCall.css and callCard/ParticipantTile.tsx). Pure maths
 * so it is unit tested.
 */

/** Below this width the phone layout applies (web: the phone breakpoint) */
export const PHONE_MAX_WIDTH = 600;

/** Side padding of the tile area and the call bar (web: 14 px) */
export const CALL_EDGE = 14;
/** Space between tiles (web: 10 px) */
export const TILE_GAP = 10;

export type TileBox = { width: number; height: number };

/**
 * Each tile's size on a phone `width` wide:
 * - one person: full width, 1 : 0.9;
 * - two people: one above the other, full width, 1 : 0.7;
 * - more: the first across (1 : 0.62), the rest two side by side (1 : 1.05).
 */
export function phoneTiles(count: number, width: number): TileBox[] {
  const inner = Math.max(0, width - CALL_EDGE * 2);
  const box = (w: number, ratio: number): TileBox => ({ width: Math.floor(w), height: Math.floor(w * ratio) });
  if (count <= 0) return [];
  if (count === 1) return [box(inner, 0.9)];
  if (count === 2) return [box(inner, 0.7), box(inner, 0.7)];
  const half = (inner - TILE_GAP) / 2;
  return [box(inner, 0.62), ...Array.from({ length: count - 1 }, () => box(half, 1.05))];
}

/**
 * A steady hue for a person: the same id always gets the same tint. Kept
 * between teal and magenta (180 to 359); dark yellows and greens look muddy
 * (web: tileHue).
 */
export function tileHue(id: string): number {
  let sum = 0;
  for (let index = 0; index < id.length; index++) sum = (sum * 31 + id.charCodeAt(index)) % 360;
  return 180 + (sum % 180);
}

/** An OKLCH colour as sRGB hex (CSS Color 4 conversion, clipped to the gamut) */
export function oklchToHex(l: number, c: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const channel = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${linear.map(channel).join("")}`.toUpperCase();
}

/** A person's tile colour on a phone (web: oklch(0.3 0.07 hue)) */
export function tileTint(id: string): string {
  return oklchToHex(0.3, 0.07, tileHue(id));
}

/**
 * The call bar on a phone (web: phoneCall.css): one bar `width - 28` wide,
 * 12 px inside, 8 px between buttons; 52 px buttons and a 64 px hang up.
 * With more buttons than fit, they shrink together, never below 44 px.
 *
 * @param count Buttons in the bar, hang up included
 */
export function barButtons(count: number, width: number): { size: number; hangUp: number } {
  const inner = Math.min(width, PHONE_MAX_WIDTH) - CALL_EDGE * 2 - 12 * 2;
  const gaps = 8 * Math.max(0, count - 1);
  // the hang up is 12 px wider than the others
  const fit = Math.floor((inner - gaps - 12) / Math.max(1, count));
  const size = Math.max(44, Math.min(52, fit));
  return { size, hangUp: size + 12 };
}
