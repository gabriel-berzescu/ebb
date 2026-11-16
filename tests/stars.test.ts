import { describe, expect, it } from 'vitest';
import { DAY, LATITUDE, YEAR } from '../src/world/constants';
import { equatorial, siderealTime, starDirection, starFrame, starNear, STARS } from '../src/world/stars';

const deg = (r: number) => (r * 180) / Math.PI;
const hours = (r: number) => (r / (2 * Math.PI)) * 24;

/** Altitude and azimuth (degrees; azimuth from north through east) of a world direction. */
function altAz(v: [number, number, number]): { alt: number; az: number } {
  return { alt: deg(Math.asin(v[1])), az: (deg(Math.atan2(v[0], -v[2])) + 360) % 360 };
}

describe('the star catalogue', () => {
  it('holds the naked-eye stars, brightest first', () => {
    expect(STARS.length).toBeGreaterThan(8000);
    expect(STARS.length).toBeLessThan(9200);
    for (let i = 1; i < STARS.length; i++) expect(STARS[i].mag).toBeGreaterThanOrEqual(STARS[i - 1].mag - 1e-9);
    // Sirius
    expect(STARS[0].mag).toBeCloseTo(-1.46, 1);
    expect(hours(STARS[0].ra)).toBeCloseTo(6.752, 2);
    expect(deg(STARS[0].dec)).toBeCloseTo(-16.716, 1);
  });

  it('has the stars people know where they are', () => {
    const known: [string, number, number, number][] = [
      ['Polaris', 2.5303, 89.264, 2.0],
      ['Vega', 18.6156, 38.784, 0.0],
      ['Betelgeuse', 5.9195, 7.407, 0.5],
      ['Rigel', 5.2423, -8.202, 0.1],
      ['Arcturus', 14.261, 19.182, 0.0],
      ['Aldebaran', 4.5987, 16.509, 0.9],
    ];
    for (const [name, ra, dec, mag] of known) {
      const found = starNear(ra, dec);
      expect(deg(found.apart), name).toBeLessThan(0.05);
      expect(Math.abs(found.star.mag - mag), name).toBeLessThan(0.25);
    }
    // Betelgeuse is red and Rigel blue-white
    expect(starNear(5.9195, 7.407).star.bv).toBeGreaterThan(1.5);
    expect(starNear(5.2423, -8.202).star.bv).toBeLessThan(0.1);
  });

  it("has Orion's belt as three stars in a line", () => {
    const belt = [starNear(5.6793, -1.943), starNear(5.6036, -1.202), starNear(5.5334, -0.299)];
    for (const b of belt) {
      expect(deg(b.apart)).toBeLessThan(0.05);
      expect(b.star.mag).toBeLessThan(2.5);
    }
    const [a, m, c] = belt.map((b) => equatorial(b.star.ra, b.star.dec));
    const ab = Math.acos(a[0] * m[0] + a[1] * m[1] + a[2] * m[2]);
    const bc = Math.acos(m[0] * c[0] + m[1] * c[1] + m[2] * c[2]);
    const ac = Math.acos(a[0] * c[0] + a[1] * c[1] + a[2] * c[2]);
    expect(ab + bc - ac).toBeLessThan(0.002); // straight
    expect(Math.abs(ab - bc) / ab).toBeLessThan(0.1); // evenly spaced
  });

  it('has the pointers of the Plough pointing at the Pole Star', () => {
    const merak = starNear(11.0307, 56.382).star;
    const dubhe = starNear(11.0621, 61.751).star;
    const polaris = starNear(2.5303, 89.264).star;
    const a = equatorial(merak.ra, merak.dec);
    const b = equatorial(dubhe.ra, dubhe.dec);
    const p = equatorial(polaris.ra, polaris.dec);
    // carry on from Merak through Dubhe, five times their distance apart
    const step = Math.acos(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    const axis = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const n = Math.hypot(axis[0], axis[1], axis[2]);
    const k = axis.map((v) => v / n);
    const ang = step * 5;
    const kxb = [k[1] * b[2] - k[2] * b[1], k[2] * b[0] - k[0] * b[2], k[0] * b[1] - k[1] * b[0]];
    const at = b.map((v, i) => v * Math.cos(ang) + kxb[i] * Math.sin(ang));
    const miss = Math.acos(at[0] * p[0] + at[1] * p[1] + at[2] * p[2]);
    expect(deg(miss)).toBeLessThan(4);
  });
});

describe('the turning of the sky', () => {
  it('is a pure turn: the star frame stays square', () => {
    for (const t of [0, 0.3 * DAY, 5.22 * DAY, 41.7 * DAY]) {
      const [x, y, z] = starFrame(t);
      const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      expect(dot(x, x)).toBeCloseTo(1, 9);
      expect(dot(y, y)).toBeCloseTo(1, 9);
      expect(dot(z, z)).toBeCloseTo(1, 9);
      expect(dot(x, y)).toBeCloseTo(0, 9);
      expect(dot(y, z)).toBeCloseTo(0, 9);
      expect(dot(x, z)).toBeCloseTo(0, 9);
      // right-handed
      const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      expect(dot(cross, z)).toBeCloseTo(1, 9);
    }
  });

  it('keeps the Pole Star due north, as high as the latitude, at every hour', () => {
    const polaris = starNear(2.5303, 89.264).star;
    for (let h = 0; h < 24; h += 3) {
      const { alt, az } = altAz(starDirection(polaris, 12 * DAY + h * 3600));
      expect(Math.abs(alt - deg(LATITUDE))).toBeLessThan(1);
      expect(Math.min(az, 360 - az)).toBeLessThan(1.5);
    }
  });

  it('has the winter stars in the south at midnight on day 0', () => {
    const sirius = altAz(starDirection(STARS[0], 0));
    expect(sirius.alt).toBeGreaterThan(20);
    expect(Math.abs(sirius.az - 180)).toBeLessThan(20);
    const alnilam = altAz(starDirection(starNear(5.6036, -1.202).star, 0));
    expect(alnilam.alt).toBeGreaterThan(35);
    expect(Math.abs(alnilam.az - 180)).toBeLessThan(15);
  });

  it('never lets Capella set, and brings the same sky back after a year', () => {
    const capella = starNear(5.2782, 45.998).star;
    for (let h = 0; h < 24; h += 1) expect(altAz(starDirection(capella, 3 * DAY + h * 3600)).alt).toBeGreaterThan(0);
    // in a year the stars turn once more than the sun does
    const turn = (siderealTime(YEAR * DAY) - siderealTime(0)) / (2 * Math.PI);
    expect(turn).toBeCloseTo(YEAR + 1, 6);
    const before = starDirection(STARS[0], 7 * 3600);
    const after = starDirection(STARS[0], YEAR * DAY + 7 * 3600);
    for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(before[i], 6);
  });
});
