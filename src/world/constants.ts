/**
 * The numbers the world is built on. Nothing in src/world imports a renderer: this folder is the world itself,
 * and any engine can draw it.
 *
 * Lengths are metres, heights are metres above mean sea level, time is world seconds.
 * Axes: +x east, +y up, +z south (so north is -z).
 */

/** World seconds in one solar day. */
export const DAY = 86400;
/** World seconds that pass per real second: a world day lasts two real hours. */
export const RATE = 12;

/** Latitude of the island. The sun is always at equinox: it rises due east at 06:00 and sets due west at 18:00. */
export const LATITUDE = (48 * Math.PI) / 180;

/** New moon to new moon. The moon is fast here: ten days. */
export const MONTH = 10 * DAY;
/** Perigee to perigee. Four of these are 35 days, which is seven spring tides: the great low comes back every 35 days. */
export const ANOMALISTIC = 8.75 * DAY;
/** Eccentricity of the moon's orbit: at perigee the moon is visibly larger and pulls about twice as hard as at apogee. */
export const ECC = 0.12;
/** Tilt of the moon's path against the sun's, so the two never eclipse. */
export const MOON_INCLINATION = (9 * Math.PI) / 180;

/** Tide raised by the moon at its mean distance, and by the sun (metres of amplitude). */
export const TIDE_MOON = 4.0;
export const TIDE_SUN = 1.9;

/** The highest the sea ever reaches. Land above this never floods. */
export const HIGHEST_TIDE = TIDE_MOON / Math.pow(1 - ECC, 3) + TIDE_SUN;

/** Angular radius of the sun and of the moon at mean distance (radians). Larger than Earth's, so the moon's size is readable. */
export const SUN_RADIUS = 0.0095;
export const MOON_RADIUS = 0.0115;
