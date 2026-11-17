import { describe, expect, it } from 'vitest';
import { DAY, HIGHEST_TIDE } from '../src/world/constants';
import { heavens, nextLowWater, tideAt } from '../src/world/heavens';
import { FAR_LAMP, FAR_LAMP_FLAME, HOUSE, RUINS, SEATS, SHELF_ITEMS_AT, SHELF_PLANKS, SHELF_ROW, STONES } from '../src/world/layout';
import { profile } from '../src/world/shape';
import { buildTerrain, floodFill } from '../src/world/terrain';

/** Every low water in [from, to). */
function lowWaters(from: number, to: number): { t: number; h: number }[] {
  const out: { t: number; h: number }[] = [];
  let t = from;
  while (t < to) {
    const lw = nextLowWater(t);
    if (lw.t >= to) break;
    out.push(lw);
    t = lw.t + 3600;
  }
  return out;
}

describe('the sky', () => {
  it('has the sun rise in the east at six and stand in the south at noon', () => {
    const rise = heavens(0.25 * DAY).sunDir;
    expect(rise[1]).toBeCloseTo(0, 5);
    expect(rise[0]).toBeGreaterThan(0.99);
    const noon = heavens(0.5 * DAY).sunDir;
    expect(noon[2]).toBeGreaterThan(0.7); // south is +z
    expect(noon[1]).toBeCloseTo(Math.cos((48 * Math.PI) / 180), 5);
  });
  it('has a new moon on day 0 and a full moon on day 5', () => {
    expect(heavens(0).moonLit).toBeCloseTo(0, 5);
    expect(heavens(5 * DAY).moonLit).toBeCloseTo(1, 5);
  });
});

describe('the tide', () => {
  it('never rises above the highest tide', () => {
    let hi = -Infinity;
    for (let t = 0; t < 70 * DAY; t += 300) hi = Math.max(hi, tideAt(t));
    expect(hi).toBeLessThanOrEqual(HIGHEST_TIDE + 1e-9);
    expect(hi).toBeGreaterThan(HIGHEST_TIDE - 0.05);
  });

  it('has its great low just after sunrise on day 0, and again every 35 days', () => {
    const lows = lowWaters(-2 * DAY, 72 * DAY);
    const deepest = [...lows].sort((a, b) => a.h - b.h).slice(0, 3);
    for (const d of deepest) {
      const day = d.t / DAY;
      const nearest = Math.round(day / 35) * 35;
      expect(Math.abs(day - nearest)).toBeLessThan(0.9);
    }
    const first = lows.filter((l) => Math.abs(l.t - 0.25 * DAY) < 0.2 * DAY)[0];
    expect(first.h).toBeLessThan(-7.6);
    expect(first.t / 3600).toBeGreaterThan(6);
    expect(first.t / 3600).toBeLessThan(7);
  });

  it('uncovers the far lamp only around the great low', () => {
    const lows = lowWaters(-2 * DAY, 72 * DAY);
    const reach = lows.filter((l) => l.h < FAR_LAMP_FLAME);
    expect(reach.length).toBeGreaterThan(0);
    for (const l of reach) {
      const day = l.t / DAY;
      expect(Math.abs(day - Math.round(day / 35) * 35)).toBeLessThan(1.2);
    }
    // and it is rare: a handful of tides out of more than a hundred
    expect(reach.length).toBeLessThan(lows.length / 12);
  });

  it('uncovers more of the stone row at springs than at neaps', () => {
    const lows = lowWaters(0, 35 * DAY);
    const count = (h: number) => STONES.filter((s) => s.ground > h).length;
    const counts = lows.map((l) => count(l.h));
    expect(Math.min(...counts)).toBeLessThanOrEqual(5);
    expect(Math.max(...counts)).toBe(12);
  });
});

describe('the ground', () => {
  it('puts each stone where the smooth sand is at its height', () => {
    for (const s of STONES) expect(profile(s.x, s.z)).toBeCloseTo(s.ground, 2);
    expect(profile(FAR_LAMP.x, FAR_LAMP.z)).toBeCloseTo(FAR_LAMP.ground, 2);
    expect(profile(RUINS.x, RUINS.z)).toBeCloseTo(RUINS.level, 2);
    for (let i = 1; i < STONES.length; i++) expect(STONES[i].x).toBeLessThan(STONES[i - 1].x);
  });

  it('gives the north bench a clear view of the northern sky', () => {
    const t = buildTerrain(257);
    const [ex, ey, ez] = SEATS[1].eye;
    expect(SEATS[1].yaw).toBe(0);
    // nothing of the land stands more than five degrees above the horizon anywhere from north-west to north-east,
    // and the Pole Star is 48 degrees up
    for (let bearing = -45; bearing <= 45; bearing += 5) {
      const dx = Math.sin((bearing * Math.PI) / 180);
      const dz = -Math.cos((bearing * Math.PI) / 180);
      for (let d = 3; d < 1000; d += 3) {
        const rise = t.heightAt(ex + dx * d, ez + dz * d) - ey;
        expect(rise / d).toBeLessThan(Math.tan((5 * Math.PI) / 180));
      }
    }
  });

  it('has room on the shelf for eighteen things, each in its own place', () => {
    const seen = new Set<string>();
    for (let i = 0; i < SHELF_ROW * SHELF_PLANKS; i++) seen.add(SHELF_ITEMS_AT(i).map((v) => v.toFixed(3)).join(','));
    expect(seen.size).toBe(18);
  });

  it('keeps the house above every tide', () => {
    expect(HOUSE.floor).toBeGreaterThan(HIGHEST_TIDE + 15);
  });

  it('fills a bowl to its rim', () => {
    const n = 9;
    const h = new Float32Array(n * n).fill(5);
    // a bowl in the middle with a notch in its rim at height 3
    for (let j = 2; j <= 6; j++) for (let i = 2; i <= 6; i++) h[j * n + i] = 1;
    for (let k = 0; k < n; k++) {
      h[k] = 0;
      h[(n - 1) * n + k] = 0;
      h[k * n] = 0;
      h[k * n + n - 1] = 0;
    }
    h[4 * n + 1] = 3;
    const fill = floodFill(h, n);
    expect(fill[4 * n + 4]).toBeCloseTo(3, 5);
    expect(fill[0]).toBeCloseTo(0, 5);
  });

  it('builds an island with pools on the flats and a dry hill', () => {
    const t = buildTerrain(257);
    expect(t.heightAt(0, 0)).toBeGreaterThan(30);
    let pools = 0;
    for (let k = 0; k < t.h.length; k++) {
      expect(t.fill[k]).toBeGreaterThanOrEqual(t.h[k]);
      if (t.fill[k] > t.h[k] + 0.05) pools++;
    }
    expect(pools).toBeGreaterThan(200);
    // at high water the top of the beach is dry and the flats are sea
    expect(t.waterAt(0, 0, HIGHEST_TIDE)).toBe(-Infinity);
    expect(t.waterAt(-600, 0, 5)).toBe(5);
  });
});
