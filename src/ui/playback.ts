import { Player } from '../audio/player';
import type { Score } from '../notation/model';
import type { ScoreView } from './score-view';

let active: Player | null = null;

export interface PlaybackOptions {
  bpm: number;
  loop?: boolean;
  metronome?: boolean;
  onStateChange?: (playing: boolean) => void;
}

/** Plays a score while highlighting it. Only one score plays at a time. */
export function playScore(score: Score, view: ScoreView, opts: PlaybackOptions): Player {
  stopPlayback();
  const player = new Player(score, {
    bpm: opts.bpm,
    loop: opts.loop ?? false,
    metronome: opts.metronome ?? false,
    onSlot: (m, s) => view.highlight(m, s),
    onStop: () => {
      view.clear();
      if (active === player) active = null;
      opts.onStateChange?.(false);
    },
  });
  active = player;
  player.start();
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
