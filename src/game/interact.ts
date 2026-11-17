import type { Lamps } from '../render/lamps';
import type { ShelfItem } from '../render/structures';
import type { Clock } from '../world/clock';
import { FAR_LAMP, FAR_LAMP_FLAME, SEATS, SHELF, type Seat } from '../world/layout';
import type { Player } from './player';

const FAR_KEY = 'ebb.farLamp';
/** How much faster the world runs for someone sitting and watching, and when they let the days run. */
const WATCHING = 60;
const DAYS_RUN = 600;

/** The few things that can be done here: sit on a bench, look at the shelf, light the far lamp. */
export class Interactions {
  private reading = -1;
  private satFor = 0;
  private seat: Seat | null = null;
  /** Called when the far lamp is lit. */
  onLit: (() => void) | null = null;

  constructor(
    private player: Player,
    private clock: Clock,
    private lamps: Lamps,
    private shelf: ShelfItem[],
    private hintEl: HTMLElement,
    private noteEl: HTMLElement,
  ) {
    try {
      lamps.farLit = localStorage.getItem(FAR_KEY) === '1';
    } catch {
      /* no storage */
    }
  }

  get sitting(): boolean {
    return this.player.seat !== null;
  }

  /** Sit on a bench: 0 is the one under the window wall, 1 the one north of the house. */
  sit(which = 0): void {
    const seat = SEATS[which] ?? SEATS[0];
    this.seat = seat;
    this.player.seat = { x: seat.eye[0], y: seat.eye[1], z: seat.eye[2] };
    this.player.yaw = seat.yaw;
    this.player.pitch = seat.pitch;
    this.satFor = 0;
  }

  private stand(): void {
    const seat = this.seat ?? SEATS[0];
    this.seat = null;
    this.player.seat = null;
    this.player.place(seat.stand[0], seat.stand[1], this.player.yaw, Math.min(this.player.pitch, 0.2));
  }

  private hint(text: string): void {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.classList.toggle('on', text !== '');
  }

  private showNote(i: number): void {
    this.reading = i;
    if (i < 0) {
      this.noteEl.classList.remove('on');
      return;
    }
    const item = this.shelf[i];
    this.noteEl.textContent = item.text;
    const by = document.createElement('small');
    by.textContent = `left by ${item.by}, ${item.on}`;
    this.noteEl.appendChild(by);
    this.noteEl.classList.add('on');
  }

  /**
   * @param act true on the frame the act key went down
   * @param moving true while the walker is trying to move
   * @param hurry true while the run key is held
   */
  update(dt: number, tide: number, act: boolean, moving: boolean, hurry: boolean): void {
    const p = this.player;

    // time runs faster for someone sitting still
    const want = this.sitting ? (hurry ? DAYS_RUN : WATCHING) : 1;
    this.clock.lapse += (want - this.clock.lapse) * (1 - Math.exp(-dt * (want > this.clock.lapse ? 0.7 : 3)));
    if (Math.abs(this.clock.lapse - 1) < 0.01) this.clock.lapse = 1;

    if (this.sitting) {
      this.satFor += dt;
      if (moving || act) {
        this.stand();
        this.hint('');
      } else {
        this.hint(this.satFor < 9 ? 'the world turns faster while you sit  ·  hold Shift to let the days run  ·  move to stand' : '');
      }
      return;
    }

    if (this.reading >= 0) {
      if (moving) this.showNote(-1);
      else if (act) this.showNote(this.reading + 1 < this.shelf.length ? this.reading + 1 : -1);
      this.hint('');
      return;
    }

    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    const bench = SEATS.findIndex((s) => near(s.eye[0], s.eye[2], 1.9));
    if (bench >= 0) {
      this.hint('E  ·  sit and watch');
      if (act) this.sit(bench);
    } else if (near(SHELF[0], SHELF[2], 1.7) && this.shelf.length > 0) {
      this.hint('E  ·  the shelf');
      if (act) this.showNote(0);
    } else if (!this.lamps.farLit && near(FAR_LAMP.x, FAR_LAMP.z, 2.6) && tide < FAR_LAMP_FLAME) {
      this.hint('E  ·  light the lamp');
      if (act) {
        this.lamps.farLit = true;
        this.onLit?.();
        try {
          localStorage.setItem(FAR_KEY, '1');
        } catch {
          /* no storage */
        }
      }
    } else {
      this.hint('');
    }
  }
}
