/** Pure keyboard maths (worklets), kept apart from kit/keyboard so tests need no reanimated */

/**
 * The bottom padding of a bar that rides on the keyboard.
 * - `keyboard`: the keyboard's height over the screen bottom (0 when down)
 * - `safe`: the home indicator / navigation bar inset
 * - `inset`: how far the bar's container already ends above the screen bottom
 *   (a SafeAreaView with the bottom edge: the safe inset)
 * - `gap`: the bar's own bottom padding
 */
export function footerPadding(keyboard: number, safe: number, inset: number, gap: number): number {
  "worklet";
  return Math.max(0, Math.max(keyboard, safe) - inset) + gap;
}

/** How far a screen's content must end above its bottom edge so the keyboard does not cover it */
export function keyboardLift(keyboard: number, inset: number): number {
  "worklet";
  return Math.max(0, keyboard - inset);
}
