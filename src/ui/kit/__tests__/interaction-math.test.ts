import { detentOffsets, DISMISS_FRACTION, dragPosition, pickSnap, rubberBand } from "../sheetMath";
import { ACTION_WIDTH, fullSwipeArmed, FULL_SWIPE, logicalOffset, settleSwipe, swipeOffset } from "../swipeMath";

describe("sheet math", () => {
  it("rubber-bands harder the farther past the edge", () => {
    expect(rubberBand(0, 600)).toBe(0);
    expect(rubberBand(-10, 600)).toBe(0);
    const a = rubberBand(50, 600);
    const b = rubberBand(100, 600);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(50);
    expect(b - a).toBeLessThan(a);
    expect(rubberBand(100000, 600)).toBeLessThan(600);
  });

  it("orders detents from the tallest and offsets them from it", () => {
    expect(detentOffsets([0.5, 1], 800)).toEqual([0, 400]);
    expect(detentOffsets([1, 0.5], 800)).toEqual([0, 400]);
    expect(detentOffsets([0.75], 800)).toEqual([0]);
    // out-of-range detents are clamped
    expect(detentOffsets([2, 0], 1000)).toEqual([0, 900]);
  });

  it("snaps to the nearest detent without a fling", () => {
    expect(pickSnap(120, 0, [0, 400], 824)).toBe(0);
    expect(pickSnap(300, 0, [0, 400], 824)).toBe(1);
  });

  it("dismisses past the dismiss line below the lowest detent", () => {
    const closed = 500;
    expect(pickSnap(closed * DISMISS_FRACTION - 5, 0, [0], closed)).toBe(0);
    expect(pickSnap(closed * DISMISS_FRACTION + 5, 0, [0], closed)).toBe(-1);
  });

  it("a fling moves one detent, or dismisses from the lowest", () => {
    expect(pickSnap(10, 1200, [0, 400], 824)).toBe(1);
    expect(pickSnap(410, 1200, [0, 400], 824)).toBe(-1);
    expect(pickSnap(390, -1200, [0, 400], 824)).toBe(0);
    expect(pickSnap(5, -1200, [0, 400], 824)).toBe(0);
  });

  it("follows the finger downward and resists above the top", () => {
    expect(dragPosition(0, 80, 0, 600)).toBe(80);
    const up = dragPosition(0, -80, 0, 600);
    expect(up).toBeLessThan(0);
    expect(up).toBeGreaterThan(-80);
  });
});

describe("swipe row math", () => {
  it("mirrors the finger in RTL", () => {
    expect(logicalOffset(30, false)).toBe(30);
    expect(logicalOffset(30, true)).toBe(-30);
  });

  it("moves freely inside the actions, resists past them, stays put without them", () => {
    const w = ACTION_WIDTH;
    expect(swipeOffset(40, w, 0, 390, false, false)).toBe(40);
    expect(swipeOffset(w + 100, w, 0, 390, false, false)).toBeCloseTo(w + 20);
    expect(swipeOffset(-40, w, 0, 390, false, false)).toBe(0);
    expect(swipeOffset(-40, 0, 2 * w, 390, false, false)).toBe(-40);
    // with a full swipe the row may travel the whole width
    expect(swipeOffset(300, w, 0, 390, true, false)).toBe(300);
  });

  it("arms the full swipe past its share of the row", () => {
    expect(fullSwipeArmed(390 * FULL_SWIPE - 1, 390)).toBe(false);
    expect(fullSwipeArmed(390 * FULL_SWIPE, 390)).toBe(true);
    expect(fullSwipeArmed(-390 * FULL_SWIPE, 390)).toBe(true);
    expect(fullSwipeArmed(500, 0)).toBe(false);
  });

  it("settles open past half the actions or with a fling, else closed", () => {
    const w = ACTION_WIDTH;
    expect(settleSwipe(w / 2 + 1, 0, w, 0)).toBe(w);
    expect(settleSwipe(w / 2 - 1, 0, w, 0)).toBe(0);
    expect(settleSwipe(10, 900, w, 0)).toBe(w);
    expect(settleSwipe(-w - 1, 0, 0, 2 * w)).toBe(-2 * w);
    expect(settleSwipe(-w * 1.5, 900, 0, 2 * w)).toBe(0);
    expect(settleSwipe(20, 0, 0, w)).toBe(0);
  });
});
