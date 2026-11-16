import * as THREE from 'three';
import { HOUSE, housePoint, STONES, TREES } from '../world/layout';
import { rand2 } from '../world/noise';
import type { Terrain } from '../world/terrain';
import { Builder, Kind, type Color } from './builder';

/**
 * The pair of jackdaws that nest in the chimney. (Gabriel's part of the island.)
 *
 * They roost on the chimney at night, lift together at first light, and spend the day between the roof, the trees,
 * the bench and the nearest standing stones, with a circuit of the hill now and then. Jackdaws pair for life, so the
 * second bird always follows the first.
 */

const BLACK: Color = [0.03, 0.03, 0.036];
const NAPE: Color = [0.2, 0.2, 0.225];
const EYE: Color = [0.72, 0.76, 0.8];
const SCALE = 1.3;
const SPEED = 9;

interface Perch {
  at: THREE.Vector3;
  /** Height the sea must stay below for this perch to be usable (Infinity for perches on the hill). */
  dryBelow: number;
}

type Flight = { from: THREE.Vector3; to: THREE.Vector3; perch: number; s: number; duration: number; circuit: number; side: number; lift: number };

class Bird {
  readonly group = new THREE.Group();
  private wingL: THREE.Mesh;
  private wingR: THREE.Mesh;
  perch = 0;
  flight: Flight | null = null;
  /** Real seconds until it next thinks about moving. */
  wait = 0;
  /** Real seconds until it next calls from its perch. */
  callIn = 6;
  /** Each bird has its own voice. */
  readonly pitch: number;
  private yaw = 0;
  private yawTarget = 0;
  private phase = 0;
  private pos = new THREE.Vector3();
  private ahead = new THREE.Vector3();

  constructor(private seed: number) {
    this.pitch = 0.94 + 0.07 * seed;
    const body = new Builder();
    body.lump([0, 0, 0], [0.075, 0.07, 0.19], BLACK, Kind.slate, 3 + seed, 0.08, [0, 0], 1);
    body.lump([0, 0.055, 0.125], [0.062, 0.052, 0.062], NAPE, Kind.slate, 5 + seed, 0.05, [0, 0], 1);
    body.lump([0, 0.062, 0.2], [0.05, 0.05, 0.058], BLACK, Kind.slate, 7 + seed, 0.05, [0, 0], 1);
    body.box([0, 0.04, 0.265], [0.011, 0.03], 0.02, 0, BLACK, Kind.slate);
    body.box([0, -0.012, -0.25], [0.05, 0.1], 0.012, 0, BLACK, Kind.slate);
    for (const sx of [-1, 1]) body.lump([sx * 0.043, 0.075, 0.222], [0.012, 0.012, 0.012], EYE, Kind.slate, 9, 0, [0, 0], 0);
    this.group.add(body.mesh());

    const wing = (sx: number): THREE.Mesh => {
      const w = new Builder();
      w.quad([0, 0, 0.1], [sx * 0.46, 0, 0.03], [sx * 0.5, 0, -0.1], [0, 0, -0.13], BLACK, Kind.slate);
      w.tri([sx * 0.2, 0.001, 0.07], [sx * 0.46, 0.001, 0.03], [sx * 0.36, 0.001, -0.11], [0.05, 0.05, 0.058], Kind.slate);
      const m = w.mesh();
      m.position.set(sx * 0.05, 0.035, 0.03);
      this.group.add(m);
      return m;
    };
    this.wingL = wing(1);
    this.wingR = wing(-1);
    this.group.scale.setScalar(SCALE);
    this.group.rotation.order = 'YXZ';
  }

  sitAt(p: Perch, index: number): void {
    this.perch = index;
    this.flight = null;
    this.pos.copy(p.at);
    this.yaw = this.yawTarget = this.seed * 2.1;
  }

  flyTo(from: THREE.Vector3, p: Perch, index: number, circuit: number): void {
    const dist = from.distanceTo(p.at);
    const ring = circuit > 0 ? 2 * Math.PI * 26 * circuit : 0;
    this.flight = {
      from: from.clone(),
      to: p.at.clone(),
      perch: index,
      s: 0,
      duration: Math.max(1.6, (dist + ring) / SPEED),
      circuit,
      side: rand2(Math.floor(this.phase * 10), this.seed, 31) > 0.5 ? 1 : -1,
      lift: 2 + Math.min(10, dist * 0.12),
    };
  }

  get position(): THREE.Vector3 {
    return this.pos;
  }

  /** Where the bird is at fraction s of its flight. */
  private along(f: Flight, s: number, out: THREE.Vector3): void {
    const e = s * s * (3 - 2 * s);
    out.lerpVectors(f.from, f.to, e);
    out.y += f.lift * 4 * e * (1 - e);
    // a swing to one side, so no flight is a straight line
    const dx = f.to.x - f.from.x;
    const dz = f.to.z - f.from.z;
    const len = Math.hypot(dx, dz) || 1;
    const sw = Math.sin(Math.PI * e) * Math.min(6, len * 0.2) * f.side;
    out.x += (-dz / len) * sw;
    out.z += (dx / len) * sw;
    if (f.circuit > 0) {
      // out to a ring about the top of the hill, round it, and back
      const a = f.side * 2 * Math.PI * f.circuit * s + this.seed;
      const ringX = HOUSE.x + 8 + Math.cos(a) * 26;
      const ringZ = HOUSE.z - 4 + Math.sin(a) * 26;
      const ringY = HOUSE.floor + 9 + 3 * Math.sin(a * 0.7 + 1);
      const w = smooth(0, 0.18, s) * (1 - smooth(0.82, 1, s));
      out.x += (ringX - out.x) * w;
      out.y += (ringY - out.y) * w;
      out.z += (ringZ - out.z) * w;
    }
  }

  update(dt: number): void {
    this.phase += dt;
    const g = this.group;
    const f = this.flight;
    if (f) {
      f.s = Math.min(1, f.s + dt / f.duration);
      this.along(f, f.s, this.pos);
      this.along(f, Math.min(1, f.s + 0.02), this.ahead);
      g.position.copy(this.pos);
      if (this.ahead.distanceToSquared(this.pos) > 1e-6) g.lookAt(this.ahead);
      // flap, with short glides; flap harder when taking off and landing
      const ends = 1 - smooth(0.06, 0.2, f.s) * (1 - smooth(0.8, 0.94, f.s));
      const glide = ends < 0.3 && Math.sin(this.phase * 0.9 + this.seed * 3) > 0.55;
      const flap = glide ? 0.12 : 0.12 + (0.62 + 0.25 * ends) * Math.sin(this.phase * (30 + 8 * ends));
      this.wingL.visible = this.wingR.visible = true;
      this.wingL.rotation.z = flap;
      this.wingR.rotation.z = -flap;
      if (f.s >= 1) {
        this.flight = null;
        this.perch = f.perch;
        this.pos.copy(f.to);
        this.yawTarget = this.yaw = g.rotation.y;
      }
      return;
    }
    // perched: upright, wings folded away, looking about in small quick turns
    if (rand2(Math.floor(this.phase * 1.3), this.seed, 41) > 0.72) this.yawTarget = this.seed + rand2(Math.floor(this.phase * 1.3), this.seed, 42) * 6.3;
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 9);
    const bob = Math.max(0, Math.sin(this.phase * 2.3 + this.seed * 5) - 0.9) * 6;
    g.position.set(this.pos.x, this.pos.y + 0.085 * SCALE, this.pos.z);
    g.rotation.set(-0.55 + bob, this.yaw, 0);
    this.wingL.visible = this.wingR.visible = false;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Jackdaws {
  readonly group = new THREE.Group();
  private birds = [new Bird(0.37), new Bird(1.91)];
  private perches: Perch[] = [];
  /** The first two perches are the roost: the chimney pot and the shoulder of the stack beside it. */
  private readonly roost = [0, 1];
  private follow = -1;
  private followIn = 0;
  private tick = 0;
  private wasDay = false;
  /** Seconds left of the calling that comes before the first flight of the morning. */
  private chorus = 0;
  private chorusNext = 0;
  private chorusTurn = 0;
  /** Called whenever a bird calls: where it is, the pitch of its voice, and a delay in seconds. */
  onCall: ((x: number, y: number, z: number, pitch: number, delay: number) => void) | null = null;

  constructor(terrain: Terrain) {
    const W = HOUSE.width;
    const D = HOUSE.depth;
    const ridge = HOUSE.wall + 1.75;
    const hill = (p: [number, number, number]): Perch => ({ at: new THREE.Vector3(p[0], p[1], p[2]), dryBelow: Infinity });
    this.perches.push(hill(housePoint(W / 2 - 0.52, 0, ridge + 1.08)));
    this.perches.push(hill(housePoint(W / 2 - 0.22, 0.24, ridge + 0.8)));
    this.perches.push(hill(housePoint(-1.6, 0, ridge + 0.01)));
    this.perches.push(hill(housePoint(0.4, 0, ridge + 0.01)));
    this.perches.push(hill(housePoint(-2.1, D / 2 + 0.08, 0.92)));
    this.perches.push(hill(housePoint(-1.2, D / 2 + 0.08, 0.92)));
    for (const [a, o] of [
      [-3.5, D / 2 + 5],
      [-2.6, D / 2 + 5.6],
      [3, -D / 2 - 4],
      [3.8, -D / 2 - 4.5],
    ]) {
      const [x, , z] = housePoint(a, o);
      this.perches.push(hill([x, terrain.heightAt(x, z), z]));
    }
    for (const t of TREES) {
      const base = terrain.heightAt(t.x, t.z) - 0.3;
      this.perches.push(hill([t.x + 2.3 * t.size, base + 4.05 * t.size, t.z]));
      this.perches.push(hill([t.x + 3.3 * t.size, base + 3.85 * t.size, t.z + 0.3]));
    }
    for (const s of STONES.slice(0, 3)) {
      const top = terrain.heightAt(s.x, s.z) + s.tall - 0.3;
      this.perches.push({ at: new THREE.Vector3(s.x, top + 0.33, s.z), dryBelow: top - 0.6 });
    }
    this.birds.forEach((b, i) => {
      b.sitAt(this.perches[this.roost[i]], this.roost[i]);
      b.wait = 4 + i * 2;
      this.group.add(b.group);
    });
  }

  /**
   * @param dt real seconds: the birds live at their own pace however fast the days are running
   * @param sunHeight sine of the sun's altitude
   */
  update(dt: number, sunHeight: number, tide: number): void {
    const [first, second] = this.birds;
    const day = sunHeight > -0.035;
    this.tick++;
    const call = (b: Bird, delay = 0) => this.onCall?.(b.position.x, b.position.y, b.position.z, b.pitch * (0.96 + 0.08 * Math.random()), delay);

    // First light. Jackdaws at a roost call back and forth, faster and faster, and when the calling is loud
    // enough they all go at once: the roost takes a vote. Here there are two of them, and they agree.
    let lift = false;
    if (day && !this.wasDay && !first.flight && !second.flight && dt < 0.5) {
      this.chorus = 7;
      this.chorusNext = 0.4;
    }
    this.wasDay = day;
    if (this.chorus > 0) {
      this.chorus -= dt;
      this.chorusNext -= dt;
      if (this.chorusNext <= 0) {
        call(this.birds[this.chorusTurn++ % 2]);
        this.chorusNext = 0.22 + 1.3 * Math.max(0, this.chorus / 7) * (0.7 + 0.6 * Math.random());
      }
      first.wait = Math.max(first.wait, 0.01);
      if (this.chorus <= 0) {
        lift = true;
        first.wait = 0;
      } else first.wait = this.chorus + 1;
    }

    // from a perch, a call now and then through the day
    if (day && this.chorus <= 0) {
      for (const b of this.birds) {
        if (b.flight) continue;
        b.callIn -= dt;
        if (b.callIn <= 0) {
          call(b);
          if (Math.random() < 0.4) call(b, 0.17);
          b.callIn = 9 + Math.random() * 26;
        }
      }
    }

    const free = (i: number) => this.perches[i].dryBelow > tide && this.birds.every((b) => b.perch !== i && b.flight?.perch !== i);
    const choose = (seed: number): number => {
      for (let k = 0; k < 12; k++) {
        const i = Math.floor(rand2(this.tick + k * 7, seed, 51) * this.perches.length);
        if (free(i)) return i;
      }
      return -1;
    };
    const neighbour = (i: number): number => {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < this.perches.length; j++) {
        if (j === i || !free(j)) continue;
        const d = this.perches[j].at.distanceToSquared(this.perches[i].at);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    };

    if (!first.flight) {
      first.wait -= dt;
      const atRoost = first.perch === this.roost[0];
      let target = -1;
      let circuit = 0;
      if (!day && !atRoost) target = this.roost[0];
      else if (day && first.wait <= 0) {
        target = choose(3);
        // now and then, a turn or two about the hill before coming down; always after the morning's calling
        circuit = lift ? 2 : rand2(this.tick, 9, 52) > 0.6 ? 1 + Math.floor(rand2(this.tick, 10, 52) * 2) : 0;
      }
      // a stone the tide is about to cover is no place to stay
      if (target < 0 && this.perches[first.perch].dryBelow <= tide) target = choose(4);
      if (target >= 0) {
        first.flyTo(first.position, this.perches[target], target, circuit);
        first.wait = 14 + rand2(this.tick, 11, 53) * 38;
        // a call on leaving, and the mate answers
        call(first);
        call(first, 0.16);
        call(second, 0.42);
        // the mate goes too, a moment later, to the nearest free place
        this.follow = !day ? this.roost[1] : neighbour(target);
        this.followIn = 0.5 + rand2(this.tick, 12, 54) * 1.2;
      }
    }
    if (this.follow >= 0 && !second.flight) {
      this.followIn -= dt;
      if (this.followIn <= 0) {
        second.flyTo(second.position, this.perches[this.follow], this.follow, first.flight?.circuit ?? 0);
        this.follow = -1;
      }
    }
    for (const b of this.birds) b.update(dt);
  }
}
