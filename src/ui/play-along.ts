import { audioContext, chokeNow, closeHatNow, strikeNow } from '../audio/synth';
import { INSTRUMENTS, type Inst } from '../notation/instruments';
import type { Score } from '../notation/model';
import { Follower, type FollowEvent, type Target } from '../play/follow';
import { MicError, openMic, type Mic } from '../play/mic';
import { MidiError, midiSupported, NO_MIDI_MESSAGE, openMidi, type Midi, type MidiDevice } from '../play/midi';
import { hitFor, noteName, PADS, PadMap, velocityLevel } from '../play/midi-map';
import { h, ICONS } from './dom';
import { claimPlayback, releasePlayback } from './playback';
import { getPlayAlong, setPlayAlong, type PlayAlongPrefs } from './prefs';
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
/** Cymbals a hand can grab (MIDI aftertouch chokes them). */
const CYMBALS = new Set<Inst>(['crash', 'china', 'ride', 'rideBell']);

let uid = 0;

/** Where hits come from while listening. */
interface Source {
  /** The clock hit times are on, in seconds. */
  now(): number;
  close(): void;
}

/**
 * "Play along": listens to the microphone or a MIDI drum kit and moves the score's cursor on as
 * the drummer plays each note, rather than in time. Shows the strokes heard for the waiting
 * notes and the player's tempo. Playback is stopped while it listens, so the app's own sound
 * can't count as hits. With MIDI the drum is known too: a wrong drum is flagged, and the cursor
 * waits for the right one unless "Wait for the right drum" is off.
 */
export function playAlong(o: PlayAlongOptions) {
  const settings = getPlayAlong();
  const pads = new PadMap(settings.midiMap);
  let source: Source | null = null;
  let mic: Mic | null = null;
  let midi: Midi | null = null;
  let devices: MidiDevice[] = [];
  let follower: Follower | null = null;
  let frame = 0;
  /** Bumped on every start and stop, so a slow start can tell it was cancelled. */
  let generation = 0;
  let lastHit = -Infinity;
  let wrong = 0;
  /** The hi-hat pedal's CC 4 value, once the kit has sent one. */
  let pedal: number | null = null;
  /** The drum waiting for a pad to be hit ("hit a pad to assign"). */
  let learning: Inst | null = null;
  const id = ++uid;
  const helpId = `pa-batch-help-${id}`;
  const save = () => setPlayAlong(settings);

  const toggle = h(
    'button',
    { class: 'toggle play-along-btn', type: 'button', 'aria-pressed': 'false', 'aria-expanded': 'false' },
    h('span', { class: 'icon', html: ICONS.mic }),
    'Play along',
  );

  // ---- Input source: Mic | MIDI ----

  const sourceButtons = (['mic', 'midi'] as const).map((s) =>
    h(
      'button',
      { type: 'button', role: 'radio', 'data-source': s, 'aria-checked': String(settings.source === s) },
      s === 'mic' ? 'Mic' : 'MIDI',
    ),
  );
  const sourcePicker = h(
    'div',
    { class: 'pa-source', role: 'radiogroup', 'aria-label': 'Listen to' },
    h('span', { class: 'pa-label', 'aria-hidden': 'true' }, 'Input'),
    h('span', { class: 'segmented' }, ...sourceButtons),
  );
  sourceButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const s = b.dataset.source as PlayAlongPrefs['source'];
      if (s === settings.source) return;
      settings.source = s;
      save();
      showSource();
      // Restart listening with the new input.
      if (isOpen()) {
        teardown();
        void begin();
      }
    }),
  );

  const status = h('p', { class: 'pa-status', role: 'status' });
  const dots = h('span', { class: 'pa-dots', 'aria-hidden': 'true' });
  const chips = h('span', { class: 'pa-chips' });
  const nextLabel = h('span', { class: 'pa-label' }, 'Hits');
  const yours = h('output', { class: 'pa-bpm' }, '—');
  const target = h('span', { class: 'pa-target' });
  const wrongOut = h('output', { class: 'pa-wrong' }, '0');
  const meterFill = h('span', { class: 'pa-meter-fill' });
  const meter = h(
    'span',
    { class: 'pa-meter', role: 'meter', 'aria-label': 'Microphone level', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    meterFill,
  );

  // ---- Settings ----

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
    save();
  });
  batch.addEventListener('input', () => {
    settings.batchMs = +batch.value;
    if (follower) follower.opts.batchMs = settings.batchMs;
    showSettings();
    save();
  });

  const strict = h('input', { type: 'checkbox', checked: settings.strict });
  strict.addEventListener('change', () => {
    settings.strict = strict.checked;
    if (follower) follower.opts.strict = settings.strict;
    save();
  });
  const sound = h('input', { type: 'checkbox', checked: settings.midiSound });
  sound.addEventListener('change', () => {
    settings.midiSound = sound.checked;
    // Starting the audio needs this click; the drum samples load once it exists.
    if (sound.checked) void audioContext().resume().catch(() => undefined);
    save();
  });

  const deviceSelect = h('select', { 'aria-label': 'MIDI device' });
  deviceSelect.addEventListener('change', () => {
    settings.midiDevice = deviceSelect.value === '' ? null : deviceSelect.value;
    save();
    midi?.setDevice(settings.midiDevice);
    showDevices();
  });

  const lastPad = h('output', { class: 'pa-last' }, '—');
  const pedalOut = h('output', { class: 'pa-pedal', hidden: true });

  // ---- Pad assignments ----

  const padRows = new Map<Inst, { notes: HTMLElement; button: HTMLButtonElement }>();
  const padList = h('ul', { class: 'pa-pads' });
  for (const inst of PADS) {
    const notes = h('span', { class: 'pa-pad-notes' });
    const button = h('button', { type: 'button', class: 'pa-assign' }, 'Assign') as HTMLButtonElement;
    button.addEventListener('click', () => {
      learning = learning === inst ? null : inst;
      showPads();
      if (learning) say(`Hit the pad for ${INSTRUMENTS[inst].name} to assign it.`);
      else showTarget();
    });
    padRows.set(inst, { notes, button });
    padList.append(h('li', {}, h('span', { class: 'pa-pad-name' }, INSTRUMENTS[inst].name), notes, button));
  }
  const resetPads = h('button', { type: 'button', class: 'pa-reset-pads' }, 'Reset to General MIDI');
  resetPads.addEventListener('click', () => {
    pads.custom = {};
    settings.midiMap = {};
    learning = null;
    save();
    showPads();
  });
  const padDetails = h(
    'details',
    { class: 'pa-assignments' },
    h('summary', {}, 'Pad assignments'),
    h(
      'p',
      { class: 'pa-help' },
      'Notes follow the General MIDI drum map on any channel. If a pad shows up as the wrong drum, press Assign and hit the pad.',
    ),
    padList,
    resetPads,
  );

  function showPads() {
    for (const [inst, row] of padRows) {
      const notes = pads.notesFor(inst);
      row.notes.textContent = notes.length ? notes.map((n) => `${n}`).join(', ') : 'none';
      row.notes.title = notes.map((n) => `${n} (${noteName(n)})`).join(', ');
      const on = learning === inst;
      row.button.textContent = on ? 'Hit a pad…' : 'Assign';
      row.button.classList.toggle('learning', on);
      row.button.setAttribute('aria-pressed', String(on));
      row.button.disabled = !midi;
    }
    resetPads.disabled = !Object.keys(pads.custom).length;
  }

  const restart = h('button', { class: 'pa-restart', type: 'button' }, 'Restart');
  restart.addEventListener('click', () => {
    if (!follower) return;
    follower.reset();
    lastHit = -Infinity;
    wrong = 0;
    wrongOut.textContent = '0';
    showTarget();
  });

  const panel = h(
    'div',
    { class: 'pa-panel', hidden: true },
    sourcePicker,
    status,
    h(
      'div',
      { class: 'pa-readout' },
      h('div', { class: 'pa-tempo' }, h('span', { class: 'pa-label' }, 'Your tempo'), yours, target),
      h('div', { class: 'pa-next' }, nextLabel, dots, chips),
      h('div', { class: 'pa-misses pa-midi' }, h('span', { class: 'pa-label' }, 'Wrong drums'), wrongOut),
      restart,
    ),
    h('div', { class: 'pa-level pa-mic' }, h('span', { class: 'pa-label' }, 'Mic'), meter),
    h(
      'div',
      { class: 'pa-device pa-midi' },
      h('label', { class: 'pa-setting' }, h('span', { class: 'pa-label' }, 'Device'), deviceSelect),
      h('div', { class: 'pa-monitor' }, h('span', { class: 'pa-label' }, 'Last pad'), lastPad, pedalOut),
    ),
    h(
      'div',
      { class: 'pa-settings' },
      h('label', { class: 'pa-setting pa-mic' }, h('span', { class: 'pa-label' }, 'Sensitivity'), sens, sensOut),
      h('label', { class: 'pa-setting' }, h('span', { class: 'pa-label' }, 'Batch window'), batch, batchOut),
    ),
    h(
      'div',
      { class: 'pa-checks pa-midi' },
      h('label', { class: 'pa-check' }, strict, 'Wait for the right drum'),
      h('label', { class: 'pa-check' }, sound, 'Play kit sounds'),
    ),
    h(
      'p',
      { class: 'pa-help', id: helpId },
      'Hits within the batch window count toward the same notes, for notes meant to be struck together. Raise it if the cursor runs ahead when you play two drums slightly apart; lower it if fast notes get missed.',
    ),
    h('div', { class: 'pa-midi' }, padDetails),
    h(
      'p',
      { class: 'pa-tip pa-mic' },
      'Tip: the app stays silent while listening. Set Sensitivity so each hit flashes the meter once, and use headphones for any backing music.',
    ),
    h(
      'p',
      { class: 'pa-tip pa-midi' },
      'Tip: turn on Play kit sounds if your controller makes no sound of its own. Velocity only sets loudness; accents and ghost notes aren’t checked.',
    ),
  );

  const root = h('div', { class: 'play-along' }, toggle, panel);

  function showSource() {
    const isMidi = settings.source === 'midi';
    root.classList.toggle('midi', isMidi);
    sourceButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.source === settings.source)));
    nextLabel.textContent = isMidi ? 'Next' : 'Hits';
  }
  showSource();
  showPads();

  // ---- Showing progress ----

  function listeningMessage() {
    if (settings.source === 'midi' && !devices.length)
      return 'No MIDI devices found. Connect your kit or pad controller; it shows up here when connected.';
    return settings.source === 'midi'
      ? 'Listening… play the highlighted notes on your kit.'
      : 'Listening… play the highlighted notes.';
  }

  function showTarget() {
    const view = o.view();
    const t = follower?.current() ?? null;
    if (view) {
      if (t) view.cue({ m: t.m, s: t.s });
      else view.cue(null);
    }
    showDots(t, 0);
    if (learning) return;
    if (follower?.done) say('Finished. Press Restart to go again.');
    else if (t) say(listeningMessage());
  }

  function showDots(t: Target | null, heard: number) {
    if (settings.source === 'midi') {
      dots.replaceChildren();
      showChips(t);
      return;
    }
    chips.replaceChildren();
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

  /** The drums the cursor waits for, lit as each is hit. */
  function showChips(t: Target | null) {
    if (!t) {
      chips.replaceChildren();
      return;
    }
    const played = [...(follower?.played() ?? [])];
    chips.replaceChildren(
      ...t.insts.map((inst) => {
        const i = played.indexOf(inst);
        if (i >= 0) played.splice(i, 1);
        return h(
          'span',
          { class: `pa-chip${i >= 0 ? ' on' : ''}${t.roll ? ' roll' : ''}` },
          INSTRUMENTS[inst].short + (t.roll ? ' roll' : ''),
        );
      }),
    );
  }

  function showTempo(now: number) {
    const bpm = follower?.tempo() ?? null;
    yours.textContent = bpm && now - lastHit < TEMPO_STALE ? `${Math.round(bpm)}` : '—';
    target.textContent = `bpm · chart ${o.bpm()}`;
  }

  function say(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
    status.classList.remove('warn');
  }

  const names = (insts: Inst[]) => insts.map((i) => INSTRUMENTS[i].name).join(' + ');

  function handle(events: FollowEvent[]) {
    for (const e of events) {
      if (e.type === 'count') showDots(e.target, e.count);
      else if (e.type === 'advance' || e.type === 'done') showTarget();
      else if (e.type === 'wrong') {
        wrong++;
        wrongOut.textContent = String(wrong);
        o.view()?.flag({ m: e.target.m, s: e.target.s }, INSTRUMENTS[e.inst].pos);
        const left = e.target.insts.filter((x) => !(follower?.played() ?? []).includes(x));
        say(
          settings.strict
            ? `Wrong drum: ${INSTRUMENTS[e.inst].name}. Waiting for ${names(left.length ? left : e.target.insts)}.`
            : `Wrong drum: ${INSTRUMENTS[e.inst].name} (the note wanted ${names(e.target.insts)}).`,
        );
        status.classList.add('warn');
      }
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

  function onNote(t: number, note: number, velocity: number, channel: number) {
    if (learning) {
      const inst = learning;
      pads.assign(note, inst);
      settings.midiMap = { ...pads.custom };
      save();
      learning = null;
      showPads();
      say(`Note ${note} (${noteName(note)}) now plays ${INSTRUMENTS[inst].name}.`);
      return;
    }
    const info = pads.lookup(note);
    lastPad.textContent = `${note} (${noteName(note)}) · ${info ? INSTRUMENTS[info.inst].name : 'not assigned'} · vel ${velocity} · ch ${channel + 1}`;
    lastPad.classList.toggle('unknown', !info);
    if (!info) return;
    if (settings.midiSound) strikeNow(hitFor(info, pedal), velocityLevel(velocity));
    if (!follower) return;
    lastHit = t;
    handle(follower.hit(t, info.inst));
    showChips(follower.current());
  }

  function onControl(_t: number, controller: number, value: number) {
    if (controller !== 4) return;
    const was = pedal;
    pedal = value;
    pedalOut.hidden = false;
    pedalOut.textContent = `Hi-hat pedal: ${value >= 100 ? 'closed' : value >= 45 ? 'half open' : 'open'}`;
    // Closing the pedal cuts off a ringing open hat.
    if (settings.midiSound && value >= 100 && (was === null || was < 100)) closeHatNow();
  }

  function onPressure(_t: number, note: number, value: number) {
    const info = pads.lookup(note);
    if (settings.midiSound && value > 0 && info && CYMBALS.has(info.inst)) chokeNow(hitFor(info, pedal));
  }

  function showDevices() {
    const chosen = settings.midiDevice;
    const known = devices.some((d) => d.id === chosen);
    const options = [h('option', { value: '' }, devices.length ? 'All inputs' : 'No devices connected')];
    for (const d of devices) options.push(h('option', { value: d.id }, d.name));
    // Keep a chosen device that's unplugged for now: it's used again when it comes back.
    if (chosen && !known) options.push(h('option', { value: chosen }, 'Chosen device (not connected)'));
    deviceSelect.replaceChildren(...options);
    deviceSelect.value = chosen ?? '';
  }

  function onDevices(list: MidiDevice[]) {
    devices = list;
    showDevices();
    if (follower && !learning) showTarget();
  }

  async function openSource(): Promise<Source> {
    if (settings.source === 'midi') {
      if (!midiSupported()) throw new MidiError('unsupported', NO_MIDI_MESSAGE);
      // Started in this click, so "Play kit sounds" can play right away.
      if (settings.midiSound) void audioContext().resume().catch(() => undefined);
      const opened = await openMidi({ device: settings.midiDevice, onNote, onControl, onPressure, onDevices });
      midi = opened;
      return { now: () => performance.now() / 1000, close: () => opened.close() };
    }
    const opened = await openMic({ sensitivity: settings.sensitivity, onOnset, onLevel });
    mic = opened;
    return { now: () => opened.context.currentTime, close: () => opened.close() };
  }

  function loop() {
    if (!source || !follower) return;
    const now = source.now();
    follower.opts.loop = o.loop();
    handle(follower.tick(now - TICK_LAG));
    showTempo(now);
    frame = requestAnimationFrame(loop);
  }

  async function begin() {
    const gen = ++generation;
    root.classList.remove('failed');
    say(settings.source === 'midi' ? 'Connecting to MIDI…' : 'Starting the microphone…');
    let opened: Source;
    try {
      opened = await openSource();
    } catch (err) {
      if (gen !== generation) return;
      mic = null;
      midi = null;
      const known = err instanceof MicError || err instanceof MidiError;
      say(
        known
          ? (err as Error).message
          : settings.source === 'midi'
            ? 'MIDI could not be started.'
            : 'The microphone could not be started.',
        true,
      );
      root.classList.add('failed');
      showPads();
      return;
    }
    if (gen !== generation) {
      opened.close();
      return;
    }
    source = opened;
    showPads();
    follower = new Follower(o.score, {
      batchMs: settings.batchMs,
      loop: o.loop(),
      bpm: o.bpm(),
      strict: settings.strict,
    });
    const view = o.view();
    if (view) {
      view.scrubber = scrubber;
      // Start from the scrubbed position, if there is one.
      if (view.position) follower.jumpTo(view.position);
    }
    root.classList.add('listening');
    view?.element.classList.add('listening');
    lastHit = -Infinity;
    wrong = 0;
    wrongOut.textContent = '0';
    showTarget();
    frame = requestAnimationFrame(loop);
  }

  async function start() {
    claimPlayback(stop);
    setOpen(true);
    await begin();
  }

  /** Stops listening and lets go of the input, keeping the panel as it is. */
  function teardown() {
    generation++;
    cancelAnimationFrame(frame);
    clearTimeout(flash);
    source?.close();
    source = null;
    mic = null;
    midi = null;
    follower = null;
    learning = null;
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
    chips.replaceChildren();
    showPads();
  }

  /** Stops listening and closes the panel. */
  function stop() {
    teardown();
    releasePlayback(stop);
    setOpen(false);
  }

  const isOpen = () => toggle.getAttribute('aria-pressed') === 'true';

  function setOpen(open: boolean) {
    toggle.setAttribute('aria-pressed', String(open));
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }

  toggle.addEventListener('click', () => (isOpen() ? stop() : void start()));

  return {
    element: root,
    /** Stops listening (e.g. when the card goes away). */
    destroy: () => {
      if (isOpen()) stop();
    },
    /** Whether the panel is open (listening, or starting the input). */
    active: isOpen,
    /** Keeps the shown chart tempo current. */
    refresh: () => showTempo(source?.now() ?? 0),
  };
}
