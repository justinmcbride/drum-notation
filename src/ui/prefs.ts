import { INSTRUMENTS, type Inst } from '../notation/instruments';
import { h } from './dom';

const KICK_RESTS_KEY = 'drum-notation:kick-rests';
const KICK_RESTS_EVENT = 'drum-notation:kick-rests-change';

/** Whether rests in the feet voice (stems down) are drawn. Off by default. */
export function getKickRests() {
  try {
    return localStorage.getItem(KICK_RESTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setKickRests(on: boolean) {
  try {
    localStorage.setItem(KICK_RESTS_KEY, on ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode); the change still applies to this page.
  }
  window.dispatchEvent(new CustomEvent<boolean>(KICK_RESTS_EVENT, { detail: on }));
}

/**
 * The subtle "Show kick rests" toggle and its one-line explanation. `onChange` runs whenever the
 * setting changes, from this toggle or any other, for as long as the toggle stays in the document.
 */
export function kickRestsToggle(noteId: string, onChange: (on: boolean) => void) {
  const btn = h(
    'button',
    { class: 'toggle subtle', type: 'button', 'aria-pressed': String(getKickRests()), 'aria-describedby': noteId },
    'Show kick rests',
  );
  btn.addEventListener('click', () => setKickRests(!getKickRests()));
  const handler = (e: Event) => {
    if (!btn.isConnected) {
      window.removeEventListener(KICK_RESTS_EVENT, handler);
      return;
    }
    const on = (e as CustomEvent<boolean>).detail;
    btn.setAttribute('aria-pressed', String(on));
    onChange(on);
  };
  window.addEventListener(KICK_RESTS_EVENT, handler);
  const note = h(
    'p',
    { class: 'toggle-note', id: noteId },
    'Kick rests are hidden by default: they belong to the feet voice (stems down), not to the hands.',
  );
  return { btn, note };
}

const COLOR_NOTES_KEY = 'drum-notation:color-notes';
const COLOR_NOTES_EVENT = 'drum-notation:color-notes-change';

/** Whether noteheads are colored by instrument. Off by default; applies app-wide. */
export function getColorNotes() {
  try {
    return localStorage.getItem(COLOR_NOTES_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mirrors the setting onto <html class="color-notes"> so CSS colors every score at once. */
export function applyColorNotes(on = getColorNotes()) {
  document.documentElement.classList.toggle('color-notes', on);
}

export function setColorNotes(on: boolean) {
  try {
    localStorage.setItem(COLOR_NOTES_KEY, on ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode); the change still applies to this page.
  }
  applyColorNotes(on);
  window.dispatchEvent(new CustomEvent<boolean>(COLOR_NOTES_EVENT, { detail: on }));
}

/**
 * Keeps a button's aria-pressed in sync with the Color notes setting and flips the setting on
 * click. Listening stops once the button leaves the document, unless `persistent` is set.
 */
export function bindColorNotesButton(btn: HTMLButtonElement, persistent = false) {
  btn.setAttribute('aria-pressed', String(getColorNotes()));
  btn.addEventListener('click', () => setColorNotes(!getColorNotes()));
  const handler = (e: Event) => {
    if (!persistent && !btn.isConnected) {
      window.removeEventListener(COLOR_NOTES_EVENT, handler);
      return;
    }
    btn.setAttribute('aria-pressed', String((e as CustomEvent<boolean>).detail));
  };
  window.addEventListener(COLOR_NOTES_EVENT, handler);
  return btn;
}

/** In-page "Color notes" toggle bound to the app-wide setting. */
export function colorNotesToggle() {
  return bindColorNotesButton(h('button', { class: 'toggle', type: 'button' }, 'Color notes'));
}

const PLAY_ALONG_KEY = 'drum-notation:play-along';

export interface PlayAlongPrefs {
  /** Onset detection sensitivity, 0..1. */
  sensitivity: number;
  /** How long after a hit further hits still count toward the same notes, in ms (0–150). */
  batchMs: number;
  /** Where hits come from. */
  source: 'mic' | 'midi';
  /** MIDI: wait for the right drum (true) or move on with any hit (false). */
  strict: boolean;
  /** MIDI: play the app's drum sounds for each pad stroke. */
  midiSound: boolean;
  /** MIDI input id, or null for all inputs. */
  midiDevice: string | null;
  /** MIDI note → drum, on top of the General MIDI map. */
  midiMap: Record<number, Inst>;
}

const PLAY_ALONG_DEFAULTS: PlayAlongPrefs = {
  sensitivity: 0.5,
  batchMs: 60,
  source: 'mic',
  strict: true,
  midiSound: false,
  midiDevice: null,
  midiMap: {},
};

export function getPlayAlong(): PlayAlongPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAY_ALONG_KEY) ?? '{}') as Partial<PlayAlongPrefs>;
    const num = (v: unknown, lo: number, hi: number, d: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    return {
      sensitivity: num(saved.sensitivity, 0, 1, PLAY_ALONG_DEFAULTS.sensitivity),
      batchMs: num(saved.batchMs, 0, 150, PLAY_ALONG_DEFAULTS.batchMs),
      source: saved.source === 'midi' ? 'midi' : 'mic',
      strict: typeof saved.strict === 'boolean' ? saved.strict : PLAY_ALONG_DEFAULTS.strict,
      midiSound: typeof saved.midiSound === 'boolean' ? saved.midiSound : PLAY_ALONG_DEFAULTS.midiSound,
      midiDevice: typeof saved.midiDevice === 'string' ? saved.midiDevice : null,
      midiMap: padMap(saved.midiMap),
    };
  } catch {
    return { ...PLAY_ALONG_DEFAULTS };
  }
}

function padMap(v: unknown): Record<number, Inst> {
  const out: Record<number, Inst> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, inst] of Object.entries(v as Record<string, unknown>)) {
    const note = Number(k);
    if (Number.isInteger(note) && note >= 0 && note < 128 && typeof inst === 'string' && inst in INSTRUMENTS)
      out[note] = inst as Inst;
  }
  return out;
}

export function setPlayAlong(p: PlayAlongPrefs) {
  try {
    localStorage.setItem(PLAY_ALONG_KEY, JSON.stringify(p));
  } catch {
    // Storage may be unavailable (private mode); the setting still applies to this page.
  }
}

// ---- Beat effect (experiment) ----

export const BEAT_FX = [
  { id: 'none', name: 'None (current)', desc: 'The gliding playhead; notes light up as they sound.' },
  { id: 'breathe', name: 'Breathing playhead', desc: 'The playhead flares and glows on each note, thins between notes, and swells again as the next note nears.' },
  { id: 'pop', name: 'Note pop', desc: 'Each sounding notehead pops a little larger, then eases back.' },
  { id: 'anticipate', name: 'Anticipation', desc: 'The next note grows and warms toward the highlight color as the playhead approaches, then settles once it sounds.' },
  { id: 'ripple', name: 'Ripple', desc: 'A soft glow and a ring ripple out from each notehead as it sounds.' },
  { id: 'band', name: 'Beat band', desc: 'A soft band fills the current beat and pulses as each beat starts, stronger on the downbeat.' },
  { id: 'combined', name: 'Combined (subtle)', desc: 'A gently breathing playhead, a small note pop and a faint glow on each note.' },
] as const;

export type BeatFx = (typeof BEAT_FX)[number]['id'];

const BEAT_FX_KEY = 'drum-notation:beat-fx';
const BEAT_FX_EVENT = 'drum-notation:beat-fx-change';

export function getBeatFx(): BeatFx {
  try {
    const v = localStorage.getItem(BEAT_FX_KEY);
    return BEAT_FX.some((f) => f.id === v) ? (v as BeatFx) : 'none';
  } catch {
    return 'none';
  }
}

export function setBeatFx(fx: BeatFx) {
  try {
    localStorage.setItem(BEAT_FX_KEY, fx);
  } catch {
    // Storage may be unavailable (private mode); the setting still applies to this page.
  }
  window.dispatchEvent(new CustomEvent(BEAT_FX_EVENT));
}

export function onBeatFxChange(fn: () => void) {
  window.addEventListener(BEAT_FX_EVENT, fn);
  return () => window.removeEventListener(BEAT_FX_EVENT, fn);
}
