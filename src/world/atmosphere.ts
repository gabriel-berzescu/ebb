import type { Vec3 } from './heavens';

/**
 * Single-scattering atmosphere (Rayleigh + Mie), the same integral the sky shader runs. Here it is used to meter the
 * light: how bright the sky is, and what colour sunlight has left after its path through the air. Keep the constants in
 * step with ATMOSPHERE_GLSL in src/render/glsl.ts.
 */

export const ATMOS = {
  planet: 6371e3,
  top: 6471e3,
  rayleigh: [5.5e-6, 13.0e-6, 22.4e-6] as Vec3,
  mie: 21e-6,
  hRayleigh: 8e3,
  hMie: 1.2e3,
  g: 0.758,
  /** Stand-in for light scattered more than once: pale haze where the path through the air is long. */
  haze: [0.02, 0.027, 0.038] as Vec3,
  /** Brightness of the sun above the air. Everything else is measured against it. */
  sun: 22,
};

const I_STEPS = 16;
const J_STEPS = 8;

/** Distance along a ray from (ox, oy, oz), inside a sphere of radius `sr` about the planet's centre, to where it leaves the sphere. */
function exitDistance(ox: number, oy: number, oz: number, dir: Vec3, sr: number): number {
  const b = 2 * (dir[0] * ox + dir[1] * oy + dir[2] * oz);
  const c = ox * ox + oy * oy + oz * oz - sr * sr;
  const disc = b * b - 4 * c;
  if (disc < 0) return 0;
  return (-b + Math.sqrt(disc)) / 2;
}

function nearHit(oy: number, dir: Vec3, sr: number): number {
  const b = 2 * dir[1] * oy;
  const c = oy * oy - sr * sr;
  const disc = b * b - 4 * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / 2;
  return t > 0 ? t : Infinity;
}

/** Optical depth (Rayleigh, Mie) from a point to the top of the air along `dir`. */
function opticalDepth(ox: number, oy: number, oz: number, dir: Vec3): [number, number] {
  const len = exitDistance(ox, oy, oz, dir, ATMOS.top);
  const step = len / J_STEPS;
  let r = 0;
  let m = 0;
  for (let j = 0; j < J_STEPS; j++) {
    const t = step * (j + 0.5);
    const hgt = Math.hypot(ox + dir[0] * t, oy + dir[1] * t, oz + dir[2] * t) - ATMOS.planet;
    r += Math.exp(-hgt / ATMOS.hRayleigh) * step;
    m += Math.exp(-hgt / ATMOS.hMie) * step;
  }
  return [r, m];
}

/** Fraction of light from a body in direction `dir` that reaches the ground, per colour. */
export function transmittance(dir: Vec3): Vec3 {
  const [r, m] = opticalDepth(0, ATMOS.planet + 1, 0, dir);
  const k = ATMOS.rayleigh;
  return [Math.exp(-(k[0] * r + ATMOS.mie * m)), Math.exp(-(k[1] * r + ATMOS.mie * m)), Math.exp(-(k[2] * r + ATMOS.mie * m))];
}

/** Radiance of the sky in direction `view` lit by a body in direction `light` of brightness `power`. */
export function skyRadiance(view: Vec3, light: Vec3, power: number): Vec3 {
  const oy = ATMOS.planet + 1;
  let len = exitDistance(0, oy, 0, view, ATMOS.top);
  len = Math.min(len, nearHit(oy, view, ATMOS.planet));
  const step = len / I_STEPS;
  const mu = view[0] * light[0] + view[1] * light[1] + view[2] * light[2];
  const g = ATMOS.g;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (mu * mu + 1))) / (Math.pow(1 + g * g - 2 * mu * g, 1.5) * (2 + g * g));
  const k = ATMOS.rayleigh;
  let odR = 0;
  let odM = 0;
  const totR: Vec3 = [0, 0, 0];
  const totM: Vec3 = [0, 0, 0];
  const nearSun: Vec3 = [0, 0, 0];
  for (let i = 0; i < I_STEPS; i++) {
    const t = step * (i + 0.5);
    const px = view[0] * t;
    const py = oy + view[1] * t;
    const pz = view[2] * t;
    const hgt = Math.hypot(px, py, pz) - ATMOS.planet;
    const sR = Math.exp(-hgt / ATMOS.hRayleigh) * step;
    const sM = Math.exp(-hgt / ATMOS.hMie) * step;
    odR += sR;
    odM += sM;
    const [jr, jm] = opticalDepth(px, py, pz, light);
    for (let c = 0; c < 3; c++) {
      const attn = Math.exp(-(ATMOS.mie * (odM + jm) + k[c] * (odR + jr)));
      if (i === 0) nearSun[c] = Math.exp(-(ATMOS.mie * jm + k[c] * jr));
      totR[c] += sR * attn;
      totM[c] += sM * attn;
    }
  }
  const out: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const lost = 1 - Math.exp(-(ATMOS.mie * odM + k[c] * odR));
    out[c] = power * (pR * k[c] * totR[c] + pM * ATMOS.mie * totM[c] + nearSun[c] * lost * ATMOS.haze[c]);
  }
  return out;
}

export function luminance(c: Vec3): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
