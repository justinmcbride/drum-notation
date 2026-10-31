import { Player } from '../audio/player';
import type { Score } from '../notation/model';
import type { ScoreView, ScrubHandler } from './score-view';

let active: Player | null = null;

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

export function stopPlayback() {
  active?.stop();
  active = null;
}

export function isActive(player: Player | null) {
  return !!player && player === active && player.playing;
}
