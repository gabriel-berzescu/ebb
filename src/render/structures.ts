import type * as THREE from 'three';
import type { Solid } from '../game/player';
import { FAR_LAMP, HOUSE, HOUSE_YAW, housePoint, LAMP, PIT, RUINS, SHELF_ITEMS_AT, STONES, TREES } from '../world/layout';
import { noise2, rand2 } from '../world/noise';
import type { Terrain } from '../world/terrain';
import { Builder, Kind, type Color, type P3 } from './builder';

export interface ShelfItem {
  kind: string;
  by: string;
  on: string;
  text: string;
}

const STONE: Color = [0.44, 0.43, 0.41];
const WALL: Color = [0.5, 0.47, 0.42];
const SLATE: Color = [0.2, 0.22, 0.25];
const WOOD: Color = [0.33, 0.24, 0.15];
const IRON: Color = [0.07, 0.07, 0.075];

export interface Built {
  mesh: THREE.Mesh;
  solids: Solid[];
}

/** Everything that was made by hands: the house and what is in it, the trees, the stone row, the ruins, the far lamp. */
export function buildStructures(terrain: Terrain, shelf: ShelfItem[]): Built {
  const b = new Builder();
  const solids: Solid[] = [];

  // ---- the house ---------------------------------------------------------------------------------------------------
  const W = HOUSE.width;
  const D = HOUSE.depth;
  const T = HOUSE.thick;
  const H = HOUSE.wall;
  const RIDGE = H + 1.75;

  /** A box given in the house's own frame: from a0 to a1 along the window wall, o0 to o1 outward, u0 to u1 up. */
  const hbox = (a0: number, a1: number, o0: number, o1: number, u0: number, u1: number, color: Color, kind: number, solid = false, rough = 0) => {
    const at = housePoint((a0 + a1) / 2, (o0 + o1) / 2, u0);
    const half: [number, number] = [(a1 - a0) / 2, (o1 - o0) / 2];
    b.box(at, half, u1 - u0, HOUSE_YAW, color, kind, rough, a0 * 7.1 + o0 * 3.3 + u0);
    if (solid) solids.push({ x: at[0], z: at[2], hx: half[0], hz: half[1], yaw: HOUSE_YAW, y0: at[1], y1: at[1] + (u1 - u0) });
  };

  // floor of stone flags
  hbox(-W / 2 + T, W / 2 - T, -D / 2 + T, D / 2 - T, -0.3, 0.04, [0.36, 0.35, 0.33], Kind.wall);
  // window wall (front), with the window at a = 0.75 .. 1.85
  hbox(-W / 2, 0.75, D / 2 - T, D / 2, 0, H, WALL, Kind.wall, true);
  hbox(1.85, W / 2, D / 2 - T, D / 2, 0, H, WALL, Kind.wall, true);
  hbox(0.75, 1.85, D / 2 - T, D / 2, 0, 0.95, WALL, Kind.wall, true);
  hbox(0.75, 1.85, D / 2 - T, D / 2, 2.0, H, WALL, Kind.wall, true);
  // back wall, with the door at a = -1.75 .. -0.75 (on the lee side, out of the west wind)
  hbox(-W / 2, -1.75, -D / 2, -D / 2 + T, 0, H, WALL, Kind.wall, true);
  hbox(-0.75, W / 2, -D / 2, -D / 2 + T, 0, H, WALL, Kind.wall, true);
  hbox(-1.75, -0.75, -D / 2, -D / 2 + T, 2.02, H, WALL, Kind.wall, true);
  // gable walls
  hbox(-W / 2, -W / 2 + T, -D / 2 + T, D / 2 - T, 0, H, WALL, Kind.wall, true);
  hbox(W / 2 - T, W / 2, -D / 2 + T, D / 2 - T, 0, H, WALL, Kind.wall, true);
  for (const side of [-1, 1]) {
    for (const a of [side * (W / 2), side * (W / 2 - T)]) {
      b.tri(housePoint(a, -D / 2, H), housePoint(a, D / 2, H), housePoint(a, 0, RIDGE - 0.06), WALL, Kind.wall);
    }
  }
  // roof of slate: two slopes
  {
    const over = 0.28;
    const eave = D / 2 + 0.32;
    const eaveH = H - 0.14;
    const l = -W / 2 - over;
    const r = W / 2 + over;
    b.quad(housePoint(l, 0, RIDGE), housePoint(r, 0, RIDGE), housePoint(r, eave, eaveH), housePoint(l, eave, eaveH), SLATE, Kind.slate);
    b.quad(housePoint(r, 0, RIDGE), housePoint(l, 0, RIDGE), housePoint(l, -eave, eaveH), housePoint(r, -eave, eaveH), SLATE, Kind.slate);
  }
  // chimney at the right gable, with its pot
  hbox(W / 2 - 0.92, W / 2 - 0.12, -0.38, 0.38, H + 0.7, RIDGE + 0.8, WALL, Kind.wall);
  hbox(W / 2 - 0.68, W / 2 - 0.36, -0.16, 0.16, RIDGE + 0.8, RIDGE + 1.08, [0.5, 0.27, 0.18], Kind.slate);
  // window frame and lintel of wood
  hbox(0.75, 1.85, D / 2 - 0.3, D / 2 - 0.22, 1.94, 2.0, WOOD, Kind.wood);
  hbox(0.75, 0.81, D / 2 - 0.3, D / 2 - 0.22, 0.95, 2.0, WOOD, Kind.wood);
  hbox(1.79, 1.85, D / 2 - 0.3, D / 2 - 0.22, 0.95, 2.0, WOOD, Kind.wood);
  // the bench outside under the window wall
  hbox(-2.5, -0.9, D / 2 + 0.1, D / 2 + 0.52, 0.42, 0.47, WOOD, Kind.wood, true);
  hbox(-2.42, -2.34, D / 2 + 0.14, D / 2 + 0.48, 0, 0.42, WOOD, Kind.wood);
  hbox(-1.06, -0.98, D / 2 + 0.14, D / 2 + 0.48, 0, 0.42, WOOD, Kind.wood);
  hbox(-2.5, -0.9, D / 2 + 0.06, D / 2 + 0.1, 0.56, 0.92, WOOD, Kind.wood);
  hbox(-2.42, -2.34, D / 2 + 0.02, D / 2 + 0.1, 0.42, 0.92, WOOD, Kind.wood);
  hbox(-1.06, -0.98, D / 2 + 0.02, D / 2 + 0.1, 0.42, 0.92, WOOD, Kind.wood);
  // inside: two shelves on the back wall, a table under the window, a bed by the left gable
  hbox(0.35, 2.05, -D / 2 + T, -D / 2 + T + 0.26, 1.21, 1.25, WOOD, Kind.wood);
  hbox(0.35, 2.05, -D / 2 + T, -D / 2 + T + 0.22, 1.63, 1.67, WOOD, Kind.wood);
  hbox(0.7, 1.9, D / 2 - T - 0.78, D / 2 - T - 0.06, 0.7, 0.75, WOOD, Kind.wood, true);
  for (const [a, o] of [
    [0.76, D / 2 - T - 0.72],
    [1.84, D / 2 - T - 0.72],
    [0.76, D / 2 - T - 0.12],
    [1.84, D / 2 - T - 0.12],
  ]) {
    hbox(a - 0.03, a + 0.03, o - 0.03, o + 0.03, 0.04, 0.7, WOOD, Kind.wood);
  }
  hbox(-W / 2 + T + 0.05, -W / 2 + T + 1.0, -1.7, 0.35, 0.04, 0.4, WOOD, Kind.wood, true);
  hbox(-W / 2 + T + 0.08, -W / 2 + T + 0.97, -1.66, 0.31, 0.4, 0.5, [0.42, 0.2, 0.15], Kind.slate);

  // the lamp on the window sill, and the lantern far out on the sand
  const lantern = (at: P3, far: boolean) => {
    const glow: Color = [1, 0.6, far ? 1 : 0];
    b.box(at, [0.085, 0.085], 0.03, 0.3, IRON, Kind.iron);
    b.box([at[0], at[1] + 0.03, at[2]], [0.05, 0.05], 0.17, 0.3, glow, Kind.glow);
    b.box([at[0], at[1] + 0.2, at[2]], [0.085, 0.085], 0.03, 0.3, IRON, Kind.iron);
    b.box([at[0], at[1] + 0.23, at[2]], [0.03, 0.03], 0.05, 0.3, IRON, Kind.iron);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      b.box([at[0] + dx * 0.07, at[1] + 0.03, at[2] + dz * 0.07], [0.008, 0.008], 0.17, 0.3, IRON, Kind.iron);
    }
  };
  lantern([LAMP[0], HOUSE.floor + 0.95, LAMP[2]], false);

  // what has been left on the shelf
  shelf.forEach((item, i) => {
    const at = SHELF_ITEMS_AT(i);
    if (item.kind === 'feather') {
      b.lump([at[0], at[1] + 0.012, at[2]], [0.105, 0.007, 0.024], [0.33, 0.34, 0.38], Kind.leaf, 5 + i, 0.1, [0, 0], 1);
      b.lump([at[0] + 0.02, at[1] + 0.012, at[2] + 0.004], [0.06, 0.006, 0.03], [0.5, 0.51, 0.55], Kind.leaf, 9 + i, 0.1, [0, 0], 1);
    } else if (item.kind === 'shell') {
      b.lump([at[0], at[1] + 0.025, at[2]], [0.05, 0.025, 0.04], [0.8, 0.74, 0.66], Kind.slate, 5 + i, 0.2, [0, 0], 1);
    } else {
      b.lump([at[0], at[1] + 0.03, at[2]], [0.05, 0.032, 0.042], [0.4, 0.4, 0.42], Kind.slate, 5 + i, 0.25, [0, 0], 1);
    }
  });

  // ---- three wind-bent trees ---------------------------------------------------------------------------------------
  for (const [ti, tree] of TREES.entries()) {
    const s = tree.size;
    const base = terrain.heightAt(tree.x, tree.z) - 0.3;
    // the trunk bends east as it rises
    const spine: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6;
      spine.push([tree.x + 2.1 * s * f * f, base + 3.3 * s * f, tree.z + 0.3 * s * Math.sin(f * 3 + ti * 2)]);
    }
    for (let i = 0; i < 6; i++) {
      const lo = spine[i];
      const hi = spine[i + 1];
      const ry = (hi[1] - lo[1]) / 2 + 0.12 * s;
      const r = (0.21 - 0.022 * i) * s;
      b.lump([lo[0], (lo[1] + hi[1]) / 2, lo[2]], [r, ry, r], [0.17, 0.14, 0.11], Kind.wood, ti * 13 + i, 0.25, [(hi[0] - lo[0]) / (2 * ry), (hi[2] - lo[2]) / (2 * ry)], 1);
    }
    const top = spine[6];
    solids.push({ x: tree.x + 0.05, z: tree.z, hx: 0.25 * s, hz: 0.25 * s, yaw: 0, y0: base, y1: base + 3 });
    // the crown streams east, away from the wind
    for (let k = 0; k < 11; k++) {
      const f = k / 10;
      const at: P3 = [top[0] - 0.7 * s + 3.6 * s * f, top[1] + (0.15 + 0.55 * Math.sin(f * 2.4) - 0.6 * f + 0.3 * (rand2(k, ti, 9) - 0.5)) * s, top[2] + (rand2(k, ti, 7) - 0.5) * 1.7 * s];
      const g = 0.1 + 0.06 * rand2(k, ti, 8);
      b.lump(at, [(1.05 - 0.45 * f) * s, (0.55 - 0.2 * f) * s, (0.9 - 0.3 * f) * s], [g * 0.68, g, g * 0.34], Kind.leaf, ti * 31 + k, 0.35, [0.3, 0], 2);
    }
  }

  // ---- the stone row -----------------------------------------------------------------------------------------------
  for (const st of STONES) {
    const g = terrain.heightAt(st.x, st.z);
    const seed = 40 + st.index * 3.3;
    const lean: [number, number] = [0.07 * noise2(seed, 1.1, 301), 0.07 * noise2(seed, 2.2, 302)];
    // broad face to the west, where the sea comes from; thin seen along the row
    b.lump([st.x, g + st.tall / 2 - 0.3, st.z], [0.4 + 0.1 * rand2(st.index, 2, 5), st.tall / 2 + 0.35, 0.72 + 0.16 * rand2(st.index, 1, 5)], STONE, Kind.stone, seed, 0.2, lean, 2);
    solids.push({ x: st.x, z: st.z, hx: 0.42, hz: 0.75, yaw: 0, y0: g - 1, y1: g + st.tall });
  }

  // ---- the far lamp: a lantern on a low table of stone ------------------------------------------------------------
  {
    const g = FAR_LAMP.ground;
    b.box([FAR_LAMP.x, g - 0.4, FAR_LAMP.z], [0.62, 0.45], 0.7, 0.2, STONE, Kind.stone, 0.05, 77);
    solids.push({ x: FAR_LAMP.x, z: FAR_LAMP.z, hx: 0.62, hz: 0.45, yaw: 0.2, y0: g - 0.4, y1: g + 0.3 });
    lantern([FAR_LAMP.x, g + 0.3, FAR_LAMP.z], true);
  }

  // ---- the ruins ---------------------------------------------------------------------------------------------------
  const L = RUINS.level;
  /** A run of ruined wall from (e0, s0) to (e1, s1), metres east and south of the middle of the ruins. */
  const wallRun = (e0: number, s0: number, e1: number, s1: number, tall: number, seed: number, gap?: [number, number]) => {
    const len = Math.hypot(e1 - e0, s1 - s0);
    const count = Math.max(1, Math.round(len / 1.15));
    const yaw = Math.atan2(s1 - s0, e1 - e0);
    for (let i = 0; i < count; i++) {
      const f0 = i / count;
      const f1 = (i + 1) / count;
      const mid = ((f0 + f1) / 2) * len;
      if (gap && mid > gap[0] && mid < gap[1]) continue;
      const x = RUINS.x + e0 + (e1 - e0) * ((f0 + f1) / 2);
      const z = RUINS.z + s0 + (s1 - s0) * ((f0 + f1) / 2);
      // the top is broken: each piece stands to its own height
      const hgt = Math.max(0.25, tall * (0.55 + 0.6 * noise2(seed + i * 0.8, 3.3, 311)));
      const g = Math.min(terrain.heightAt(x, z), L + 0.2);
      b.box([x, g - 0.5, z], [len / count / 2 + 0.02, 0.36], hgt + 0.5, yaw, WALL, Kind.wall, 0.06, seed + i);
      solids.push({ x, z, hx: len / count / 2 + 0.02, hz: 0.36, yaw, y0: g - 0.5, y1: g + hgt });
    }
  };
  wallRun(-14, -12, -4, -12, 1.7, 1, [3.8, 5.3]);
  wallRun(-14, -12, -14, -2, 1.2, 2);
  wallRun(-14, -2, -8.5, -2, 0.7, 3);
  wallRun(-4, -12, -4, -6.5, 1.4, 4);
  wallRun(0.2, 3.2, 6.4, 3.2, 0.8, 5);
  wallRun(0.2, 6.8, 6.4, 6.8, 0.8, 6);
  wallRun(10, -16, 17, -13, 1.0, 7);
  // a doorway still standing: two piers and the stone across them
  {
    const dx = RUINS.x + 6;
    const dz = RUINS.z - 9;
    for (const e of [-1.1, 1.1]) {
      b.box([dx + e, L - 0.5, dz], [0.36, 0.38], 3.1, 0.05, WALL, Kind.wall, 0.05, 90 + e);
      solids.push({ x: dx + e, z: dz, hx: 0.36, hz: 0.38, yaw: 0.05, y0: L - 0.5, y1: L + 2.6 });
    }
    b.box([dx, L + 2.55, dz], [1.62, 0.4], 0.42, 0.05, WALL, Kind.wall, 0.04, 93);
  }
  // the stairs go down into the pit, and the water in the pit never leaves
  for (let i = 0; i < 12; i++) {
    const x = PIT.x - 8.3 + 0.55 * i + 0.275;
    const top = L - 0.22 * (i + 1);
    b.box([x, top - 1.3, PIT.z], [0.29, 1.25], 1.3, 0, STONE, Kind.stone, 0.025, 120 + i);
    solids.push({ x, z: PIT.z, hx: 0.29, hz: 1.25, yaw: 0, y0: top - 1.3, y1: top });
  }
  // fallen blocks
  for (let i = 0; i < 16; i++) {
    const e = (rand2(i, 1, 61) - 0.5) * 44;
    const s2 = (rand2(i, 2, 61) - 0.5) * 40;
    const x = RUINS.x + e;
    const z = RUINS.z + s2;
    if (Math.hypot(x - PIT.x, z - PIT.z) < 9) continue;
    const size = 0.22 + 0.3 * rand2(i, 3, 61);
    const g = terrain.heightAt(x, z);
    b.lump([x, g + size * 0.25, z], [size, size * 0.6, size * 0.75], STONE, Kind.stone, 200 + i, 0.3, [0, 0], 1);
    solids.push({ x, z, hx: size * 0.8, hz: size * 0.6, yaw: 0, y0: g - 0.1, y1: g + size * 0.8 });
  }

  return { mesh: b.mesh(), solids };
}
