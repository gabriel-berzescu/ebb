/** Deterministic gradient noise. The same seed always gives the same island. */

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A number in [0, 1) for a lattice point. */
export function rand2(ix: number, iy: number, seed = 0): number {
  return hash(ix, iy, seed) / 4294967296;
}

function grad(ix: number, iy: number, seed: number, dx: number, dy: number): number {
  const a = (hash(ix, iy, seed) / 4294967296) * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

/** Gradient noise in about [-1, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = grad(ix, iy, seed, fx, fy);
  const b = grad(ix + 1, iy, seed, fx - 1, fy);
  const c = grad(ix, iy + 1, seed, fx, fy - 1);
  const d = grad(ix + 1, iy + 1, seed, fx - 1, fy - 1);
  return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.41;
}

/** Fractal noise in about [-1, 1]. */
export function fbm2(x: number, y: number, octaves: number, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x, y, seed + o * 101);
    norm += amp;
    // rotate between octaves so the lattice does not show
    const nx = 1.6 * x + 1.2 * y;
    y = -1.2 * x + 1.6 * y;
    x = nx;
    amp *= 0.5;
  }
  return sum / norm;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
