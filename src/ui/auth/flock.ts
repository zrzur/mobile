// The flock of birds at the top of the auth pages, ported verbatim from the
// web app (`ui/components/design/flock.ts`). Same seeds, same birds.

export const SKY_W = 1200;
export const SKY_H = 320;

export type Bird = { x: number; y: number; r: number; o: number };

function seededRandom(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bell = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(Math.PI * 2 * r());
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function skyFlock(count = 200, seed = 5): Bird[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const u = random();
    const phase = u * Math.PI * 2.4 + 0.5;
    const belly = 0.2 + 0.8 * Math.abs(Math.cos(phase));
    const spread = (10 + 30 * Math.sin(Math.PI * u) ** 2) * belly;
    const near = random();
    return {
      x: clamp(20 + (SKY_W - 40) * u + bell(random) * spread, 8, SKY_W - 8),
      y: clamp(SKY_H * 0.34 + Math.sin(phase) * SKY_H * 0.2 + bell(random) * spread * 0.7, 8, SKY_H - 8),
      r: 1.25 + near * near * 2.25,
      o: 0.3 + near * 0.6,
    };
  });
}

export function skyScattered(count = 200, seed = 9): Bird[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x: random() * SKY_W,
    y: random() * SKY_H,
    r: 1,
    o: 0,
  }));
}

const round = (v: number) => Math.round(v * 100) / 100;

/** One wing shape per bird; `fixedTurn` draws every wing at the same angle (in flight) */
export function skyPath(birds: Bird[], fixedTurn?: number): string {
  return birds
    .map((b) => {
      const size = b.r * 2.1;
      const turn = fixedTurn ?? -0.45 + 0.8 * Math.sin(b.x * 0.011 + b.y * 0.07);
      const hx = Math.cos(turn) * size;
      const hy = Math.sin(turn) * size;
      const p = (back: number, side: number) =>
        `${round(b.x + hx * back - hy * side)} ${round(b.y + hy * back + hx * side)}`;
      return `M${p(0.55, 0)}L${p(-0.75, 0.85)}L${p(-0.2, 0)}L${p(-0.75, -0.85)}Z`;
    })
    .join("");
}

/** Birds grouped by strength: one path per opacity layer */
export function skyLayers(birds: Bird[], steps = 5) {
  const m = new Map<number, Bird[]>();
  for (const b of birds) {
    const o = Math.round(b.o * steps) / steps;
    m.set(o, [...(m.get(o) ?? []), b]);
  }
  return [...m.entries()].map(([opacity, list]) => ({ opacity, d: skyPath(list) }));
}
