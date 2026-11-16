import { ANOMALISTIC, DAY, ECC, LATITUDE, MONTH, MOON_INCLINATION, MOON_RADIUS, TIDE_MOON, TIDE_SUN } from './constants';

export type Vec3 = [number, number, number];

/** Hour angle of the sun: 0 at noon, -pi/2 at 06:00 (sunrise), +pi/2 at 18:00 (sunset). */
export function sunHourAngle(t: number): number {
  return 2 * Math.PI * (t / DAY) - Math.PI;
}

/** Angle of the moon east of the sun: 0 at new moon, pi at full moon. New moon at t = 0. */
export function elongation(t: number): number {
  return (2 * Math.PI * t) / MONTH;
}

export function moonHourAngle(t: number): number {
  return sunHourAngle(t) - elongation(t);
}

/** Distance of the moon as a fraction of its mean distance. Perigee (closest, 0.88) at t = 0. */
export function moonDistance(t: number): number {
  return 1 - ECC * Math.cos((2 * Math.PI * t) / ANOMALISTIC);
}

export function moonDeclination(t: number): number {
  return MOON_INCLINATION * Math.sin(elongation(t) + 1.0);
}

/** Unit vector toward a body at hour angle h and declination dec, in world axes (+x east, +y up, +z south). */
export function skyDirection(h: number, dec: number): Vec3 {
  const cd = Math.cos(dec);
  const sd = Math.sin(dec);
  const east = -cd * Math.sin(h);
  const up = Math.sin(LATITUDE) * sd + Math.cos(LATITUDE) * cd * Math.cos(h);
  const north = Math.cos(LATITUDE) * sd - Math.sin(LATITUDE) * cd * Math.cos(h);
  return [east, up, -north];
}

export interface Heavens {
  sunDir: Vec3;
  moonDir: Vec3;
  /** 0 new, pi full, wrapped to [0, 2pi). */
  elongation: number;
  /** Lit fraction of the moon's disc, 0..1. */
  moonLit: number;
  /** Moon distance / mean distance. */
  moonDistance: number;
  /** Apparent angular radius of the moon (radians). */
  moonRadius: number;
}

export function heavens(t: number): Heavens {
  const e = elongation(t);
  const dist = moonDistance(t);
  const tau = 2 * Math.PI;
  return {
    sunDir: skyDirection(sunHourAngle(t), 0),
    moonDir: skyDirection(moonHourAngle(t), moonDeclination(t)),
    elongation: ((e % tau) + tau) % tau,
    moonLit: (1 - Math.cos(e)) / 2,
    moonDistance: dist,
    moonRadius: MOON_RADIUS / dist,
  };
}

/**
 * Height of the sea (metres above mean sea level).
 *
 * Each body raises two bulges, so the water is high when the body is overhead or underfoot. The moon's pull goes with
 * the inverse cube of its distance. When sun and moon line up (new or full moon) the two tides add: springs. When the
 * moon is also at perigee they add to the great tide, and the low water of that day is the lowest the sea ever goes.
 */
export function tideAt(t: number): number {
  const d = moonDistance(t);
  return (TIDE_MOON / (d * d * d)) * Math.cos(2 * moonHourAngle(t)) + TIDE_SUN * Math.cos(2 * sunHourAngle(t));
}

/** Highest the sea has been in the last `span` world seconds: sand below this line is still wet. */
export function wetLine(t: number, span = 7 * 3600): number {
  let m = -Infinity;
  for (let i = 0; i <= 20; i++) m = Math.max(m, tideAt(t - (span * i) / 20));
  return m;
}

/** Time and height of the next low water after t (within two days). */
export function nextLowWater(t: number): { t: number; h: number } {
  const step = 600;
  let prev = tideAt(t);
  let falling = false;
  for (let s = t + step; s < t + 2 * DAY; s += step) {
    const h = tideAt(s);
    if (h < prev) falling = true;
    else if (falling) {
      // minimum lies in [s - 2 step, s]: refine by ternary search
      let a = s - 2 * step;
      let b = s;
      for (let i = 0; i < 40; i++) {
        const m1 = a + (b - a) / 3;
        const m2 = b - (b - a) / 3;
        if (tideAt(m1) < tideAt(m2)) b = m2;
        else a = m1;
      }
      const tm = (a + b) / 2;
      return { t: tm, h: tideAt(tm) };
    }
    prev = h;
  }
  return { t, h: tideAt(t) };
}
