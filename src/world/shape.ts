import { lerp, noise2 } from './noise';

/**
 * The broad shape of the island and its flats, with no small detail: a hill, a shingle beach, then sand falling slowly
 * to the lowest tide line. The flats reach a kilometre to the west and only a hundred metres to the east, where the
 * sea is always close.
 */

/** Radius of the island at the top of the beach, before the outline is warped. */
export const ISLAND_RADIUS = 150;
/** Width of the shingle beach. */
export const BEACH = 45;
/** Height of the top of the beach: just above the highest tide. */
export const SHORE = 8.0;
/** Height where the beach meets the sand. */
export const BEACH_FOOT = 3.5;
/** Height of the outer edge of the flats, below the lowest tide. */
export const FLATS_FOOT = -8.6;

/** Angle of a point seen from the middle of the island: 0 east, pi/2 south, pi west, -pi/2 north. */
export function bearing(x: number, z: number): number {
  return Math.atan2(z, x);
}

/** How far the island's edge is pushed in or out at this bearing. */
export function outline(ang: number): number {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return 1 + 0.15 * noise2(c * 1.2 + 3.1, s * 1.2 + 7.7, 11) + 0.06 * noise2(c * 3 + 1.3, s * 3 + 2.9, 12);
}

/** Distance from the top of the beach to the outer edge of the flats at this bearing. */
export function flatsExtent(ang: number): number {
  const westness = (1 - Math.cos(ang)) / 2;
  const southness = Math.max(0, Math.sin(ang));
  return 110 + 770 * Math.pow(westness, 1.3) + 120 * southness * southness;
}

export interface ShapeSample {
  /** Smooth height. */
  h: number;
  /** 1 at the summit, 0 at the island's edge, negative beyond. */
  p: number;
  /** Metres beyond the top of the beach (negative on the island). */
  d: number;
  /** 0 at the foot of the beach, 1 at the outer edge of the flats. */
  u: number;
  ang: number;
}

export function shape(x: number, z: number): ShapeSample {
  const r = Math.hypot(x, z);
  const ang = bearing(x, z);
  const edge = ISLAND_RADIUS * outline(ang);
  const d = r - edge;
  if (d < 0) {
    const q = r / edge;
    const p = 1 - q * q;
    return { h: SHORE + 26.5 * Math.pow(p, 1.3), p, d, u: 0, ang };
  }
  const extent = flatsExtent(ang);
  if (d < BEACH) {
    return { h: lerp(SHORE, BEACH_FOOT, Math.pow(d / BEACH, 0.85)), p: 0, d, u: 0, ang };
  }
  const u = (d - BEACH) / (extent - BEACH);
  if (u < 1) return { h: BEACH_FOOT + (FLATS_FOOT - BEACH_FOOT) * Math.pow(u, 0.9), p: 0, d, u, ang };
  return { h: Math.max(-40, FLATS_FOOT - (d - extent) * 0.1), p: 0, d, u, ang };
}

/** Smooth height at a point. */
export function profile(x: number, z: number): number {
  return shape(x, z).h;
}

/** Walk out from the island along a bearing until the smooth ground has fallen to `height`; returns the distance from the centre. */
export function distanceToHeight(ang: number, height: number): number {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let a = ISLAND_RADIUS * outline(ang);
  let b = 1190;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    if (profile(c * m, s * m) > height) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
