import type { Score } from '../notation/model';
import { voiceOf } from '../notation/model';
import { audioContext, click, playHit } from './synth';

export interface PlayerOptions {
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
  playing = false;

  constructor(
    private score: Score,
    public opts: PlayerOptions,
  ) {}

  private get sixteenth() {
    return 60 / this.opts.bpm / 4;
  }

  start() {
    const ac = audioContext();
    this.stop(false);
    this.playing = true;
    this.measure = 0;
    this.slot = 0;
    this.endTime = null;
    this.nextTime = ac.currentTime + 0.12;
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
    if (this.timer !== null) clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null;
    this.visual = [];
    this.playing = false;
    if (notify && wasPlaying) this.opts.onStop?.();
  }

  /** Written length of a note in seconds: until the next onset in its voice, within the beat (used for rolls). */
  private noteLength(m: number, slot: number, voice: 'up' | 'down') {
    const beatEnd = (Math.floor(slot / 4) + 1) * 4;
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
      if (this.opts.metronome && this.slot % 4 === 0) click(t, this.slot === 0);
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
