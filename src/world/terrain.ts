import { HIGHEST_TIDE } from './constants';
import { distanceToCauseway, HOUSE, PIT, ROW_Z, RUINS } from './layout';
import { fbm2, lerp, noise2, smoothstep } from './noise';
import { BEACH, shape } from './shape';

/** Side of the square the world is sampled on (metres), centred on the island. Beyond it there is only deep sea. */
export const SIZE = 2400;
/** Samples per side. */
export const N = 1025;

export interface Ground {
  h: number;
  /** 0..1: bare rock. */
  rock: number;
  /** 0..1: the cobbled top of the causeway. */
  path: number;
}

/** The ground at a point, with all its detail: lumps, outcrops, sand bars, creeks, pools, the reef, the causeway. */
export function ground(x: number, z: number): Ground {
  const s = shape(x, z);
  let h = s.h;
  let rock = 0;
  let path = 0;

  if (s.d < 0) {
    // the hill
    const high = smoothstep(0, 0.35, s.p);
    h += 2.2 * fbm2(x / 55, z / 55, 4, 21) * high;
    const ridge = 1 - Math.abs(noise2(x / 38, z / 38, 31));
    const westness = (1 - Math.cos(s.ang)) / 2;
    const out = smoothstep(0.74, 0.96, ridge) * smoothstep(0.04, 0.3, s.p) * (0.3 + 0.7 * westness);
    h += out * (1.4 + 1.2 * noise2(x / 9, z / 9, 32));
    rock = out;
    // the terrace the house stands on
    const dh = Math.hypot(x - HOUSE.x, z - HOUSE.z);
    const terrace = 1 - smoothstep(8.5, 17, dh);
    h = lerp(h, HOUSE.floor, terrace);
    rock *= 1 - terrace;
    return { h, rock, path };
  }

  if (s.d < BEACH) {
    // shingle, with a storm ridge near the top
    h += 0.22 * fbm2(x / 8, z / 8, 2, 41) + 0.35 * Math.exp(-Math.pow((s.d - 7) / 5, 2));
  }

  // how strongly the sand detail applies: nothing on the beach, nothing on the drop-off
  const flats = smoothstep(BEACH, BEACH + 60, s.d) * (1 - smoothstep(0.92, 1.08, s.u));
  // the stone row walks on firm, even sand
  const corridor = x < 0 ? smoothstep(9, 30, Math.abs(z - ROW_Z)) : 1;
  const a = flats * (0.12 + 0.88 * corridor);

  // sand bars, long across the tide
  h += a * (0.55 * fbm2(x / 150, z / 70, 3, 51) + 0.22 * fbm2(x / 31, z / 31, 3, 52));
  // creeks
  const c = Math.abs(noise2(x / 230, z / 230, 61) + 0.3 * noise2(x / 90, z / 90, 62));
  h -= a * 1.2 * (1 - smoothstep(0, 0.06, c)) * smoothstep(0.1, 0.4, s.u);
  // pools
  h -= a * 0.55 * smoothstep(0.42, 0.7, noise2(x / 26, z / 26, 71));

  // the reef to the north: a rock platform full of pools
  const northness = Math.max(0, -Math.sin(s.ang));
  const reef =
    Math.pow(northness, 1.2) * smoothstep(0.03, 0.15, s.u) * (1 - smoothstep(0.7, 0.95, s.u)) * smoothstep(-0.25, 0.25, noise2(x / 120, z / 120, 81) + 0.35);
  if (reef > 0) {
    const ridged = Math.pow(1 - Math.abs(noise2(x / 33, z / 33, 82)), 2);
    h += reef * (0.9 + 1.6 * ridged);
    h -= reef * 1.1 * smoothstep(0.35, 0.6, noise2(x / 14, z / 14, 83));
    rock = Math.max(rock, smoothstep(0.25, 0.6, reef));
  }

  // the ruins stand on a levelled floor, with a pit the stairs go down into
  const dr = Math.hypot(x - RUINS.x, z - RUINS.z);
  h = lerp(h, RUINS.level, 1 - smoothstep(22, 40, dr));
  const dp = Math.hypot(x - PIT.x, z - PIT.z);
  h -= PIT.depth * (1 - smoothstep(3.5, 8.5, dp));

  // the causeway: a raised bank with a cobbled top
  const dc = distanceToCauseway(x, z);
  if (dc < 7) {
    const top = Math.max(s.h + 0.9, RUINS.level + 0.15 * (1 - smoothstep(22, 40, dr)));
    const bank = 1 - smoothstep(2.6, 6.5, dc);
    if (dp > 9) h = lerp(h, Math.max(h, top), bank);
    path = 1 - smoothstep(2.0, 3.2, dc);
  }

  return { h, rock, path };
}

export interface Terrain {
  n: number;
  size: number;
  cell: number;
  /** Ground height at each sample, row by row from north-west. */
  h: Float32Array;
  /** The level water would stand at if the sea left it behind: equal to h where water drains away. */
  fill: Float32Array;
  rock: Float32Array;
  path: Float32Array;
  heightAt(x: number, z: number): number;
  fillAt(x: number, z: number): number;
  /** Surface of the water standing at this point (the sea, or a pool the sea left behind), or -Infinity if it is dry. */
  waterAt(x: number, z: number, tide: number): number;
}

/** A binary heap of (key, index) pairs, smallest key first. */
class MinHeap {
  private keys: Float32Array;
  private ids: Int32Array;
  size = 0;
  constructor(capacity: number) {
    this.keys = new Float32Array(capacity);
    this.ids = new Int32Array(capacity);
  }
  push(key: number, id: number): void {
    let i = this.size++;
    const { keys, ids } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      ids[i] = ids[p];
      i = p;
    }
    keys[i] = key;
    ids[i] = id;
  }
  pop(): number {
    const { keys, ids } = this;
    const top = ids[0];
    const key = keys[--this.size];
    const id = ids[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      keys[i] = keys[c];
      ids[i] = ids[c];
      i = c;
    }
    keys[i] = key;
    ids[i] = id;
    return top;
  }
}

/**
 * For every sample, the lowest level at which water there can still escape to the open sea (the edge of the square).
 * Where that is above the ground, the falling tide leaves a pool standing at exactly that level.
 */
export function floodFill(h: Float32Array, n: number): Float32Array {
  const fill = new Float32Array(h.length);
  const seen = new Uint8Array(h.length);
  const heap = new MinHeap(h.length);
  const add = (i: number, level: number) => {
    seen[i] = 1;
    fill[i] = Math.max(h[i], level);
    heap.push(fill[i], i);
  };
  for (let k = 0; k < n; k++) {
    add(k, -Infinity);
    add((n - 1) * n + k, -Infinity);
    if (k > 0 && k < n - 1) {
      add(k * n, -Infinity);
      add(k * n + n - 1, -Infinity);
    }
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const x = i % n;
    const z = (i - x) / n;
    const level = fill[i];
    if (x > 0 && !seen[i - 1]) add(i - 1, level);
    if (x < n - 1 && !seen[i + 1]) add(i + 1, level);
    if (z > 0 && !seen[i - n]) add(i - n, level);
    if (z < n - 1 && !seen[i + n]) add(i + n, level);
  }
  return fill;
}

export function buildTerrain(n = N, size = SIZE): Terrain {
  const cell = size / (n - 1);
  const h = new Float32Array(n * n);
  const rock = new Float32Array(n * n);
  const path = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -size / 2 + j * cell;
    for (let i = 0; i < n; i++) {
      const g = ground(-size / 2 + i * cell, z);
      const k = j * n + i;
      h[k] = g.h;
      rock[k] = g.rock;
      path[k] = g.path;
    }
  }
  const fill = floodFill(h, n);
  // nothing above the highest tide ever holds sea water
  for (let k = 0; k < fill.length; k++) if (fill[k] > HIGHEST_TIDE) fill[k] = h[k];

  const sample = (a: Float32Array, x: number, z: number): number => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + size / 2) / cell));
    const fz = Math.min(n - 1.001, Math.max(0, (z + size / 2) / cell));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const k = iz * n + ix;
    return (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - tz) + (a[k + n] * (1 - tx) + a[k + n + 1] * tx) * tz;
  };
  const heightAt = (x: number, z: number) => sample(h, x, z);
  const fillAt = (x: number, z: number) => sample(fill, x, z);
  const waterAt = (x: number, z: number, tide: number) => {
    const g = heightAt(x, z);
    const f = fillAt(x, z);
    if (tide >= f) return tide > g ? tide : -Infinity;
    return f > g + 0.02 ? f : -Infinity;
  };
  return { n, size, cell, h, fill, rock, path, heightAt, fillAt, waterAt };
}
