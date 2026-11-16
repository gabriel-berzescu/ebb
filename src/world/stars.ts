import { DAY, YEAR } from './constants';
import { skyDirection, sunHourAngle, type Vec3 } from './heavens';
import { STAR_BYTES, STAR_COUNT } from './starsData';

/**
 * The real stars: every star the eye can see, where it really is.
 *
 * Positions are right ascension and declination (epoch J2000), from the Yale Bright Star Catalogue. The island is at
 * 48 degrees north, so the Pole Star stands 48 degrees up, due north, and the sky turns about it once a day. What is
 * not real is the calendar: the sun here stays on the celestial equator, and goes once round the stars in a year of 70
 * days, so the constellations of every season come round between one great low and the next but one.
 */

export interface Star {
  /** Right ascension and declination, radians. */
  ra: number;
  dec: number;
  /** Visual magnitude: smaller is brighter. Sirius is -1.46, the faintest here 6.5. */
  mag: number;
  /** Colour index B-V: about -0.3 for the bluest stars, 0 white, 0.65 the sun, 1.5 and more for red giants. */
  bv: number;
}

function decode(): Star[] {
  const bin = atob(STAR_BYTES);
  const out: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const b = (k: number) => bin.charCodeAt(i * 6 + k);
    const ra = ((b(0) | (b(1) << 8)) / 65536) * 2 * Math.PI;
    let d = b(2) | (b(3) << 8);
    if (d >= 32768) d -= 65536;
    out.push({ ra, dec: (d / 32767) * (Math.PI / 2), mag: b(4) / 30 - 1.5, bv: b(5) / 100 - 0.4 });
  }
  return out;
}

/** All the stars, brightest first. */
export const STARS: Star[] = decode();

/** Unit vector of a point of the sky in the frame the stars are fixed in: x to RA 0h on the equator, y to RA 6h, z to the pole. */
export function equatorial(ra: number, dec: number): Vec3 {
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Right ascension of the sun. At t = 0 it is at 18h, so the midnight sky of the first great low is the winter sky: Orion, Sirius, the Twins. */
export function sunRightAscension(t: number): number {
  return 1.5 * Math.PI + (2 * Math.PI * t) / (YEAR * DAY);
}

/** Local sidereal time (radians): the right ascension now on the meridian. */
export function siderealTime(t: number): number {
  return sunHourAngle(t) + sunRightAscension(t);
}

/**
 * The turn that carries the star frame into world axes (+x east, +y up, +z south) at time t, as the three columns
 * of a matrix: where the star frame's x, y and z axes point in the world.
 */
export function starFrame(t: number): [Vec3, Vec3, Vec3] {
  const lst = siderealTime(t);
  return [skyDirection(lst, 0), skyDirection(lst - Math.PI / 2, 0), skyDirection(0, Math.PI / 2)];
}

/** Where a star is in the world sky at time t. */
export function starDirection(star: { ra: number; dec: number }, t: number): Vec3 {
  return skyDirection(siderealTime(t) - star.ra, star.dec);
}

/** The star nearest a place in the sky (hours of right ascension, degrees of declination), for finding a star by its position. */
export function starNear(raHours: number, decDegrees: number): { star: Star; apart: number } {
  const want = equatorial((raHours / 24) * 2 * Math.PI, (decDegrees * Math.PI) / 180);
  let best = STARS[0];
  let bestDot = -2;
  for (const s of STARS) {
    const v = equatorial(s.ra, s.dec);
    const dot = v[0] * want[0] + v[1] * want[1] + v[2] * want[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = s;
    }
  }
  return { star: best, apart: Math.acos(Math.min(1, bestDot)) };
}
