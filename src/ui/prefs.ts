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
