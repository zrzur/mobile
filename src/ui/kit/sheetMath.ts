/**
 * The numbers behind Sheet v2 (pure worklets, unit tested).
 *
 * Positions are the sheet's downward offset in px: 0 = fully up at its
 * tallest detent, `closed` = just off the bottom of the screen. Snap points
 * are sorted from the top (smallest offset) down.
 */

/** Fling speed (px/s) that moves one detent, or dismisses from the lowest */
export const FLING_VELOCITY = 800;
/** Past this share of the way from the lowest detent to closed, letting go dismisses */
export const DISMISS_FRACTION = 0.4;

/** iOS-style rubber band: the farther past the edge, the harder it pulls back */
export function rubberBand(overshoot: number, dimension: number, coefficient = 0.55) {
  "worklet";
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((overshoot * coefficient) / dimension + 1)) * dimension;
}

/** Offsets for each detent (fractions of the available height, any order) */
export function detentOffsets(detents: number[], available: number) {
  "worklet";
  const sorted = [...detents].map((d) => Math.min(1, Math.max(0.1, d))).sort((a, b) => b - a);
  const tallest = sorted[0] * available;
  return sorted.map((d) => Math.round(tallest - d * available));
}

/**
 * Where a released drag goes: an index into `points`, or -1 to dismiss.
 * A fling moves one step in its direction; otherwise the nearest point,
 * except that past DISMISS_FRACTION below the lowest point it dismisses.
 */
export function pickSnap(position: number, velocity: number, points: number[], closed: number): number {
  "worklet";
  if (points.length === 0) return -1;
  const last = points.length - 1;
  if (velocity > FLING_VELOCITY) {
    for (let i = 0; i <= last; i++) if (points[i] > position + 1) return i;
    return -1;
  }
  if (velocity < -FLING_VELOCITY) {
    for (let i = last; i >= 0; i--) if (points[i] < position - 1) return i;
    return 0;
  }
  const lowest = points[last];
  if (position > lowest + (closed - lowest) * DISMISS_FRACTION) return -1;
  let best = 0;
  for (let i = 1; i <= last; i++) if (Math.abs(points[i] - position) < Math.abs(points[best] - position)) best = i;
  return best;
}

/** Where the sheet is drawn for a drag that started at `start` and moved `dy` */
export function dragPosition(start: number, dy: number, top: number, closed: number) {
  "worklet";
  const next = start + dy;
  if (next < top) return top - rubberBand(top - next, closed);
  return next;
}
