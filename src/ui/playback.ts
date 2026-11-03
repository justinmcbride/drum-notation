import { Player } from '../audio/player';
import type { Score } from '../notation/model';
import type { ScoreView, ScrubHandler } from './score-view';

let active: Player | null = null;
/** Another mode using the score and the audio (play-along), stopped whenever playback starts. */
let other: (() => void) | null = null;

export interface PlaybackOptions {
  bpm: number;
  loop?: boolean;
  metronome?: boolean;
  onStateChange?: (playing: boolean) => void;
}

/**
 * Plays a score while highlighting it. Only one score plays at a time. Playback starts from the
 * view's cued position (set by scrubbing), follows scrubbing while playing, and stopping returns
 * the cue to the top.
 */
export function playScore(score: Score, view: ScoreView, opts: PlaybackOptions): Player {
  stopPlayback();
  // With reduced motion the playhead steps from note to note instead of gliding.
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const scrubber: ScrubHandler = {
    start: () => player.hold(),
    end: (p) => {
      player.seek(p.m, p.s);
      player.release();
    },
  };
  const player = new Player(score, {
    bpm: opts.bpm,
    loop: opts.loop ?? false,
    metronome: opts.metronome ?? false,
    onSlot: (m, s) => view.highlight(m, s),
    onFrame: (m, s, progress) => {
      if (!reduce?.matches) view.glide(m, s, progress);
    },
    onStop: () => {
      if (view.scrubber === scrubber) view.scrubber = null;
      view.cue(null);
      if (active === player) active = null;
      opts.onStateChange?.(false);
    },
  });
  active = player;
  view.scrubber = scrubber;
  player.start(view.position ?? undefined);
  opts.onStateChange?.(true);
  return player;
}

/** Stops any playback (and any play-along). */
export function stopPlayback() {
  active?.stop();
  active = null;
  const stop = other;
  other = null;
  stop?.();
}

/**
 * Takes over from playback: stops whatever is playing, and registers `stop` to be called when
 * playback starts again or the page changes.
 */
export function claimPlayback(stop: () => void) {
  stopPlayback();
  other = stop;
}

/** Gives back a claim made with claimPlayback() without calling its stop. */
export function releasePlayback(stop: () => void) {
  if (other === stop) other = null;
}

export function isActive(player: Player | null) {
  return !!player && player === active && player.playing;
}
