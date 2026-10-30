import { HEADS, type HeadKind } from './glyphs';
import { INSTRUMENTS, type Inst, type Voice } from './instruments';
import { measureSlots } from './meter';

export type Mod =
  | 'accent'
  | 'marcato'
  | 'ghost'
  | 'flam'
  | 'drag'
  | 'rimshot'
  | 'crossStick'
  | 'buzz'
  | 'roll'
  | 'open'
  | 'halfOpen'
  | 'closed'
  | 'choke';

export interface Hit {
  inst: Inst;
  mods: Mod[];
}

export interface Measure {
  /** Hits keyed by sixteenth-note slot within the measure. */
  hits: Map<number, Hit[]>;
}

export interface Score {
  beats: number;
  beatUnit: number;
  /** Number of sixteenth-note slots per measure. */
  slots: number;
  /** Eighth-note grouping for odd eighth-note meters, e.g. [2, 2, 3] for 7/8. */
  grouping?: number[];
  measures: Measure[];
  repeat: boolean;
}

export type Track = 'hh' | 'hf' | 'sn' | 'bd' | 't1' | 't2' | 'ft' | 'rd' | 'cr' | 'ch' | 'cb';

export interface ScoreSpec {
  time?: [number, number];
  /** Eighth-note grouping for odd eighth-note meters, e.g. [2, 2, 3] for 7/8. */
  grouping?: number[];
  /** Characters per quarter note in the bar strings: 1 = quarters, 2 = eighths, 4 = sixteenths. */
  grid?: 1 | 2 | 4;
  repeat?: boolean;
  bars: Partial<Record<Track, string>>[];
}

const TRACKS: Record<Track, Inst> = {
  hh: 'hihat',
  hf: 'hihatFoot',
  sn: 'snare',
  bd: 'kick',
  t1: 'tom1',
  t2: 'tom2',
  ft: 'floorTom',
  rd: 'ride',
  cr: 'crash',
  ch: 'china',
  cb: 'cowbell',
};

/**
 * Character legend for bar strings:
 *  - / .  nothing        x  normal hit       X >  accent      ^  marcato
 *  g  ghost note         f  flam             F  accented flam d  drag
 *  r  rimshot            c  cross-stick      z  buzz roll     R  single-stroke roll
 *  o  open hi-hat        O  accented open    h  half-open     +  closed
 *  k  choke              b  bell (ride track)
 */
const CHAR_MODS: Record<string, Mod[]> = {
  x: [],
  X: ['accent'],
  '>': ['accent'],
  '^': ['marcato'],
  g: ['ghost'],
  f: ['flam'],
  F: ['flam', 'accent'],
  d: ['drag'],
  r: ['rimshot'],
  c: ['crossStick'],
  z: ['buzz'],
  R: ['roll'],
  o: ['open'],
  O: ['open', 'accent'],
  h: ['halfOpen'],
  '+': ['closed'],
  k: ['choke'],
  b: [],
};

export function parseScore(spec: ScoreSpec): Score {
  const [beats, beatUnit] = spec.time ?? [4, 4];
  const grid = spec.grid ?? 4;
  const slots = measureSlots(beats, beatUnit);
  const step = 4 / grid;
  const chars = slots / step;
  if (spec.grouping && spec.grouping.reduce((a, n) => a + n, 0) * 2 !== slots) {
    throw new Error(`Grouping ${spec.grouping.join('+')} doesn't fill ${beats}/${beatUnit}`);
  }
  const measures: Measure[] = spec.bars.map((bar, bi) => {
    const hits = new Map<number, Hit[]>();
    for (const [track, raw] of Object.entries(bar) as [Track, string][]) {
      const str = raw.replace(/[\s|]/g, '');
      if (str.length !== chars) {
        throw new Error(`Bar ${bi + 1} track ${track}: expected ${chars} chars, got ${str.length}`);
      }
      [...str].forEach((ch, i) => {
        if (ch === '-' || ch === '.') return;
        const mods = CHAR_MODS[ch];
        if (!mods) throw new Error(`Unknown notation character "${ch}"`);
        let inst = TRACKS[track];
        if (track === 'rd' && ch === 'b') inst = 'rideBell';
        const slot = i * step;
        const list = hits.get(slot) ?? [];
        list.push({ inst, mods: [...mods] });
        hits.set(slot, list);
      });
    }
    return { hits };
  });
  return { beats, beatUnit, slots, grouping: spec.grouping, measures, repeat: !!spec.repeat };
}

export function voiceOf(hit: Hit): Voice {
  return INSTRUMENTS[hit.inst].voice;
}

export function headOf(hit: Hit): HeadKind {
  if (hit.mods.includes('crossStick')) return 'x';
  if (hit.mods.includes('rimshot')) return 'slashed';
  return INSTRUMENTS[hit.inst].head;
}

export function headWidth(hit: Hit): number {
  return HEADS[headOf(hit)].width;
}
