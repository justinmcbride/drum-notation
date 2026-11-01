import { groupAt, meterOf } from '../notation/meter';
import type { Score } from '../notation/model';
import { voiceOf } from '../notation/model';

/**
 * Play-along: follows a drummer through a score by listening for hits instead of keeping time.
 * Pure logic (no audio or DOM), driven by onset times, so it can be tested offline.
 */

/** A slot the player has to hit. */
export interface Target {
  m: number;
  s: number;
  /** Strokes expected here: one per note, plus grace notes for flams and drags. */
  expected: number;
  /** Extra time allowed for grace notes before the main stroke, in seconds. */
  graceSec: number;
  /** A roll or buzz: absorbs the run of strokes that makes it up. */
  roll: boolean;
  /** Length of the note in slots (for rolls). */
  lengthSlots: number;
  /** Slot index from the start of the score. */
  abs: number;
}

export type FollowEvent =
  | { type: 'count'; target: Target; count: number }
  | { type: 'advance'; from: Target; to: Target | null; time: number }
  | { type: 'done' };

export interface FollowOptions {
  /** How long after a hit further hits still count toward the same slot, in ms. */
  batchMs: number;
  loop: boolean;
  /** The written tempo, used for rolls until the player's own tempo is known. */
  bpm: number;
}

export function targetsOf(score: Score): Target[] {
  const meter = meterOf(score);
  const out: Target[] = [];
  score.measures.forEach((measure, m) => {
    for (let s = 0; s < score.slots; s++) {
      const hits = measure.hits.get(s);
      if (!hits?.length) continue;
      let expected = 0;
      let graceSec = 0;
      let roll = false;
      let lengthSlots = 1;
      for (const hit of hits) {
        expected++;
        if (hit.mods.includes('flam')) {
          expected += 1;
          graceSec = Math.max(graceSec, 0.04);
        }
        if (hit.mods.includes('drag')) {
          expected += 2;
          graceSec = Math.max(graceSec, 0.09);
        }
        if (hit.mods.includes('roll') || hit.mods.includes('buzz')) {
          roll = true;
          const group = groupAt(meter, s);
          const end = group.start + group.len;
          let e = s + 1;
          while (e < end && !measure.hits.get(e)?.some((h) => voiceOf(h) === voiceOf(hit))) e++;
          lengthSlots = Math.max(lengthSlots, e - s);
        }
      }
      const abs = m * score.slots + s;
      const prev = out[out.length - 1];
      // A continuous roll has no new attack to hear where one written roll ties into the next,
      // so back-to-back rolls are followed as one.
      if (roll && expected === 1 && prev?.roll && prev.abs + prev.lengthSlots === abs) {
        prev.lengthSlots += lengthSlots;
        continue;
      }
      out.push({ m, s, expected, graceSec, roll, lengthSlots, abs });
    }
  });
  return out;
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

/** A pause longer than this restarts the tempo estimate. */
const TEMPO_RESET = 2.5;
/** Slot-to-slot intervals the tempo is the median of. */
const TEMPO_WINDOW = 8;

export class Follower {
  readonly targets: Target[];
  private readonly slots: number;
  private readonly total: number;
  private readonly tempoSlots: number;
  index = 0;
  done = false;
  private loops = 0;
  private batch: { start: number; count: number } | null = null;
  /** When the previous slot was played, and where (in slots, counting loops). */
  private prev: { time: number; pos: number } | null = null;
  private intervals: number[] = [];

  constructor(
    score: Score,
    public opts: FollowOptions,
  ) {
    this.targets = targetsOf(score);
    this.slots = score.slots;
    this.total = score.measures.length * score.slots;
    this.tempoSlots = meterOf(score).tempoSlots;
  }

  /** The slot the player should hit next (null when finished or the score is empty). */
  current(): Target | null {
    return this.done ? null : (this.targets[this.index] ?? null);
  }

  /** Strokes heard so far for the current slot. */
  heard() {
    return this.batch?.count ?? 0;
  }

  /** The player's tempo in bpm (smoothed), or null until there are enough hits. */
  tempo(): number | null {
    if (this.intervals.length < 2) return null;
    return 60 / (median(this.intervals) * this.tempoSlots);
  }

  /** Back to the first note; forgets the tempo. */
  reset() {
    this.jumpTo({ m: 0, s: 0 });
  }

  /** Waits at the first slot with notes at or after a position. */
  jumpTo(p: { m: number; s: number }) {
    const at = p.m * this.slots + p.s;
    const i = this.targets.findIndex((t) => t.abs >= at);
    this.index = i < 0 ? 0 : i;
    this.done = false;
    this.loops = 0;
    this.batch = null;
    this.prev = null;
    this.intervals = [];
  }

  /** Closes the current slot if its batch window has run out. Call this regularly. */
  tick(t: number): FollowEvent[] {
    const out: FollowEvent[] = [];
    if (this.batch && this.expired(t)) this.advance(out);
    return out;
  }

  /** A hit was heard at time t (seconds). */
  hit(t: number): FollowEvent[] {
    const out: FollowEvent[] = [];
    if (this.batch && this.expired(t)) this.advance(out);
    const target = this.current();
    if (!target) return out;
    if (!this.batch) {
      // After a pause, the old tempo no longer says anything about the player.
      if (this.prev && t - this.prev.time > TEMPO_RESET) this.intervals = [];
      this.batch = { start: t, count: 1 };
    } else {
      this.batch.count++;
    }
    out.push({ type: 'count', target, count: this.batch.count });
    // Once every expected stroke is in, move on right away so fast notes aren't swallowed.
    if (!target.roll && this.batch.count >= target.expected) this.advance(out);
    return out;
  }

  private expired(t: number) {
    const target = this.current();
    const b = this.batch;
    if (!target || !b) return false;
    // A roll takes every stroke until the next note is due, whatever the gaps between them.
    if (target.roll) return t - b.start > this.rollSec(target);
    return t - b.start > this.opts.batchMs / 1000 + target.graceSec;
  }

  /** How long a roll lasts (less a quarter slot, to be safe), at the player's tempo when known. */
  private rollSec(target: Target) {
    const bpm = this.tempo() ?? this.opts.bpm;
    return ((target.lengthSlots - 0.25) * 60) / bpm / this.tempoSlots;
  }

  private advance(out: FollowEvent[]) {
    const from = this.current();
    const b = this.batch;
    this.batch = null;
    if (!from || !b) return;
    this.measureTempo(b.start, this.loops * this.total + from.abs);
    this.index++;
    if (this.index >= this.targets.length) {
      this.index = 0;
      if (this.opts.loop) this.loops++;
      else this.done = true;
    }
    out.push({ type: 'advance', from, to: this.current(), time: b.start });
    if (this.done) out.push({ type: 'done' });
  }

  private measureTempo(time: number, pos: number) {
    const prev = this.prev;
    this.prev = { time, pos };
    if (!prev) return;
    const dt = time - prev.time;
    const slots = pos - prev.pos;
    if (slots <= 0 || dt <= 0 || dt > TEMPO_RESET) {
      this.intervals = [];
      return;
    }
    this.intervals.push(dt / slots);
    if (this.intervals.length > TEMPO_WINDOW) this.intervals.shift();
  }
}
