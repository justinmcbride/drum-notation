/**
 * Drum-hit (onset) detection for play-along. Pure DSP with no Web Audio dependencies, so the
 * same code runs inside an AudioWorklet, in a ScriptProcessor fallback and in offline tests.
 *
 * The signal is split into three bands with one-pole filters (lows for kick and floor tom,
 * mids for snare and toms, highs for cymbals). Each band has a peak envelope with a fast attack
 * and slow release, so low-frequency ripple doesn't fake onsets. An onset is a sharp rise in any
 * band's envelope (in dB, compared with ~8 ms earlier) that also clears an adaptive noise floor.
 * A short refractory period plus hysteresis (the rise must fall back before re-arming) stop one
 * hit from triggering twice.
 */

/** Analysis hop: one Web Audio render quantum. */
export const HOP = 128;

export interface OnsetOptions {
  /** 0 (only clear, loud hits) to 1 (very sensitive). */
  sensitivity: number;
  /** Shortest time between two onsets, in ms. */
  refractoryMs?: number;
}

interface Band {
  /** Envelope release per sample. */
  release: number;
  env: number;
  /** Recent envelope levels in dB, one per hop (ring buffer). */
  history: Float32Array;
  /** Slowly-adapting noise floor in dB. */
  floor: number;
}

const DB_FLOOR = -120;
const toDb = (x: number) => (x > 1e-6 ? 20 * Math.log10(x) : DB_FLOOR);

export class OnsetDetector {
  readonly sampleRate: number;
  private bands: Band[];
  private lowA: number;
  private highA: number;
  private low = 0;
  private lowMid = 0;
  private lookback: number;
  private frame = 0;
  private pos = 0;
  private bandPeak = new Float32Array(3);
  private lastOnset = -Infinity;
  private armed = true;
  private riseDb = 8;
  private gateDb = 12;
  private minDb = -62;
  private refractory: number;
  /** Hops to settle the noise floor before listening (also skips the click of the mic opening). */
  private warmup: number;
  /** Peak input level (0..1) since the last call to takeLevel(). */
  private levelPeak = 0;

  constructor(sampleRate: number, opts: OnsetOptions = { sensitivity: 0.5 }) {
    this.sampleRate = sampleRate;
    const onePole = (hz: number) => 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
    this.lowA = onePole(150);
    this.highA = onePole(3000);
    const release = (ms: number) => Math.exp(-1 / ((ms / 1000) * sampleRate));
    this.lookback = Math.max(2, Math.round((0.008 * sampleRate) / HOP));
    this.bands = [60, 35, 25].map((ms) => ({
      release: release(ms),
      env: 0,
      history: new Float32Array(this.lookback + 1).fill(DB_FLOOR),
      floor: -90,
    }));
    this.refractory = ((opts.refractoryMs ?? 30) / 1000) * sampleRate;
    this.warmup = Math.ceil((0.15 * sampleRate) / HOP);
    this.setSensitivity(opts.sensitivity);
  }

  setSensitivity(s: number) {
    const v = Math.max(0, Math.min(1, s));
    this.riseDb = 12 - 8 * v;
    this.gateDb = 18 - 12 * v;
    this.minDb = -50 - 25 * v;
  }

  /** The loudest input sample since the last call, 0..1. */
  takeLevel() {
    const l = this.levelPeak;
    this.levelPeak = 0;
    return l;
  }

  /**
   * Feeds samples. `time` is the time of input[0] in seconds; `onOnset` receives the onset time
   * and its strength (the rise in dB).
   */
  process(input: Float32Array, time: number, onOnset: (t: number, strength: number) => void) {
    const { lowA, highA } = this;
    const [lo, mid, hi] = this.bands;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      this.low += lowA * (x - this.low);
      this.lowMid += highA * (x - this.lowMid);
      const a = Math.abs(x);
      if (a > this.levelPeak) this.levelPeak = a;
      const l = Math.abs(this.low);
      const m = Math.abs(this.lowMid - this.low);
      const h = Math.abs(x - this.lowMid);
      lo.env = l > lo.env ? l : lo.env * lo.release;
      mid.env = m > mid.env ? m : mid.env * mid.release;
      hi.env = h > hi.env ? h : hi.env * hi.release;
      if (lo.env > this.bandPeak[0]) this.bandPeak[0] = lo.env;
      if (mid.env > this.bandPeak[1]) this.bandPeak[1] = mid.env;
      if (hi.env > this.bandPeak[2]) this.bandPeak[2] = hi.env;
      if (++this.pos === HOP) {
        this.pos = 0;
        this.endHop(time + (i + 1) / this.sampleRate, onOnset);
      }
    }
  }

  private endHop(t: number, onOnset: (t: number, strength: number) => void) {
    const n = this.lookback + 1;
    const slot = this.frame % n;
    const past = (this.frame + 1) % n;
    let rise = 0;
    let loud = DB_FLOOR;
    this.bands.forEach((b, i) => {
      const db = toDb(this.bandPeak[i]);
      this.bandPeak[i] = 0;
      // The lowest level over the lookback, so a rise spread over a few hops still counts.
      let before = b.history[past];
      for (let k = 0; k < n; k++) if (k !== slot && b.history[k] < before) before = b.history[k];
      b.history[slot] = db;
      const r = db - Math.max(before, b.floor);
      if (db > b.floor + this.gateDb && r > rise) rise = r;
      if (db > loud) loud = db;
      // The floor drops quickly to quiet moments and creeps up slowly (fast both ways at first).
      const settling = this.frame < this.warmup;
      b.floor += (db - b.floor) * (db < b.floor || settling ? 0.05 : 0.0008);
    });
    this.frame++;
    if (this.frame <= this.warmup) return;
    const sample = this.frame * HOP;
    if (!this.armed && rise < this.riseDb * 0.5) this.armed = true;
    if (this.armed && rise >= this.riseDb && loud >= this.minDb && sample - this.lastOnset >= this.refractory) {
      this.lastOnset = sample;
      this.armed = false;
      onOnset(t, rise);
    }
  }
}
