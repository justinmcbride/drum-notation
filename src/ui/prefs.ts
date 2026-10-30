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
