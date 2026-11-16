import * as THREE from 'three';
import { equatorial, STARS } from '../world/stars';

/**
 * The stars as a texture the sky shader can search. The sky is divided into cells (the faces of a cube, 64 by 64
 * each); every cell lists the few stars that can show in it. A pixel looks up its own cell and draws those stars
 * exactly, so they stay sharp at any size and are mirrored by the water for free.
 *
 * Each star is one texel: its direction in the star frame, and one number holding colour (whole part) and brightness
 * (fraction). Keep the cell arithmetic in step with starField() in glsl.ts.
 */
const N = 64;
const SLOTS = 6;
/** How far from its centre a star can still light a pixel (radians): it is entered in every cell within this reach. */
const REACH = 0.0055;

function cellOf(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face: number;
  let u: number;
  let v: number;
  if (ax >= ay && ax >= az) {
    face = x > 0 ? 0 : 1;
    u = y / ax;
    v = z / ax;
  } else if (ay >= az) {
    face = y > 0 ? 2 : 3;
    u = x / ay;
    v = z / ay;
  } else {
    face = z > 0 ? 4 : 5;
    u = x / az;
    v = y / az;
  }
  const cx = Math.min(N - 1, Math.max(0, Math.floor((u * 0.5 + 0.5) * N)));
  const cy = Math.min(N - 1, Math.max(0, Math.floor((v * 0.5 + 0.5) * N)));
  return cy * (6 * N) + face * N + cx;
}

/** Brightness on screen for a magnitude: 1 for Sirius, about a hundredth for the faintest. The eye's response, not the physical flux. */
export function starBrightness(mag: number): number {
  return Math.pow(10, -0.26 * (mag + 1.46));
}

export function starMapTexture(): THREE.DataTexture {
  const width = 6 * N;
  const height = N * SLOTS;
  const data = new Float32Array(width * height * 4);
  const used = new Uint8Array(6 * N * N);
  const around = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [-0.7, 0.7],
    [0.7, -0.7],
    [-0.7, -0.7],
  ];
  // STARS is brightest first, so each cell's slots fill in order of brightness and a crowded cell drops only its faintest
  for (const s of STARS) {
    const [x, y, z] = equatorial(s.ra, s.dec);
    // two directions across the line of sight
    const h = Math.hypot(x, y) || 1;
    const t1 = [-y / h, x / h, 0];
    const t2 = [y * t1[2] - z * t1[1], z * t1[0] - x * t1[2], x * t1[1] - y * t1[0]];
    const colour = Math.round(Math.min(1, Math.max(0, (s.bv + 0.4) / 2.4)) * 63);
    const packed = colour + Math.sqrt(starBrightness(s.mag)) * 0.998;
    const cells = new Set<number>();
    for (const [a, b] of around) {
      cells.add(cellOf(x + REACH * (a * t1[0] + b * t2[0]), y + REACH * (a * t1[1] + b * t2[1]), z + REACH * (a * t1[2] + b * t2[2])));
    }
    for (const c of cells) {
      const k = used[c];
      if (k >= SLOTS) continue;
      used[c] = k + 1;
      const cx = c % width;
      const cy = Math.floor(c / width);
      const i = ((cy * SLOTS + k) * width + cx) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = z;
      data[i + 3] = packed;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
