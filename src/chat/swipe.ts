/**
 * Swipe a message sideways to reply (web: swipeToReply.ts). The pull goes
 * toward the start side (left in English, right in Arabic):
 *
 *   12 px  the row follows the finger
 *   64 px  armed (the arrow fills, one short buzz)
 *   let go armed: reply; otherwise the row goes back
 */

export const PULL_START = 12;
export const PULL_ARMED = 64;
export const PULL_MAX = 88;
/** More up-or-down movement than this before the pull starts: it is a scroll */
export const SCROLL_SLOP = 10;

/** How far the row is drawn for a pull: 1:1, then harder and harder */
export function rowOffset(pull: number) {
  "worklet";
  if (pull <= 0) return 0;
  if (pull <= PULL_ARMED) return pull;
  return Math.min(PULL_MAX, PULL_ARMED + (pull - PULL_ARMED) * 0.35);
}

/** How far the finger went in the reply direction (px, never negative) */
export function pullDistance(translationX: number, rtl: boolean) {
  "worklet";
  return Math.max(0, rtl ? translationX : -translationX);
}
