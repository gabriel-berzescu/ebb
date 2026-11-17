import { DAY, RATE } from './constants';

/**
 * World time. The island keeps going while nobody is there: on return, the time that passed outside has passed here
 * too, twelve times over. Sitting on the bench lets it run faster.
 */

const KEY = 'ebb.clock';
/**
 * A first visit begins before sunrise on day 5: a full moon is setting over the flats, and the tide is on its way out
 * to an ordinary spring low at half past six.
 */
export const FIRST_MORNING = 5 * DAY + 5.3 * 3600;

export class Clock {
  /** World seconds. */
  t = FIRST_MORNING;
  /** Multiplier on the normal pace: 1 walking about, more when sitting and watching. */
  lapse = 1;
  /** When false the world stands still (used for screenshots). */
  running = true;
  /** A visit that began at a time given in the address is a look at that time: it does not move the island's own clock. */
  private keep = true;

  constructor(fixed?: number) {
    if (fixed !== undefined) {
      this.t = fixed;
      this.running = false;
      this.keep = false;
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { t: number; at: number };
        if (Number.isFinite(saved.t) && Number.isFinite(saved.at)) this.t = saved.t + (Math.max(0, Date.now() - saved.at) / 1000) * RATE;
      }
    } catch {
      /* no storage: every visit is a first morning */
    }
  }

  advance(realSeconds: number): void {
    if (this.running) this.t += realSeconds * RATE * this.lapse;
  }

  save(): void {
    if (!this.running || !this.keep) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: this.t, at: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  /** Hour of the day, 0..24. */
  get hour(): number {
    return (((this.t % DAY) + DAY) % DAY) / 3600;
  }
  get day(): number {
    return this.t / DAY;
  }
}
