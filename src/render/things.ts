import { HOUSE, HOUSE_YAW } from '../world/layout';
import { Builder, Kind, type Color, type P3 } from './builder';

/**
 * The kinds of thing that can be left on the shelf, and how each is made. `at` is the spot on the plank where the
 * thing rests. To add a kind, add an entry here: its name is what goes in the "kind" field of shelf.json.
 */

type Make = (b: Builder, at: P3, seed: number) => void;

/** A point `along` the shelf from `at` (to the right, seen facing the wall), `out` from the wall, and `up`. */
const off = (at: P3, along: number, up: number, out = 0): P3 => [
  at[0] + HOUSE.side[0] * along + HOUSE.front[0] * out,
  at[1] + up,
  at[2] + HOUSE.side[1] * along + HOUSE.front[1] * out,
];
const ball = (b: Builder, at: P3, radii: P3, color: Color, seed: number, rough = 0.05, kind: number = Kind.slate) => b.lump(at, radii, color, kind, seed, rough, [0, 0], 1);
const IRON: Color = [0.08, 0.08, 0.085];

export const THINGS: Record<string, Make> = {
  /** A grey feather with a paler vane. */
  feather: (b, at, seed) => {
    ball(b, off(at, 0, 0.011), [0.105, 0.007, 0.024], [0.3, 0.31, 0.35], seed, 0.1);
    ball(b, off(at, 0.02, 0.012, 0.004), [0.06, 0.006, 0.03], [0.5, 0.51, 0.55], seed + 4, 0.1);
  },
  /** A pale sea shell. */
  shell: (b, at, seed) => {
    ball(b, off(at, 0, 0.022), [0.048, 0.022, 0.038], [0.82, 0.76, 0.68], seed, 0.2);
    ball(b, off(at, 0.03, 0.03), [0.02, 0.016, 0.018], [0.9, 0.8, 0.74], seed + 2, 0.15);
  },
  /** A smooth grey stone from the beach. */
  pebble: (b, at, seed) => ball(b, off(at, 0, 0.03), [0.05, 0.032, 0.042], [0.4, 0.4, 0.42], seed, 0.25),
  /** A small bowl of green tea. */
  cup: (b, at, seed) => {
    ball(b, off(at, 0, 0.024), [0.04, 0.024, 0.04], [0.6, 0.7, 0.62], seed, 0.03);
    ball(b, off(at, 0, 0.044), [0.031, 0.004, 0.031], [0.26, 0.33, 0.1], seed + 1, 0);
  },
  /** A mushroom with a pointed brown cap. */
  mushroom: (b, at, seed) => {
    ball(b, off(at, 0, 0.03), [0.009, 0.03, 0.009], [0.86, 0.83, 0.75], seed, 0.1);
    ball(b, off(at, 0, 0.064), [0.03, 0.02, 0.03], [0.46, 0.3, 0.15], seed + 1, 0.12);
    ball(b, off(at, 0, 0.083), [0.008, 0.008, 0.008], [0.4, 0.25, 0.12], seed + 2, 0);
  },
  /** A book with a dark red cover. */
  book: (b, at) => {
    b.box(off(at, 0, 0), [0.07, 0.05], 0.03, HOUSE_YAW, [0.28, 0.09, 0.08], Kind.slate);
    b.box(off(at, 0, 0.006), [0.068, 0.052], 0.018, HOUSE_YAW, [0.86, 0.82, 0.72], Kind.slate);
  },
  /** A green glass bottle, corked. */
  bottle: (b, at, seed) => {
    ball(b, off(at, 0, 0.052), [0.024, 0.052, 0.024], [0.1, 0.27, 0.17], seed, 0.03);
    ball(b, off(at, 0, 0.118), [0.009, 0.024, 0.009], [0.1, 0.27, 0.17], seed + 1, 0.03);
    ball(b, off(at, 0, 0.146), [0.008, 0.008, 0.008], [0.5, 0.36, 0.2], seed + 2, 0.1);
  },
  /** A fallen leaf, gone brown. */
  leaf: (b, at, seed) => ball(b, off(at, 0, 0.004), [0.055, 0.0035, 0.028], [0.46, 0.28, 0.09], seed, 0.25),
  /** A coin. */
  coin: (b, at, seed) => ball(b, off(at, 0, 0.003), [0.015, 0.003, 0.015], [0.62, 0.47, 0.16], seed, 0),
  /** A pine cone. */
  cone: (b, at, seed) => ball(b, off(at, 0, 0.022, 0), [0.036, 0.022, 0.022], [0.3, 0.2, 0.12], seed, 0.3, Kind.wood),
  /** A candle, not lit: the lamp in the window is the island's one flame. */
  candle: (b, at, seed) => {
    ball(b, off(at, 0, 0.045), [0.012, 0.045, 0.012], [0.86, 0.81, 0.66], seed, 0.04);
    ball(b, off(at, 0, 0.094), [0.002, 0.007, 0.002], [0.1, 0.09, 0.08], seed + 1, 0);
  },
  /** An iron key. */
  key: (b, at, seed) => {
    b.box(off(at, 0.01, 0), [0.032, 0.004], 0.005, HOUSE_YAW, IRON, Kind.iron);
    ball(b, off(at, -0.03, 0.003), [0.014, 0.003, 0.014], IRON, seed, 0, Kind.iron);
    b.box(off(at, 0.036, 0, 0.007), [0.005, 0.007], 0.005, HOUSE_YAW, IRON, Kind.iron);
  },
};

/** The names that can go in the "kind" field of shelf.json. Anything else is shown as a pebble. */
export const THING_KINDS = Object.keys(THINGS);

export function makeThing(b: Builder, kind: string, at: P3, seed: number): void {
  (THINGS[kind] ?? THINGS.pebble)(b, at, seed);
}
