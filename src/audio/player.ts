import { groupAt, meterOf } from '../notation/meter';
import type { Score } from '../notation/model';
import { voiceOf } from '../notation/model';
import { ensureSamples, scoreSampleKeys } from './samples';
import { audioContext, click, playHit } from './synth';

export interface PlayerOptions {
  /** Beats per minute, counted in the meter's beat: quarters in x/4, halves in x/2, dotted quarters in 6/8 and 12/8, eighths in 5/8 or 7/8. */
  bpm: number;
  loop: boolean;
  metronome: boolean;
  onSlot?: (measure: number, slot: number) => void;
  onStop?: () => void;
}

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

/** Lookahead scheduler that plays a score sixteenth by sixteenth. */
export class Player {
  private timer: number | null = null;
  private raf = 0;
  private measure = 0;
  private slot = 0;
  private nextTime = 0;
  private visual: { time: number; m: number; s: number }[] = [];
  private endTime: number | null = null;
  private run = 0;
  /** Where the next (re)start begins. */
  private from = { m: 0, s: 0 };
  /** True once samples are ready and the scheduler may run. */
  private ready = false;
  private held = false;
  playing = false;

  constructor(
    private score: Score,
    public opts: PlayerOptions,
  ) {}

  private get meter() {
    return meterOf(this.score);
  }

  private get sixteenth() {
    return 60 / this.opts.bpm / this.meter.tempoSlots;
  }

  /** Starts playing from `from` (measure and slot), or from the top. */
  start(from = { m: 0, s: 0 }) {
    const ac = audioContext();
    this.stop(false);
    this.playing = true;
    this.from = this.clamp(from);
    const run = this.run;
    // Give the recorded samples a moment to load; anything still missing plays synthesized.
    void ensureSamples(scoreSampleKeys(this.score)).then(() => {
      if (!this.playing || run !== this.run) return;
      this.ready = true;
      if (!this.held) this.begin(ac, 0.12);
    });
  }

  /** Pauses the scheduler (while scrubbing) without leaving the playing state. */
  hold() {
    if (!this.playing) return;
    this.held = true;
    this.halt();
  }

  /** Moves playback to a measure and slot. Resumes from there if playing and not held. */
  seek(m: number, s: number) {
    this.from = this.clamp({ m, s });
    if (this.playing && this.ready && !this.held) {
      this.halt();
      this.begin(audioContext(), 0.03);
    }
  }

  /** Ends a hold, continuing from the last seek. */
  release() {
    if (!this.held) return;
    this.held = false;
    if (this.playing && this.ready) this.begin(audioContext(), 0.03);
  }

  private clamp({ m, s }: { m: number; s: number }) {
    const mm = Math.max(0, Math.min(this.score.measures.length - 1, m));
    return { m: mm, s: Math.max(0, Math.min(this.score.slots - 1, s)) };
  }

  private halt() {
    if (this.timer !== null) clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null;
    this.visual = [];
  }

  private begin(ac: AudioContext, delay: number) {
    this.measure = this.from.m;
    this.slot = this.from.s;
    this.endTime = null;
    this.nextTime = ac.currentTime + delay;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
    const frame = () => {
      const now = ac.currentTime;
      while (this.visual.length && this.visual[0].time <= now) {
        const v = this.visual.shift()!;
        this.opts.onSlot?.(v.m, v.s);
      }
      if (this.endTime !== null && now >= this.endTime) {
        this.stop();
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(notify = true) {
    const wasPlaying = this.playing;
    this.run++;
    this.halt();
    this.playing = false;
    this.ready = false;
    this.held = false;
    if (notify && wasPlaying) this.opts.onStop?.();
  }

  /** Written length of a note in seconds: until the next onset in its voice, within the beat group (used for rolls). */
  private noteLength(m: number, slot: number, voice: 'up' | 'down') {
    const group = groupAt(this.meter, slot);
    const beatEnd = group.start + group.len;
    let s = slot + 1;
    while (s < beatEnd && !this.score.measures[m].hits.get(s)?.some((h) => voiceOf(h) === voice)) s++;
    return (s - slot) * this.sixteenth;
  }

  private schedule() {
    if (this.endTime !== null) return;
    const ac = audioContext();
    while (this.nextTime < ac.currentTime + LOOKAHEAD) {
      const { measures, slots } = this.score;
      const t = this.nextTime;
      const hits = measures[this.measure].hits.get(this.slot) ?? [];
      for (const hit of hits) {
        playHit(hit, t, {
          noteSec: this.noteLength(this.measure, this.slot, voiceOf(hit)),
          sixteenthSec: this.sixteenth,
        });
      }
      const tick = this.opts.metronome && this.meter.clicks.get(this.slot);
      if (tick) click(t, tick);
      this.visual.push({ time: t, m: this.measure, s: this.slot });
      this.nextTime += this.sixteenth;
      this.slot++;
      if (this.slot >= slots) {
        this.slot = 0;
        this.measure++;
        if (this.measure >= measures.length) {
          this.measure = 0;
          if (!this.opts.loop) {
            this.endTime = this.nextTime + 0.05;
            return;
          }
        }
      }
    }
  }
}

/** Sounds the hits at one slot right away (used while scrubbing). */
export function auditionSlot(score: Score, m: number, s: number) {
  const hits = score.measures[m]?.hits.get(s);
  if (!hits?.length) return;
  const t = audioContext().currentTime + 0.01;
  void ensureSamples(scoreSampleKeys(score), 0);
  for (const hit of hits) playHit(hit, t, { noteSec: 0.3, sixteenthSec: 0.1 });
}
