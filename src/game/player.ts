import type { Terrain } from '../world/terrain';

/** A solid thing the walker cannot pass through, or can step onto: a box standing on the ground, turned by `yaw`. */
export interface Solid {
  x: number;
  z: number;
  /** Half sizes along the box's own axes. */
  hx: number;
  hz: number;
  /** Rotation about the vertical axis (radians). */
  yaw: number;
  /** Bottom and top heights. */
  y0: number;
  y1: number;
}

export interface Controls {
  /** -1..1 each: strafe right, walk forward. */
  moveX: number;
  moveZ: number;
  run: boolean;
  /** Look deltas in radians accumulated since the last update. */
  lookX: number;
  lookY: number;
}

const EYE = 1.62;
const RADIUS = 0.3;
const STEP = 0.5;
/** Depth of water at which the walker floats. */
const FLOAT_DEPTH = 1.35;

export class Player {
  x = 0;
  z = 0;
  /** Height of the feet. */
  y = 0;
  yaw = 0;
  pitch = 0;
  swimming = false;
  /** When set, the walker is seated: eye position fixed, only looking around. */
  seat: { x: number; y: number; z: number } | null = null;

  constructor(
    private terrain: Terrain,
    private solids: Solid[],
  ) {}

  place(x: number, z: number, yaw: number, pitch = 0): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = pitch;
    this.y = this.floorAt(x, z, Infinity);
  }

  /** Yaw that looks along (dx, dz). */
  static yawToward(dx: number, dz: number): number {
    return Math.atan2(-dx, -dz);
  }

  /** Height of whatever can be stood on at a point, for feet currently at `feet`. */
  private floorAt(x: number, z: number, feet: number): number {
    let top = this.terrain.heightAt(x, z);
    for (const s of this.solids) {
      if (s.y1 > feet + STEP || s.y1 < top) continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const dx = x - s.x;
      const dz = z - s.z;
      const lx = dx * c + dz * sn;
      const lz = -dx * sn + dz * c;
      if (Math.abs(lx) <= s.hx && Math.abs(lz) <= s.hz) top = s.y1;
    }
    return top;
  }

  /** Push the walker out of anything too tall to step onto. */
  private collide(): void {
    for (const s of this.solids) {
      if (s.y1 <= this.y + STEP || s.y0 >= this.y + EYE + 0.1) continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const dx = this.x - s.x;
      const dz = this.z - s.z;
      let lx = dx * c + dz * sn;
      let lz = -dx * sn + dz * c;
      const px = s.hx + RADIUS - Math.abs(lx);
      const pz = s.hz + RADIUS - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) lx += Math.sign(lx || 1) * px;
      else lz += Math.sign(lz || 1) * pz;
      this.x = s.x + lx * c - lz * sn;
      this.z = s.z + lx * sn + lz * c;
    }
  }

  update(dt: number, c: Controls, tide: number): void {
    this.yaw -= c.lookX;
    this.pitch = Math.min(1.45, Math.max(-1.45, this.pitch - c.lookY));
    if (this.seat) return;

    const groundHere = this.terrain.heightAt(this.x, this.z);
    const water = this.terrain.waterAt(this.x, this.z, tide);
    const depth = Math.max(0, water - groundHere);
    this.swimming = depth > FLOAT_DEPTH;

    let speed = c.run ? 4.4 : 1.75;
    if (this.swimming) speed = c.run ? 1.6 : 1.1;
    else if (depth > 0.15) speed *= 1 - 0.55 * Math.min(1, (depth - 0.15) / 1.0);

    const len = Math.hypot(c.moveX, c.moveZ);
    if (len > 0.01) {
      const k = (speed * dt) / Math.max(1, len);
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      this.x += (fx * c.moveZ + rx * c.moveX) * k;
      this.z += (fz * c.moveZ + rz * c.moveX) * k;
      this.collide();
      const lim = this.terrain.size / 2 - 20;
      this.x = Math.min(lim, Math.max(-lim, this.x));
      this.z = Math.min(lim, Math.max(-lim, this.z));
    }

    let target = this.floorAt(this.x, this.z, this.y);
    const w = this.terrain.waterAt(this.x, this.z, tide);
    if (w - target > FLOAT_DEPTH) target = w - FLOAT_DEPTH;
    // feet follow the ground quickly going up, and fall a little more slowly
    const rate = target > this.y ? 14 : 9;
    this.y += (target - this.y) * Math.min(1, dt * rate);
  }

  /** Eye position. */
  eye(): { x: number; y: number; z: number } {
    if (this.seat) return this.seat;
    return { x: this.x, y: this.y + EYE, z: this.z };
  }
}
