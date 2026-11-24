/**
 * A nameplate behind a member row, as the web draws it (MemberSidebar
 * `nameplateLayer` and decorations.css `.z-plate`). Pure maths, so the row
 * and its tests agree.
 */
import { isCommunityRef, nameplateUrl, type UserStyle } from "@/ui/designs/style";

/** Height of a member row (web --z-member-row-height) */
export const MEMBER_ROW = 44;

/** Shape of every nameplate (web NAMEPLATE_RATIO "448 / 84") */
export const PLATE_RATIO = 448 / 84;

/**
 * Where the plate sits in its row: the row's height less 3 px above and
 * below (two plated rows never touch), 8 px from the row's end, at the art's
 * own shape, and never wider than the row less 8 px on each side.
 */
export function plateFrame(row: number = MEMBER_ROW, rowWidth?: number) {
  const height = row - 6;
  const natural = height * PLATE_RATIO;
  const width = rowWidth === undefined ? natural : Math.max(0, Math.min(natural, rowWidth - 16));
  return { top: 3, end: 8, height, width, radius: 10 };
}

/**
 * The web's mask (`--z-plate-fade`): how much of the plate shows from its
 * start (0) to its middle (0.5); whole from there to the emblem end. A faint
 * trace under the avatar and the name, coming in on an ease-in curve.
 */
export const PLATE_FADE: readonly (readonly [number, number])[] = [
  [0, 0.02],
  [0.0625, 0.02],
  [0.125, 0.04],
  [0.1875, 0.08],
  [0.25, 0.15],
  [0.3125, 0.27],
  [0.375, 0.45],
  [0.4375, 0.7],
  [0.5, 1],
];

/**
 * A phone has no CSS mask over an SVG picture, so the same fade is drawn as a
 * cover in the colour under the row, laid over the plate: where the mask
 * shows 2 % of the plate the cover hides 98 %. Stops run left to right in
 * screen space; in right-to-left the plate's start (its faint side) is on the
 * right, as the web turns the mask's angle to 270deg.
 */
export function plateCoverStops(rtl: boolean): { offset: number; opacity: number }[] {
  const ltr = PLATE_FADE.map(([offset, shown]) => ({ offset, opacity: round(1 - shown) }));
  if (!rtl) return ltr;
  return ltr.map((stop) => ({ offset: round(1 - stop.offset), opacity: stop.opacity })).reverse();
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The plate's picture. Built-in plates keep their emblem at the row's end,
 * which is the other side in right-to-left: the web asks for the file's
 * right-to-left copy (`?rtl#rtl`, its own address so the left-to-right copy
 * is not reused). Community plates are pictures and stay as they are.
 */
export function plateSource(style: UserStyle | undefined, cdn: string | undefined, rtl: boolean): string | undefined {
  if (!style?.nameplate) return undefined;
  const url = nameplateUrl(style, cdn);
  if (!url) return undefined;
  return rtl && !isCommunityRef(style.nameplate) ? `${url}?rtl#rtl` : url;
}

/**
 * The words on a plate (web --z-plate-ink and --z-plate-ink-halo): white
 * with a dark halo on dark themes, the theme's ink with a light halo on
 * light ones, so a name reads where the plate is faint and where it is not.
 */
export function plateInk(dark: boolean, lightInk: string) {
  return dark
    ? { color: "#FFFFFF", halo: "rgba(0,0,0,0.7)", radius: 4 }
    : { color: lightInk, halo: "rgba(255,255,255,0.95)", radius: 6 };
}

/**
 * A member row's box (web MenuButton on a phone): a 44 px row whose painted
 * box is 36 px high (4 px above and under take the touch). In the channel
 * details' filled box (web ChannelDetailsPhone `Members`) the row lines up
 * with the invite row: 6 px in, 8 px padding, 12 px between picture and
 * name, radius 12. Elsewhere (the member page, web sidebar): 8 px in, 14 px
 * at the start, 8 at the end, 8 px gap, radius 10.
 */
export function memberRowBox(boxed: boolean) {
  return boxed
    ? { margin: 6, padStart: 8, padEnd: 8, gap: 12, radius: 12, inset: 4 }
    : { margin: 8, padStart: 14, padEnd: 8, gap: 8, radius: 10, inset: 4 };
}
