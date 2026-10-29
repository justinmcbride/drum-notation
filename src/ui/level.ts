import { KEY_ORDER, type Inst } from '../notation/instruments';
import { h } from './dom';

/** How much of the notation the Staff page and Quiz cover. */
export type Level = 'basic' | 'advanced';

const STORAGE_KEY = 'drum-notation:level';
const EVENT = 'drum-notation:level-change';

/** Kit pieces beyond a standard kit (kick, snare, toms, hi-hat, ride, crash). */
export const ADVANCED_INSTS: ReadonlySet<Inst> = new Set<Inst>(['hihatFoot', 'rideBell', 'china', 'cowbell']);

export function getLevel(): Level {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'advanced' ? 'advanced' : 'basic';
  } catch {
    return 'basic';
  }
}

/** Mirrors the level onto <html data-level> so CSS can hide advanced-only content. */
export function applyLevel(level: Level = getLevel()) {
  document.documentElement.dataset.level = level;
}

export function setLevel(level: Level) {
  if (level === getLevel()) return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Storage may be unavailable (private mode); the change still applies to this page.
  }
  applyLevel(level);
  window.dispatchEvent(new CustomEvent<Level>(EVENT, { detail: level }));
}

/** Calls `fn` whenever the level changes, for as long as `owner` stays in the document. */
export function onLevelChange(owner: Element, fn: (level: Level) => void) {
  const handler = (e: Event) => {
    if (!owner.isConnected) {
      window.removeEventListener(EVENT, handler);
      return;
    }
    fn((e as CustomEvent<Level>).detail);
  };
  window.addEventListener(EVENT, handler);
}

/** Kit pieces in drum-key order (bottom of the staff to top) for a level. */
export function instrumentsFor(level: Level): Inst[] {
  return level === 'advanced' ? KEY_ORDER : KEY_ORDER.filter((i) => !ADVANCED_INSTS.has(i));
}

/** Basic / Advanced segmented toggle bound to the shared level setting. */
export function levelToggle() {
  const levels: Level[] = ['basic', 'advanced'];
  const buttons = levels.map((level) =>
    h(
      'button',
      { type: 'button', onclick: () => setLevel(level) },
      level === 'basic' ? 'Basic' : 'Advanced',
    ),
  );
  const el = h('div', { class: 'segmented level-toggle', role: 'group', 'aria-label': 'Notation level' }, buttons);
  const sync = (current: Level) =>
    buttons.forEach((b, i) => {
      const on = levels[i] === current;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  sync(getLevel());
  onLevelChange(el, sync);
  return el;
}
