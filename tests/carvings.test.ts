import { describe, expect, it } from 'vitest';
import { DAY } from '../src/world/constants';
import { heavens, nextLowWater } from '../src/world/heavens';
import { STONES } from '../src/world/layout';

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

describe('the moons carved on the stones', () => {
  const lows = lowWaters(0, 70 * DAY).map((l) => ({ ...l, sky: heavens(l.t) }));

  it('tell the truth: whenever the sea leaves a stone, the moon is at least as full (or as new) and as large as carved', () => {
    for (const s of STONES) {
      const dry = lows.filter((l) => l.h < s.ground);
      expect(dry.length, `stone ${s.index + 1} is never uncovered`).toBeGreaterThan(0);
      for (const l of dry) {
        const lit = l.sky.moonLit;
        const fullEnough = lit >= s.lit - 0.03;
        const newEnough = lit <= 1 - s.lit + 0.03;
        expect(fullEnough || newEnough, `stone ${s.index + 1}: dry with the moon ${(lit * 100).toFixed(0)}% lit, carved ${(s.lit * 100).toFixed(0)}%`).toBe(true);
        expect(1 / l.sky.moonDistance, `stone ${s.index + 1}: dry with a moon of size ${(1 / l.sky.moonDistance).toFixed(3)}, carved ${s.size.toFixed(3)}`).toBeGreaterThan(s.size - 0.012);
      }
    }
  });

  it('ask more of the moon the further out the stone stands', () => {
    for (let i = 1; i < STONES.length; i++) {
      expect(STONES[i].lit).toBeGreaterThanOrEqual(STONES[i - 1].lit - 1e-9);
      expect(STONES[i].size).toBeGreaterThanOrEqual(STONES[i - 1].size - 1e-9);
    }
    expect(STONES[STONES.length - 1].lit).toBeGreaterThan(0.9);
  });

  it('are met by new moons as often as by full ones', () => {
    // the far stones are uncovered around new moon as well as around full moon
    const far = STONES[10];
    const dry = lows.filter((l) => l.h < far.ground);
    expect(dry.some((l) => l.sky.moonLit < 0.2)).toBe(true);
    expect(dry.some((l) => l.sky.moonLit > 0.8)).toBe(true);
  });
});
