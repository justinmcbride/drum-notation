import type { Inst } from '../notation/instruments';
import type { Hit, Mod } from '../notation/model';

/**
 * Which drum each MIDI note number means. Starts from the General MIDI percussion map plus the
 * extra notes common electronic kits send (Roland, Alesis, Yamaha use the same layout for
 * rims and hi-hat edges), and can be changed pad by pad ("hit a pad to assign").
 */

export interface PadInfo {
  inst: Inst;
  /** How the stroke sounds when the app plays it. */
  mods?: Mod[];
}

export const GM_DRUMS: Record<number, PadInfo> = {
  35: { inst: 'kick' },
  36: { inst: 'kick' },
  37: { inst: 'snare', mods: ['crossStick'] },
  38: { inst: 'snare' },
  // General MIDI's "electric snare"; electronic kits send it for a snare rimshot.
  40: { inst: 'snare', mods: ['rimshot'] },
  41: { inst: 'floorTom' },
  43: { inst: 'floorTom' },
  // Kits send 39 and 58 for the floor tom rims.
  39: { inst: 'floorTom' },
  58: { inst: 'floorTom' },
  45: { inst: 'tom2' },
  47: { inst: 'tom2' },
  48: { inst: 'tom1' },
  50: { inst: 'tom1' },
  42: { inst: 'hihat', mods: ['closed'] },
  22: { inst: 'hihat', mods: ['closed'] },
  46: { inst: 'hihat', mods: ['open'] },
  26: { inst: 'hihat', mods: ['open'] },
  44: { inst: 'hihatFoot' },
  49: { inst: 'crash' },
  55: { inst: 'crash' },
  57: { inst: 'crash' },
  52: { inst: 'china' },
  51: { inst: 'ride' },
  59: { inst: 'ride' },
  53: { inst: 'rideBell' },
  56: { inst: 'cowbell' },
};

/** The kit pieces a pad can be assigned to, in the order they're listed. */
export const PADS: Inst[] = [
  'kick',
  'snare',
  'hihat',
  'hihatFoot',
  'tom1',
  'tom2',
  'floorTom',
  'ride',
  'rideBell',
  'crash',
  'china',
  'cowbell',
];

/** A note map: General MIDI with the player's own assignments on top. */
export class PadMap {
  constructor(public custom: Record<number, Inst> = {}) {}

  lookup(note: number): PadInfo | null {
    const own = this.custom[note];
    if (own) {
      // Keep the articulation the note carries in General MIDI if it's still the same drum.
      const gm = GM_DRUMS[note];
      return gm?.inst === own ? gm : { inst: own };
    }
    return GM_DRUMS[note] ?? null;
  }

  /** Assigns a note to a drum (a note plays one drum only). */
  assign(note: number, inst: Inst) {
    this.custom = { ...this.custom, [note]: inst };
  }

  /** Every note currently meaning a drum. */
  notesFor(inst: Inst): number[] {
    const out = new Set<number>();
    for (let n = 0; n < 128; n++) if (this.lookup(n)?.inst === inst) out.add(n);
    return [...out].sort((a, b) => a - b);
  }
}

/** The pedal's position from CC 4: 0 is fully open and 127 fully closed on nearly every kit. */
export function hatMods(cc4: number | null, noteMods: Mod[] = []): Mod[] {
  if (cc4 === null) return noteMods;
  const rest = noteMods.filter((m) => m !== 'open' && m !== 'halfOpen' && m !== 'closed');
  if (cc4 >= 100) return [...rest, 'closed'];
  if (cc4 >= 45) return [...rest, 'halfOpen'];
  return [...rest, 'open'];
}

/** Velocity (1–127) as the app's loudness scale: 0.2 ghost … 1 accent. */
export function velocityLevel(velocity: number) {
  return Math.max(0.12, Math.min(1.15, (velocity / 127) * 1.1));
}

/** The hit the app would play for a pad stroke. */
export function hitFor(info: PadInfo, cc4: number | null): Hit {
  const mods = info.mods ?? [];
  return { inst: info.inst, mods: info.inst === 'hihat' ? hatMods(cc4, mods) : [...mods] };
}

export function noteName(note: number) {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  // Middle C (60) is C4, as most drum module manuals write it.
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}
