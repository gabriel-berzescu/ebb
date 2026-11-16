import { noise2 } from '../world/noise';

/**
 * Everything heard on the island is made here from noise and a few oscillators: no recordings.
 * Wind, the wash of the sea, footsteps on whatever is underfoot, and the jackdaws.
 */

export type Surface = 'grass' | 'shingle' | 'sand' | 'water' | 'stone';

export interface Hearing {
  /** Eye position and the direction faced (unit, level). */
  x: number;
  y: number;
  z: number;
  faceX: number;
  faceZ: number;
  /** Metres to the nearest water (sea or pool), up to 200. */
  toWater: number;
  /** Metres walked since the last call, and whether running. */
  walked: number;
  running: boolean;
  surface: Surface;
  indoors: boolean;
  swimming: boolean;
  /** 0 by day, 1 at night. */
  night: number;
}

const MUTE_KEY = 'ebb.mute';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private wind!: { gain: GainNode; filter: BiquadFilterNode; whistle: GainNode };
  private sea!: { wash: GainNode; hiss: GainNode; rumble: GainNode };
  private stride = 0;
  private time = 0;
  private meter: AnalyserNode | null = null;
  private samples = new Float32Array(2048);
  muted = false;
  /** How many jackdaw calls and footsteps have sounded (for the checks). */
  calls = 0;
  steps = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* no storage */
    }
  }

  /** Browsers only allow sound after a click or a key press: call this from one. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    this.master.connect(this.meter);

    // four seconds of white noise, looped: the raw material for wind, water and footsteps
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 8) / 8388608 - 1;
    }
    const loop = (offset: number): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, offset);
      return s;
    };
    const filtered = (type: BiquadFilterType, freq: number, q: number, source: AudioNode): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      source.connect(f);
      return f;
    };
    const gained = (value: number, source: AudioNode): GainNode => {
      const g = ctx.createGain();
      g.gain.value = value;
      source.connect(g);
      g.connect(this.master);
      return g;
    };

    const windFilter = filtered('bandpass', 420, 0.7, loop(0));
    this.wind = { filter: windFilter, gain: gained(0, windFilter), whistle: gained(0, filtered('bandpass', 1500, 7, loop(1.3))) };
    this.sea = {
      wash: gained(0, filtered('lowpass', 850, 0.5, loop(2.1))),
      hiss: gained(0, filtered('bandpass', 3200, 0.8, loop(3.2))),
      rumble: gained(0, filtered('lowpass', 140, 0.5, loop(0.7))),
    };
  }

  toggleMute(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* no storage */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.1);
  }

  /** A short burst of filtered noise: the building block of every footstep and splash. */
  private burst(type: BiquadFilterType, freq: number, q: number, gain: number, attack: number, decay: number, delay = 0, sweepTo = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, Math.random() * 3.5);
    s.stop(t + attack + decay + 0.05);
  }

  /** Loudest sample in the last few hundredths of a second, 0..1 and beyond: above 1 would be clipping. */
  level(): number {
    if (!this.meter) return 0;
    this.meter.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const v of this.samples) peak = Math.max(peak, Math.abs(v));
    return peak;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  private step(surface: Surface, running: boolean): void {
    this.steps++;
    const k = running ? 1.25 : 1;
    const vary = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'grass':
        this.burst('lowpass', 650 * vary, 0.5, 0.11 * k, 0.006, 0.12);
        this.burst('bandpass', 2600 * vary, 0.7, 0.02 * k, 0.01, 0.07, 0.02);
        break;
      case 'shingle':
        // pebbles shift under the foot: a few grains one after another
        this.burst('bandpass', 2100 * vary, 0.8, 0.13 * k, 0.004, 0.09);
        this.burst('bandpass', 3100 * vary, 1.0, 0.08 * k, 0.004, 0.07, 0.05);
        this.burst('bandpass', 1500 * vary, 0.9, 0.06 * k, 0.004, 0.1, 0.1);
        break;
      case 'sand':
        this.burst('lowpass', 1100 * vary, 0.5, 0.075 * k, 0.005, 0.09);
        this.burst('bandpass', 1900 * vary, 1.2, 0.03 * k, 0.003, 0.035, 0.012);
        break;
      case 'water':
        this.burst('bandpass', 1500 * vary, 0.6, 0.12 * k, 0.012, 0.3, 0, 500);
        this.burst('highpass', 3500, 0.5, 0.03 * k, 0.02, 0.2, 0.04);
        break;
      case 'stone':
        this.burst('bandpass', 1300 * vary, 1.5, 0.07 * k, 0.003, 0.05);
        this.burst('lowpass', 300, 0.5, 0.06 * k, 0.004, 0.06);
        break;
    }
  }

  /**
   * The call of a jackdaw: a short, hard "tchack". `x, y, z` is where the bird is; `pitch` varies a little from bird to
   * bird and call to call.
   */
  jackdaw(x: number, y: number, z: number, pitch = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.calls++;
    const t = ctx.currentTime + delay;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 5;
    pan.rolloffFactor = 1.1;
    pan.positionX.value = x;
    pan.positionY.value = y;
    pan.positionZ.value = z;
    pan.connect(this.master);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.5, t + 0.006);
    out.gain.setValueAtTime(0.5, t + 0.04);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2050 * pitch;
    band.Q.value = 2.2;
    band.connect(out);
    out.connect(pan);

    // the voice: a harsh tone that drops in pitch, made rough by a fast wobble
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(2500 * pitch, t);
    voice.frequency.exponentialRampToValueAtTime(1450 * pitch, t + 0.075);
    voice.frequency.exponentialRampToValueAtTime(1700 * pitch, t + 0.15);
    const rough = ctx.createOscillator();
    rough.frequency.value = 105 * pitch;
    const depth = ctx.createGain();
    depth.gain.value = 520;
    rough.connect(depth);
    depth.connect(voice.frequency);
    voice.connect(band);
    // the hard edge at the start
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const edge = ctx.createGain();
    edge.gain.setValueAtTime(0.6, t);
    edge.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(edge);
    edge.connect(band);

    voice.start(t);
    rough.start(t);
    s.start(t, Math.random() * 3);
    voice.stop(t + 0.17);
    rough.stop(t + 0.17);
    s.stop(t + 0.05);
  }

  /** The far lamp catching: a soft breath and a low warm tone. */
  lampLit(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.burst('lowpass', 300, 0.6, 0.16, 0.05, 0.5, 0, 1400);
    const t = ctx.currentTime;
    for (const [freq, level] of [
      [196, 0.05],
      [293.7, 0.035],
      [392, 0.02],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 4.6);
    }
  }

  update(dt: number, h: Hearing): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.time += dt;
    const now = ctx.currentTime;
    const t = this.time;

    // the listener
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = h.x;
      l.positionY.value = h.y;
      l.positionZ.value = h.z;
      l.forwardX.value = h.faceX;
      l.forwardY.value = 0;
      l.forwardZ.value = h.faceZ;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }

    // wind: gusts come and go; there is more of it up on the hill, less inside, a little less at night
    const gust = 0.5 + 0.5 * noise2(t * 0.11, 3.1, 501) + 0.25 * noise2(t * 0.47, 8.2, 502);
    const height = 0.55 + 0.45 * Math.min(1, Math.max(0, h.y / 30));
    const shelter = h.indoors ? 0.3 : 1;
    const wind = Math.max(0.05, gust) * height * shelter * (1 - 0.25 * h.night);
    this.wind.gain.gain.setTargetAtTime(0.085 * wind, now, 0.4);
    this.wind.filter.frequency.setTargetAtTime(300 + 420 * gust, now, 0.6);
    this.wind.whistle.gain.setTargetAtTime(0.006 * Math.max(0, gust - 0.55) * height * shelter, now, 0.5);

    // the sea: each small wave runs up, hisses and draws back, about every six seconds
    const near = 1 / (1 + Math.pow(h.toWater / 14, 1.4));
    const phase = t / 6.3 + 0.3 * noise2(t * 0.05, 1.7, 503);
    const wave = Math.pow(0.5 + 0.5 * Math.sin(phase * 2 * Math.PI), 2);
    const inside = h.indoors ? 0.45 : 1;
    this.sea.wash.gain.setTargetAtTime((0.02 + 0.13 * near * (0.35 + 0.65 * wave)) * inside, now, 0.3);
    this.sea.hiss.gain.setTargetAtTime(0.03 * near * near * wave * inside, now, 0.25);
    this.sea.rumble.gain.setTargetAtTime(0.05 * inside, now, 1);

    // footsteps
    if (h.walked > 0) {
      this.stride += h.walked;
      const length = h.swimming ? 1.6 : h.running ? 1.15 : 0.78;
      if (this.stride >= length) {
        this.stride = 0;
        this.step(h.swimming ? 'water' : h.surface, h.running);
      }
    }
  }
}
