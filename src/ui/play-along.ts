import type { Score } from '../notation/model';
import { Follower, type FollowEvent, type Target } from '../play/follow';
import { MicError, openMic, type Mic } from '../play/mic';
import { h, ICONS } from './dom';
import { claimPlayback, releasePlayback } from './playback';
import { getPlayAlong, setPlayAlong } from './prefs';
import type { Position, ScoreView, ScrubHandler } from './score-view';

export interface PlayAlongOptions {
  score: Score;
  view: () => ScoreView | null;
  /** The chart's tempo, shown next to the player's. */
  bpm: () => number;
  loop: () => boolean;
}

/** After this long without a hit, the measured tempo is shown as unknown. */
const TEMPO_STALE = 2.5;
/** Ticks run this far behind the clock so a hit still on its way from the audio thread is counted first. */
const TICK_LAG = 0.02;

let uid = 0;

/**
 * "Play along": listens to the microphone and moves the score's cursor on as the drummer plays
 * each note, rather than in time. Shows the input level, the strokes heard for the waiting
 * notes, and the player's tempo. Playback is stopped while it listens, so the app's own sound
 * can't count as hits.
 */
export function playAlong(o: PlayAlongOptions) {
  const settings = getPlayAlong();
  let mic: Mic | null = null;
  let follower: Follower | null = null;
  let frame = 0;
  /** Bumped on every start and stop, so a slow microphone start can tell it was cancelled. */
  let generation = 0;
  let lastHit = -Infinity;
  const helpId = `pa-batch-help-${++uid}`;

  const toggle = h(
    'button',
    { class: 'toggle play-along-btn', type: 'button', 'aria-pressed': 'false', 'aria-expanded': 'false' },
    h('span', { class: 'icon', html: ICONS.mic }),
    'Play along',
  );

  const status = h('p', { class: 'pa-status', role: 'status' });
  const dots = h('span', { class: 'pa-dots', 'aria-hidden': 'true' });
  const yours = h('output', { class: 'pa-bpm' }, '—');
  const target = h('span', { class: 'pa-target' });
  const meterFill = h('span', { class: 'pa-meter-fill' });
  const meter = h(
    'span',
    { class: 'pa-meter', role: 'meter', 'aria-label': 'Microphone level', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    meterFill,
  );

  const sensOut = h('output', {});
  const sens = h('input', {
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    value: Math.round(settings.sensitivity * 100),
    'aria-label': 'Sensitivity',
  });
  const batchOut = h('output', {});
  const batch = h('input', {
    type: 'range',
    min: 0,
    max: 150,
    step: 5,
    value: settings.batchMs,
    'aria-label': 'Batch window',
    'aria-describedby': helpId,
  });
  const showSettings = () => {
    sensOut.textContent = `${sens.value}%`;
    batchOut.textContent = `${batch.value} ms`;
  };
  showSettings();
  sens.addEventListener('input', () => {
    settings.sensitivity = +sens.value / 100;
    mic?.setSensitivity(settings.sensitivity);
    showSettings();
    setPlayAlong(settings);
  });
  batch.addEventListener('input', () => {
    settings.batchMs = +batch.value;
    if (follower) follower.opts.batchMs = settings.batchMs;
    showSettings();
    setPlayAlong(settings);
  });

  const restart = h('button', { class: 'pa-restart', type: 'button' }, 'Restart');
  restart.addEventListener('click', () => {
    if (!follower) return;
    follower.reset();
    lastHit = -Infinity;
    showTarget();
  });

  const panel = h(
    'div',
    { class: 'pa-panel', hidden: true },
    status,
    h(
      'div',
      { class: 'pa-readout' },
      h('div', { class: 'pa-tempo' }, h('span', { class: 'pa-label' }, 'Your tempo'), yours, target),
      h('div', { class: 'pa-next' }, h('span', { class: 'pa-label' }, 'Hits'), dots),
      restart,
    ),
    h('div', { class: 'pa-level' }, h('span', { class: 'pa-label' }, 'Mic'), meter),
    h(
      'div',
      { class: 'pa-settings' },
      h('label', { class: 'pa-setting' }, h('span', { class: 'pa-label' }, 'Sensitivity'), sens, sensOut),
      h('label', { class: 'pa-setting' }, h('span', { class: 'pa-label' }, 'Batch window'), batch, batchOut),
    ),
    h(
      'p',
      { class: 'pa-help', id: helpId },
      'Hits within the batch window count toward the same notes, for notes meant to be struck together. Raise it if the cursor runs ahead when you play two drums slightly apart; lower it if fast notes get missed.',
    ),
    h(
      'p',
      { class: 'pa-tip' },
      'Tip: the app stays silent while listening. Set Sensitivity so each hit flashes the meter once, and use headphones for any backing music.',
    ),
  );

  const root = h('div', { class: 'play-along' }, toggle, panel);

  // ---- Showing progress ----

  function showTarget() {
    const view = o.view();
    const t = follower?.current() ?? null;
    if (view) {
      if (t) view.cue({ m: t.m, s: t.s });
      else view.cue(null);
    }
    showDots(t, 0);
    if (follower?.done) say('Finished. Press Restart to go again.');
    else if (t) say('Listening… play the highlighted notes.');
  }

  function showDots(t: Target | null, heard: number) {
    if (!t) {
      dots.replaceChildren();
      return;
    }
    if (t.roll) {
      dots.replaceChildren(h('i', { class: heard ? 'on roll' : 'roll' }, 'roll'));
      return;
    }
    dots.replaceChildren(...Array.from({ length: t.expected }, (_, i) => h('i', { class: i < heard ? 'on' : '' })));
  }

  function showTempo(now: number) {
    const bpm = follower?.tempo() ?? null;
    yours.textContent = bpm && now - lastHit < TEMPO_STALE ? `${Math.round(bpm)}` : '—';
    target.textContent = `bpm · chart ${o.bpm()}`;
  }

  function say(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function handle(events: FollowEvent[]) {
    for (const e of events) {
      if (e.type === 'count') showDots(e.target, e.count);
      else if (e.type === 'advance' || e.type === 'done') showTarget();
    }
  }

  // ---- Listening ----

  const scrubber: ScrubHandler = {
    quiet: true,
    start() {},
    end(p: Position) {
      follower?.jumpTo(p);
      lastHit = -Infinity;
      showTarget();
    },
  };

  let flash = 0;
  function onOnset(t: number) {
    if (!follower) return;
    lastHit = t;
    meter.classList.add('hit');
    clearTimeout(flash);
    flash = window.setTimeout(() => meter.classList.remove('hit'), 90);
    handle(follower.hit(t));
  }

  function onLevel(level: number) {
    // Shown in dB so quiet and loud playing both move the bar: -60 dB..0 dB.
    const db = level > 0 ? 20 * Math.log10(level) : -100;
    const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    meterFill.style.width = `${pct}%`;
    meter.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function loop() {
    if (!mic || !follower) return;
    const now = mic.context.currentTime;
    follower.opts.loop = o.loop();
    handle(follower.tick(now - TICK_LAG));
    showTempo(now);
    frame = requestAnimationFrame(loop);
  }

  async function start() {
    const gen = ++generation;
    claimPlayback(stop);
    setOpen(true);
    say('Starting the microphone…');
    try {
      const opened = await openMic({ sensitivity: settings.sensitivity, onOnset, onLevel });
      if (gen !== generation) {
        opened.close();
        return;
      }
      mic = opened;
    } catch (err) {
      if (gen !== generation) return;
      say(err instanceof MicError ? err.message : 'The microphone could not be started.', true);
      root.classList.add('failed');
      releasePlayback(stop);
      return;
    }
    follower = new Follower(o.score, { batchMs: settings.batchMs, loop: o.loop(), bpm: o.bpm() });
    const view = o.view();
    if (view) {
      view.scrubber = scrubber;
      // Start from the scrubbed position, if there is one.
      if (view.position) follower.jumpTo(view.position);
    }
    root.classList.add('listening');
    view?.element.classList.add('listening');
    lastHit = -Infinity;
    showTarget();
    frame = requestAnimationFrame(loop);
  }

  /** Stops listening and releases the microphone. */
  function stop() {
    generation++;
    cancelAnimationFrame(frame);
    clearTimeout(flash);
    mic?.close();
    mic = null;
    follower = null;
    releasePlayback(stop);
    const view = o.view();
    if (view) {
      if (view.scrubber === scrubber) view.scrubber = null;
      view.element.classList.remove('listening');
      view.cue(null);
    }
    root.classList.remove('listening', 'failed');
    meterFill.style.width = '0%';
    yours.textContent = '—';
    dots.replaceChildren();
    setOpen(false);
  }

  function setOpen(open: boolean) {
    toggle.setAttribute('aria-pressed', String(open));
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }

  toggle.addEventListener('click', () => (toggle.getAttribute('aria-pressed') === 'true' ? stop() : void start()));

  return {
    element: root,
    /** Stops listening (e.g. when the card goes away). */
    destroy: () => {
      if (toggle.getAttribute('aria-pressed') === 'true') stop();
    },
    /** Whether the panel is open (listening, or starting the microphone). */
    active: () => toggle.getAttribute('aria-pressed') === 'true',
    /** Keeps the shown chart tempo current. */
    refresh: () => showTempo(mic?.context.currentTime ?? 0),
  };
}
