import { ECC, TIDE_MOON, TIDE_SUN } from './constants';
import { distanceToHeight, profile } from './shape';

/**
 * Where the made things stand. Positions that depend on the tide are found by height, not by coordinate: a stone that
 * should dry at a certain low water is placed where the sand is at that height.
 */

const WEST = Math.PI;

/** The house, near the top of the hill. Its window wall looks 25 degrees south of west, over the flats. */
const houseX = -30;
const houseZ = 14;
const frontAngle = WEST - (25 * Math.PI) / 180; // bearing the window wall faces
export const HOUSE = {
  x: houseX,
  z: houseZ,
  /** Height of the floor and of the terrace the house stands on. */
  floor: profile(houseX, houseZ),
  /** Unit vector out of the window. */
  front: [Math.cos(frontAngle), Math.sin(frontAngle)] as [number, number],
  /** Unit vector along the window wall (to the right when looking out). */
  side: [-Math.sin(frontAngle), Math.cos(frontAngle)] as [number, number],
  /** Outside size: along the window wall, and front to back. */
  width: 7.2,
  depth: 5.0,
  wall: 2.5,
  thick: 0.45,
  /** Where the middle of the chimney stack is, along the window wall: it stands astride the north gable. */
  chimney: 7.2 / 2 + 0.1,
};

/** A point given in the house's own frame: `along` the window wall, `out` of the window, `up` from the floor. */
export function housePoint(along: number, out: number, up = 0): [number, number, number] {
  return [HOUSE.x + HOUSE.side[0] * along + HOUSE.front[0] * out, HOUSE.floor + up, HOUSE.z + HOUSE.side[1] * along + HOUSE.front[1] * out];
}

/** Turn that lines a box up with the house: its long side along the window wall. */
export const HOUSE_YAW = frontAngle + Math.PI / 2;

/** The flame of the lamp on the window sill. */
export const LAMP = housePoint(1.3, HOUSE.depth / 2 - 0.12, 1.07);
/** Where the eyes are when sitting on the bench outside, under the window wall. */
export const BENCH_SEAT = housePoint(-1.7, HOUSE.depth / 2 + 0.36, 1.14);

/**
 * The north bench stands by itself on the level ground north of the house, with the chimney gable behind it. It
 * faces due north and leans back, so whoever sits there looks up at the Pole Star and sees the sky turn about it.
 */
const gable = housePoint(HOUSE.width / 2, 0);
export const NORTH_BENCH = { x: gable[0], z: gable[2] - 4.6, ground: HOUSE.floor };

export interface Seat {
  /** Where the eyes are when seated. */
  eye: [number, number, number];
  /** Which way the seat faces: yaw (0 is north, turning left as it grows) and how far the head is tipped back. */
  yaw: number;
  pitch: number;
  /** Where to stand on getting up. */
  stand: [number, number];
}

export const SEATS: Seat[] = [
  {
    eye: BENCH_SEAT,
    yaw: Math.atan2(-HOUSE.front[0], -HOUSE.front[1]),
    pitch: -0.04,
    stand: [housePoint(-1.7, HOUSE.depth / 2 + 1.3)[0], housePoint(-1.7, HOUSE.depth / 2 + 1.3)[2]],
  },
  {
    eye: [NORTH_BENCH.x, NORTH_BENCH.ground + 1.0, NORTH_BENCH.z + 0.14],
    yaw: 0,
    pitch: 0.56,
    stand: [NORTH_BENCH.x, NORTH_BENCH.z - 1.2],
  },
];
/** The middle of the shelf on the back wall inside. */
export const SHELF = housePoint(1.2, -HOUSE.depth / 2 + HOUSE.thick + 0.13, 1.25);
/** How many things lie side by side on one plank of the shelf, and how many planks there can be. */
export const SHELF_ROW = 6;
export const SHELF_PLANKS = 3;
/** Height of the top of a plank above the floor. */
export function shelfHeight(plank: number): number {
  return 1.25 + 0.42 * plank;
}
/** Where the i-th thing left on the shelf lies: left to right (seen facing the shelf) along the lowest plank, then the one above. */
export function SHELF_ITEMS_AT(i: number): [number, number, number] {
  const plank = Math.min(SHELF_PLANKS - 1, Math.floor(i / SHELF_ROW));
  return housePoint(2.0 - 0.3 * (i % SHELF_ROW), -HOUSE.depth / 2 + HOUSE.thick + 0.13, shelfHeight(plank));
}
/** Just inside the doorway, on the lee side of the house. */
export const DOOR = housePoint(-1.25, -HOUSE.depth / 2 - 1.2, 0);

/** Heights of the sand where the twelve standing stones stand: each low water uncovers the row as far as its own depth. */
export const STONE_HEIGHTS = [3.0, 1.6, 0.2, -1.2, -2.4, -3.4, -4.3, -5.0, -5.6, -6.2, -6.8, -7.25];
/** The row runs due west from the island along z = ROW_Z. */
export const ROW_Z = 0;

export interface Stone {
  index: number;
  x: number;
  z: number;
  /** Height of the sand at its foot. */
  ground: number;
  /** How tall it stands above the sand. */
  tall: number;
  /**
   * The moon carved on its landward face. `lit` is how full the moon must at least be for the sea to leave this stone
   * (0.5 means even a half moon will do), `size` how large it must at least look (1 is its mean size).
   */
  lit: number;
  size: number;
}

/** What moon the sea needs before a low water falls to `ground`. Worked out from the same rule as the tide itself. */
function moonFor(ground: number): { lit: number; size: number } {
  const depth = -ground;
  const nearest = TIDE_MOON / Math.pow(1 - ECC, 3);
  // how far from full (or new) the moon may be, when it is at its nearest
  const c = (depth * depth - nearest * nearest - TIDE_SUN * TIDE_SUN) / (2 * nearest * TIDE_SUN);
  const lit = depth <= 0 || c <= -1 ? 0.5 : (1 + Math.cos(Math.acos(Math.min(1, c)) / 2)) / 2;
  // how near the moon must be, when it is exactly full (or new)
  const farthest = 1 + ECC;
  const distance = depth - TIDE_SUN <= 0 ? farthest : Math.min(farthest, Math.cbrt(TIDE_MOON / (depth - TIDE_SUN)));
  return { lit, size: 1 / distance };
}

export const STONES: Stone[] = STONE_HEIGHTS.map((ground, index) => ({
  index,
  x: -distanceToHeight(WEST, ground),
  z: ROW_Z,
  ground,
  tall: 3.1 + 1.1 * Math.abs(Math.sin(index * 12.9898)),
  ...moonFor(ground),
}));

/**
 * The far lamp: a lantern on a low stone table, on sand only the great low uncovers. The great low reaches -7.64 and
 * the next best spring -7.15, so a lantern at -7.38 is clear of the water twice in 35 days (one dusk and the dawn
 * after it), for about five real minutes each time. At the next best springs it shows through 23 cm of water.
 */
export const FAR_LAMP_GROUND = -7.75;
export const FAR_LAMP = { x: -distanceToHeight(WEST, FAR_LAMP_GROUND), z: ROW_Z, ground: FAR_LAMP_GROUND };
/** The lantern itself must be clear of the water before it can be lit. */
export const FAR_LAMP_FLAME = FAR_LAMP_GROUND + 0.37;

/** The drowned walls and stairs, to the south-south-west, on sand that most low waters uncover. */
const ruinsAngle = (105 * Math.PI) / 180;
const ruinsR = distanceToHeight(ruinsAngle, -1.2);
export const RUINS = { x: Math.cos(ruinsAngle) * ruinsR, z: Math.sin(ruinsAngle) * ruinsR, level: -1.2 };
/** The stairs go down into a pit that never drains. */
export const PIT = { x: RUINS.x + 9, z: RUINS.z + 5, depth: 3.2 };

/** The causeway from the foot of the island to the ruins, as a bent line. */
export const CAUSEWAY: [number, number][] = (() => {
  const a0 = (118 * Math.PI) / 180;
  const start: [number, number] = [Math.cos(a0) * 168, Math.sin(a0) * 168];
  const end: [number, number] = [RUINS.x - 4, RUINS.z - 20];
  const pts: [number, number][] = [];
  const bends = [0, 9, -7, 6, -4, 0];
  for (let i = 0; i < bends.length; i++) {
    const f = i / (bends.length - 1);
    const x = start[0] + (end[0] - start[0]) * f;
    const z = start[1] + (end[1] - start[1]) * f;
    // offset sideways (the line runs mostly south, so sideways is mostly east-west)
    pts.push([x + bends[i], z]);
  }
  return pts;
})();

/** Distance from a point to the causeway line. */
export function distanceToCauseway(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < CAUSEWAY.length; i++) {
    const [ax, az] = CAUSEWAY[i];
    const [bx, bz] = CAUSEWAY[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Three wind-bent trees on the hill, leaning away from the west wind. */
export const TREES: { x: number; z: number; size: number }[] = [
  { x: -8, z: -22, size: 1.0 },
  { x: 14, z: -6, size: 0.8 },
  { x: -52, z: 38, size: 0.7 },
];
