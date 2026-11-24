/**
 * The numbers behind SwipeRow (pure worklets, unit tested). Offsets are
 * "logical": positive = the row moved toward the end side (start actions
 * show), negative = toward the start side (end actions show). The view
 * mirrors them in RTL.
 */

/** Width of one action button (px) */
export const ACTION_WIDTH = 76;
/** Past this share of the row's width a full swipe commits the edge action */
export const FULL_SWIPE = 0.55;
/** Fling speed (px/s) that opens or closes */
export const SWIPE_FLING = 600;
/** Edge band (px) left to the system back-swipe */
export const BACK_EDGE = 24;

/** Logical offset from a screen translation */
export function logicalOffset(translationX: number, rtl: boolean) {
  "worklet";
  return rtl ? -translationX : translationX;
}

/** Where the row is drawn: free inside the open widths, resisting past them, stuck without actions */
export function swipeOffset(raw: number, startWidth: number, endWidth: number, rowWidth: number, fullStart: boolean, fullEnd: boolean) {
  "worklet";
  if (raw > 0) {
    if (!startWidth) return 0;
    const limit = fullStart ? rowWidth : startWidth;
    return raw <= limit ? raw : limit + (raw - limit) * 0.2;
  }
  if (!endWidth) return 0;
  const limit = fullEnd ? rowWidth : endWidth;
  return -raw <= limit ? raw : -(limit + (-raw - limit) * 0.2);
}

/** True while letting go would run the edge action */
export function fullSwipeArmed(offset: number, rowWidth: number) {
  "worklet";
  return rowWidth > 0 && Math.abs(offset) >= rowWidth * FULL_SWIPE;
}

/** Where a released row settles: the start-open width, the end-open width (negative), or 0 */
export function settleSwipe(offset: number, velocity: number, startWidth: number, endWidth: number) {
  "worklet";
  if (offset > 0 && startWidth) {
    if (velocity > SWIPE_FLING) return startWidth;
    if (velocity < -SWIPE_FLING) return 0;
    return offset > startWidth / 2 ? startWidth : 0;
  }
  if (offset < 0 && endWidth) {
    if (velocity < -SWIPE_FLING) return -endWidth;
    if (velocity > SWIPE_FLING) return 0;
    return -offset > endWidth / 2 ? -endWidth : 0;
  }
  return 0;
}
